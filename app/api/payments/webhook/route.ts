import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  finalizeFailedPayment,
  finalizeSuccessfulPayment,
} from '@/lib/payments/finalize';
import { createHmac } from 'crypto';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

/**
 * Verify the webhook signature from PayUnit.
 *
 * PayUnit signs webhook payloads using HMAC-SHA256 with the shared secret.
 * The signature is sent in the `x-payunit-signature` header.
 *
 * If PAYUNIT_WEBHOOK_SECRET is not configured, ALL requests are rejected
 * (fail-closed security posture).
 */
function verifyPayunitSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const expectedSignature = createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signatureHeader, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) return false;

  let mismatch = 0;
  for (let i = 0; i < sigBuffer.length; i++) {
    mismatch |= sigBuffer[i] ^ expectedBuffer[i];
  }
  return mismatch === 0;
}

/**
 * POST /api/payments/webhook
 *
 * Payunit calls this endpoint when a payment status changes.
 * The payload includes: data.transaction_id, data.transaction_status, etc.
 *
 * Security:
 *   - Request signature is verified using HMAC-SHA256 (PAYUNIT_WEBHOOK_SECRET)
 *   - Idempotent: duplicate webhook deliveries are handled gracefully
 *
 * On SUCCESSFUL payment:
 *   - Update transaction status to completed
 *   - If subscription plan: create/extend subscription
 *   - If recruiter verification: update verification_status
 *   - If job tier: update job hiring_tier and featured status
 *   - If promo code: increment uses + insert redemption
 *
 * On FAILED payment:
 *   - Update transaction status to failed
 */
export async function POST(request: NextRequest) {
  try {
    // ── Rate limit: 60 webhook calls per minute per IP ──────────────────
    const webhookLimit = await rateLimit(
      `webhook:${getRateLimitIdentifier(request)}`,
      { requests: 60, window: '1m' }
    );
    if (!webhookLimit.allowed) return webhookLimit.response!;

    // ── Signature verification ──────────────────────────────────────────
    const webhookSecret = (process.env.PAYUNIT_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) {
      console.error('[payments/webhook] PAYUNIT_WEBHOOK_SECRET is not configured — rejecting');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-payunit-signature');

    if (!verifyPayunitSignature(rawBody, signature, webhookSecret)) {
      console.warn('[payments/webhook] Invalid signature — rejecting request');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);
    const data = (body?.data || {}) as Record<string, unknown>;
    const payunitStatus = (
      (data.transaction_status as string) ||
      (body?.status as string) ||
      ''
    ).toUpperCase();
    const payunitTransactionId =
      (data.transaction_id as string) ||
      (body?.transaction_id as string) ||
      (body?.external_reference as string) ||
      (body?.reference as string);
    const gateway =
      (data.gateway as string) || (body?.gateway as string);

    const supabase = createServiceSupabaseClient();

    // Find the transaction by provider_reference or internal transaction ID
    let transactionId: string | null = null;
    let currentStatus: string | null = null;

    if (payunitTransactionId) {
      const { data: txByRef } = await supabase
        .from('transactions')
        .select('id, status')
        .eq('provider_reference', payunitTransactionId)
        .maybeSingle();
      if (txByRef?.id) {
        transactionId = txByRef.id;
        currentStatus = txByRef.status;
      }
    }

    if (!transactionId && payunitTransactionId) {
      const { data: txById } = await supabase
        .from('transactions')
        .select('id, status')
        .eq('id', payunitTransactionId)
        .maybeSingle();
      if (txById?.id) {
        transactionId = txById.id;
        currentStatus = txById.status;
      }
    }

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // ── Idempotency: skip if transaction is already in a terminal state ──
    if (currentStatus === 'completed' || currentStatus === 'failed') {
      return NextResponse.json(
        { message: `Transaction already ${currentStatus} — skipping` },
        { status: 200 }
      );
    }

    if (payunitStatus === 'SUCCESS') {
      await finalizeSuccessfulPayment({
        transactionId,
        payunitTransactionId,
        gateway,
        amount: data.amount || body?.amount,
        currency: data.currency || body?.currency,
        tId: data.t_id,
        paymentStatus: data.payment_status,
        source: 'webhook',
      });

      return NextResponse.json({ message: 'Payment processed successfully' }, { status: 200 });
    }

    if (payunitStatus === 'FAILED' || payunitStatus === 'CANCELLED') {
      const failureReason =
        (data.failure_reason as string) ||
        (body?.message as string) ||
        (body?.reason as string) ||
        'Payment failed';

      await finalizeFailedPayment({
        transactionId,
        payunitTransactionId,
        gateway,
        reason: failureReason,
        status: payunitStatus as 'FAILED' | 'CANCELLED',
        source: 'webhook',
      });

      return NextResponse.json({ message: 'Payment failure recorded' }, { status: 200 });
    }

    // For PENDING or other statuses, just acknowledge
    return NextResponse.json({ message: 'Webhook received' }, { status: 200 });
  } catch (err: unknown) {
    console.error('Webhook processing error:', err);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
