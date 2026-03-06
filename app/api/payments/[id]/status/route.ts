import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getPaymentStatus } from '@/lib/payments/payunit';
import {
  finalizeFailedPayment,
  finalizeSuccessfulPayment,
} from '@/lib/payments/finalize';

/**
 * GET /api/payments/[id]/status
 *
 * Returns the current status of a payment transaction.
 * If still pending locally, polls Payunit to sync the latest status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const serviceSupabase = createServiceSupabaseClient();

    const fetchTransaction = async () => {
      const { data, error } = await serviceSupabase
        .from('transactions')
        .select(
          'id, status, amount, currency, provider_reference, created_at, updated_at, plan_id, discount_amount, original_amount, payment_phone, job_id, metadata, pricing_plans(slug, name, plan_type)'
        )
        .eq('id', params.id)
        .eq('user_id', user.id)
        .single();
      return { data, error };
    };

    const { data: transaction, error } = await fetchTransaction();

    if (error || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // If still pending and we have a Payunit reference, poll Payunit.
    if (transaction.status === 'pending' && transaction.provider_reference) {
      try {
        const payunitStatus = await getPaymentStatus(transaction.provider_reference);
        const status = (payunitStatus.transaction_status || '').toUpperCase();

        if (status === 'SUCCESS') {
          await finalizeSuccessfulPayment({
            transactionId: transaction.id,
            payunitTransactionId: transaction.provider_reference,
            gateway: payunitStatus.gateway || null,
            amount: payunitStatus.amount,
            currency: payunitStatus.currency,
            source: 'status_poll',
          });
        } else if (status === 'FAILED' || status === 'CANCELLED') {
          await finalizeFailedPayment({
            transactionId: transaction.id,
            payunitTransactionId: transaction.provider_reference,
            gateway: payunitStatus.gateway || null,
            reason: 'Payment failed during status polling',
            status: status as 'FAILED' | 'CANCELLED',
            source: 'status_poll',
          });
        }
      } catch {
        // Payunit polling failed; return local status and let next retry recover.
      }
    }

    const { data: latestTransaction, error: latestError } = await fetchTransaction();

    if (latestError || !latestTransaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const plan = Array.isArray(latestTransaction.pricing_plans)
      ? latestTransaction.pricing_plans[0]
      : latestTransaction.pricing_plans;

    const metadata =
      latestTransaction.metadata && typeof latestTransaction.metadata === 'object'
        ? (latestTransaction.metadata as Record<string, unknown>)
        : {};

    const addOnSlugs = Array.isArray(metadata.add_on_slugs)
      ? metadata.add_on_slugs.filter((value): value is string => typeof value === 'string')
      : [];

    return NextResponse.json({
      transaction_id: latestTransaction.id,
      status: latestTransaction.status,
      amount: latestTransaction.amount,
      currency: latestTransaction.currency,
      original_amount: latestTransaction.original_amount,
      discount_amount: latestTransaction.discount_amount,
      created_at: latestTransaction.created_at,
      updated_at: latestTransaction.updated_at,
      plan_slug: plan?.slug ?? null,
      plan_name: plan?.name ?? null,
      plan_type: plan?.plan_type ?? null,
      payment_phone: latestTransaction.payment_phone ?? null,
      job_id: latestTransaction.job_id ?? null,
      add_on_slugs: addOnSlugs,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
