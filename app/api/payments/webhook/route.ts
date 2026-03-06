import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  finalizeFailedPayment,
  finalizeSuccessfulPayment,
} from '@/lib/payments/finalize';

/**
 * POST /api/payments/webhook
 *
 * Payunit calls this endpoint when a payment status changes.
 * The payload includes: data.transaction_id, data.transaction_status, etc.
 *
 * On SUCCESSFUL payment:
 *   - Update transaction status to completed
 *   - If subscription plan: create/extend subscription
 *   - If recruiter verification: update verification_status
 *   - If job tier: update job hiring_tier, is_featured, social_promotion
 *   - If promo code: increment uses + insert redemption
 *
 * On FAILED payment:
 *   - Update transaction status to failed
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    if (payunitTransactionId) {
      const { data: txByRef } = await supabase
        .from('transactions')
        .select('id')
        .eq('provider_reference', payunitTransactionId)
        .maybeSingle();
      if (txByRef?.id) {
        transactionId = txByRef.id;
      }
    }

    if (!transactionId && payunitTransactionId) {
      const { data: txById } = await supabase
        .from('transactions')
        .select('id')
        .eq('id', payunitTransactionId)
        .maybeSingle();
      if (txById?.id) {
        transactionId = txById.id;
      }
    }

    if (!transactionId) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
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
