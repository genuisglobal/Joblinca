import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

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

    // Fetch the full transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, pricing_plans(*)')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Prevent double-processing (allow if completion came from polling without callback)
    if (transaction.status === 'completed' && transaction.callback_received_at) {
      return NextResponse.json({ message: 'Already processed' }, { status: 200 });
    }

    const meta = (transaction.metadata || {}) as Record<string, unknown>;
    const existingPayunit =
      (meta.payunit as Record<string, unknown> | undefined) || {};

    if (payunitStatus === 'SUCCESS') {
      // Update transaction to completed
      await supabase
        .from('transactions')
        .update({
          status: 'completed',
          callback_received_at: new Date().toISOString(),
          provider_reference:
            payunitTransactionId || transaction.provider_reference,
          metadata: {
            ...meta,
            payunit: {
              ...existingPayunit,
              transaction_id: payunitTransactionId,
              transaction_status: payunitStatus,
              gateway,
              amount: data.amount || body?.amount,
              currency: data.currency || body?.currency,
              t_id: data.t_id,
              payment_status: data.payment_status,
            },
          },
        })
        .eq('id', transactionId);

      const plan = transaction.pricing_plans;

      if (plan) {
        const planType = plan.plan_type;
        const planRole = plan.role;

        // --- Subscription plan ---
        if (planType === 'subscription' && plan.duration_days) {
          // Check for existing active subscription to extend
          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id, end_date')
            .eq('user_id', transaction.user_id)
            .eq('status', 'active')
            .order('end_date', { ascending: false })
            .limit(1)
            .maybeSingle();

          const startDate = new Date();
          let endDate: Date;

          if (existingSub && new Date(existingSub.end_date) > startDate) {
            // Extend from current end date
            endDate = new Date(existingSub.end_date);
          } else {
            endDate = new Date(startDate);
          }
          endDate.setDate(endDate.getDate() + plan.duration_days);

          if (existingSub && new Date(existingSub.end_date) > startDate) {
            // Extend existing subscription
            await supabase
              .from('subscriptions')
              .update({
                end_date: endDate.toISOString().split('T')[0],
                plan_id: plan.id,
                transaction_id: transactionId,
              })
              .eq('id', existingSub.id);
          } else {
            // Create new subscription
            await supabase.from('subscriptions').insert({
              user_id: transaction.user_id,
              type: plan.slug,
              status: 'active',
              start_date: startDate.toISOString().split('T')[0],
              end_date: endDate.toISOString().split('T')[0],
              plan_id: plan.id,
              transaction_id: transactionId,
              auto_renew: false,
            });
          }

          // Update recruiter verification if applicable
          if (planRole === 'recruiter') {
            let verificationStatus = 'verified';
            if (plan.slug === 'recruiter_basic') {
              verificationStatus = 'verified';
            }
            await supabase
              .from('recruiter_profiles')
              .update({ verification_status: verificationStatus })
              .eq('user_id', transaction.user_id);
          }
        }

        // --- One-time recruiter verification ---
        if (planType === 'one_time' && planRole === 'recruiter') {
          await supabase
            .from('recruiter_profiles')
            .update({ verification_status: 'verified' })
            .eq('user_id', transaction.user_id);

          // Create a subscription record for tracking (no expiry extension needed)
          await supabase.from('subscriptions').insert({
            user_id: transaction.user_id,
            type: plan.slug,
            status: 'active',
            start_date: new Date().toISOString().split('T')[0],
            end_date: null,
            plan_id: plan.id,
            transaction_id: transactionId,
          });
        }

        // --- Per-job tier ---
        if (planType === 'per_job' && transaction.job_id) {
          const addOnSlugs = (meta.add_on_slugs as string[]) || [];
          const isFeatured = addOnSlugs.includes('job_tier1_featured');
          const socialPromo = addOnSlugs.includes('job_tier1_social');

          let hiringTier = 'tier1_diy';
          if (plan.slug === 'job_tier2_shortlist') {
            hiringTier = 'tier2_shortlist';
          }

          await supabase
            .from('jobs')
            .update({
              hiring_tier: hiringTier,
              tier_transaction_id: transactionId,
              is_featured: isFeatured,
              social_promotion: socialPromo,
            })
            .eq('id', transaction.job_id);
        }
      }

      // --- Promo code redemption ---
      if (transaction.promo_code_id && transaction.discount_amount > 0) {
        // Increment usage count
        const { data: promoData } = await supabase
          .from('promo_codes')
          .select('current_uses')
          .eq('id', transaction.promo_code_id)
          .single();

        await supabase
          .from('promo_codes')
          .update({ current_uses: (promoData?.current_uses ?? 0) + 1 })
          .eq('id', transaction.promo_code_id);

        // Insert redemption record
        await supabase.from('promo_code_redemptions').insert({
          promo_code_id: transaction.promo_code_id,
          user_id: transaction.user_id,
          transaction_id: transactionId,
          discount_applied: transaction.discount_amount,
        });
      }

      return NextResponse.json({ message: 'Payment processed successfully' }, { status: 200 });
    }

    if (payunitStatus === 'FAILED' || payunitStatus === 'CANCELLED') {
      const failureReason =
        (data.failure_reason as string) ||
        (body?.message as string) ||
        (body?.reason as string) ||
        'Payment failed';

      await supabase
        .from('transactions')
        .update({
          status: 'failed',
          callback_received_at: new Date().toISOString(),
          provider_reference:
            payunitTransactionId || transaction.provider_reference,
          metadata: {
            ...meta,
            payunit: {
              ...existingPayunit,
              transaction_id: payunitTransactionId,
              transaction_status: payunitStatus,
              gateway,
              failure_reason: failureReason,
            },
          },
        })
        .eq('id', transactionId);

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
