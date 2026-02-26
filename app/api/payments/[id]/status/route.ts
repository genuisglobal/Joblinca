import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getPaymentStatus } from '@/lib/payments/payunit';

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

    // Fetch the transaction
    const { data: transaction, error } = await serviceSupabase
      .from('transactions')
      .select('id, status, amount, currency, provider_reference, created_at, updated_at, plan_id, discount_amount, original_amount')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // If still pending and we have a Payunit reference, poll Payunit
    if (transaction.status === 'pending' && transaction.provider_reference) {
      try {
        const payunitStatus = await getPaymentStatus(
          transaction.provider_reference
        );
        const status = (payunitStatus.transaction_status || '').toUpperCase();

        if (status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED') {
          // Trigger webhook-like processing by calling our own webhook endpoint internally
          // For simplicity, we just update the status here
          const newStatus = status === 'SUCCESS' ? 'completed' : 'failed';

          if (newStatus !== transaction.status) {
            await serviceSupabase
              .from('transactions')
              .update({ status: newStatus })
              .eq('id', transaction.id);

            transaction.status = newStatus;

            // If successful and not yet processed by webhook, trigger webhook processing
            if (newStatus === 'completed') {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
              fetch(`${appUrl}/api/payments/webhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  data: {
                    transaction_id: transaction.provider_reference,
                    transaction_status: 'SUCCESS',
                    gateway: payunitStatus.gateway,
                    amount: payunitStatus.amount,
                    currency: payunitStatus.currency,
                  },
                }),
              }).catch(() => {
                // Fire-and-forget; webhook will handle the rest
              });
            }
          }
        }
      } catch {
        // Payunit polling failed; return local status
      }
    }

    return NextResponse.json({
      transaction_id: transaction.id,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      original_amount: transaction.original_amount,
      discount_amount: transaction.discount_amount,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
