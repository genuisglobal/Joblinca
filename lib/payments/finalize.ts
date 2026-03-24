import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { grantReferralReward } from '@/lib/referral-rewards';

type FinalizeSource = 'webhook' | 'status_poll';

interface FinalizeSuccessParams {
  transactionId: string;
  payunitTransactionId?: string | null;
  gateway?: string | null;
  amount?: unknown;
  currency?: unknown;
  tId?: unknown;
  paymentStatus?: unknown;
  source: FinalizeSource;
}

interface FinalizeFailureParams {
  transactionId: string;
  payunitTransactionId?: string | null;
  gateway?: string | null;
  reason?: string | null;
  status: 'FAILED' | 'CANCELLED';
  source: FinalizeSource;
}

interface PricingPlanRecord {
  id: string;
  slug: string;
  role: string;
  plan_type: string;
  duration_days: number | null;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

function normalizePlan(input: unknown): PricingPlanRecord | null {
  if (!input) {
    return null;
  }

  const value = Array.isArray(input) ? input[0] : input;
  if (!value || typeof value !== 'object') {
    return null;
  }

  const plan = value as Record<string, unknown>;
  if (
    typeof plan.id !== 'string' ||
    typeof plan.slug !== 'string' ||
    typeof plan.role !== 'string' ||
    typeof plan.plan_type !== 'string'
  ) {
    return null;
  }

  return {
    id: plan.id,
    slug: plan.slug,
    role: plan.role,
    plan_type: plan.plan_type,
    duration_days:
      typeof plan.duration_days === 'number' ? plan.duration_days : null,
  };
}

async function applySubscriptionEffects(
  transaction: Record<string, unknown>,
  plan: PricingPlanRecord
) {
  const supabase = createServiceSupabaseClient();
  const transactionId = transaction.id as string;
  const userId = transaction.user_id as string;

  const { data: existingByTransaction } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('transaction_id', transactionId)
    .limit(1)
    .maybeSingle();
  const hasSubscriptionForTransaction = Boolean(existingByTransaction?.id);

  if (!hasSubscriptionForTransaction && plan.plan_type === 'subscription' && plan.duration_days) {
    const now = new Date();
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id, end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('end_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    let baseDate = now;
    if (
      existingSub?.end_date &&
      !Number.isNaN(new Date(existingSub.end_date).getTime()) &&
      new Date(existingSub.end_date) > now
    ) {
      baseDate = new Date(existingSub.end_date);
    }

    const endDate = new Date(baseDate);
    endDate.setDate(endDate.getDate() + plan.duration_days);

    if (
      existingSub?.id &&
      existingSub.end_date &&
      !Number.isNaN(new Date(existingSub.end_date).getTime()) &&
      new Date(existingSub.end_date) > now
    ) {
      await supabase
        .from('subscriptions')
        .update({
          end_date: formatDateOnly(endDate),
          plan_id: plan.id,
          transaction_id: transactionId,
        })
        .eq('id', existingSub.id);
    } else {
      await supabase.from('subscriptions').insert({
        user_id: userId,
        type: plan.slug,
        status: 'active',
        start_date: formatDateOnly(now),
        end_date: formatDateOnly(endDate),
        plan_id: plan.id,
        transaction_id: transactionId,
        auto_renew: false,
      });
    }
  }

  if (!hasSubscriptionForTransaction && plan.plan_type === 'one_time' && plan.role === 'recruiter') {
    await supabase.from('subscriptions').insert({
      user_id: userId,
      type: plan.slug,
      status: 'active',
      start_date: formatDateOnly(new Date()),
      end_date: null,
      plan_id: plan.id,
      transaction_id: transactionId,
      auto_renew: false,
    });
  }

  if (plan.role === 'recruiter') {
    await supabase
      .from('recruiter_profiles')
      .update({ verification_status: 'verified' })
      .eq('user_id', userId);
  }
}

async function applyJobTierEffects(
  transaction: Record<string, unknown>,
  plan: PricingPlanRecord
) {
  if (!transaction.job_id) {
    return;
  }

  const supabase = createServiceSupabaseClient();
  const metadata =
    transaction.metadata && typeof transaction.metadata === 'object'
      ? (transaction.metadata as Record<string, unknown>)
      : {};

  const addOnSlugs = Array.isArray(metadata.add_on_slugs)
    ? metadata.add_on_slugs.filter((item): item is string => typeof item === 'string')
    : [];

  const isFeatured = addOnSlugs.includes('job_tier1_featured');
  const socialPromotion = addOnSlugs.includes('job_tier1_social');
  const hiringTier =
    plan.slug === 'job_tier2_shortlist' ? 'tier2_shortlist' : 'tier1_diy';

  await supabase
    .from('jobs')
    .update({
      hiring_tier: hiringTier,
      tier_transaction_id: transaction.id,
      is_featured: isFeatured,
      social_promotion: socialPromotion,
    })
    .eq('id', transaction.job_id as string);
}

async function applyPromoRedemption(
  transaction: Record<string, unknown>
) {
  const promoCodeId = transaction.promo_code_id as string | null;
  const discountAmount = Number(transaction.discount_amount || 0);

  if (!promoCodeId || discountAmount <= 0) {
    return;
  }

  const supabase = createServiceSupabaseClient();
  const userId = transaction.user_id as string;
  const transactionId = transaction.id as string;

  const { data: existingRedemption } = await supabase
    .from('promo_code_redemptions')
    .select('id')
    .eq('promo_code_id', promoCodeId)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existingRedemption?.id) {
    return;
  }

  const { data: promoData } = await supabase
    .from('promo_codes')
    .select('current_uses')
    .eq('id', promoCodeId)
    .single();

  await supabase
    .from('promo_codes')
    .update({ current_uses: (promoData?.current_uses ?? 0) + 1 })
    .eq('id', promoCodeId);

  await supabase.from('promo_code_redemptions').insert({
    promo_code_id: promoCodeId,
    user_id: userId,
    transaction_id: transactionId,
    discount_applied: discountAmount,
  });
}

export async function finalizeSuccessfulPayment(params: FinalizeSuccessParams) {
  const supabase = createServiceSupabaseClient();

  const { data: transaction, error } = await supabase
    .from('transactions')
    .select(
      'id, user_id, status, provider_reference, callback_received_at, metadata, plan_id, job_id, promo_code_id, discount_amount, pricing_plans(id, slug, role, plan_type, duration_days)'
    )
    .eq('id', params.transactionId)
    .single();

  if (error || !transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status === 'completed') {
    return;
  }

  const meta =
    transaction.metadata && typeof transaction.metadata === 'object'
      ? (transaction.metadata as Record<string, unknown>)
      : {};

  const payunitMeta =
    meta.payunit && typeof meta.payunit === 'object'
      ? (meta.payunit as Record<string, unknown>)
      : {};

  const nowIso = new Date().toISOString();

  await supabase
    .from('transactions')
    .update({
      status: 'completed',
      callback_received_at: nowIso,
      provider_reference: params.payunitTransactionId || transaction.provider_reference,
      metadata: {
        ...meta,
        payunit: {
          ...payunitMeta,
          transaction_id: params.payunitTransactionId || payunitMeta.transaction_id,
          transaction_status: 'SUCCESS',
          gateway: params.gateway || payunitMeta.gateway,
          amount: params.amount ?? payunitMeta.amount,
          currency: params.currency ?? payunitMeta.currency,
          t_id: params.tId ?? payunitMeta.t_id,
          payment_status: params.paymentStatus ?? payunitMeta.payment_status,
          finalized_at: nowIso,
          finalized_from: params.source,
        },
      },
    })
    .eq('id', params.transactionId);

  const plan = normalizePlan(transaction.pricing_plans);
  if (plan) {
    if (plan.plan_type === 'subscription' || plan.plan_type === 'one_time') {
      await applySubscriptionEffects(transaction as Record<string, unknown>, plan);
    }

    if (plan.plan_type === 'per_job') {
      await applyJobTierEffects(transaction as Record<string, unknown>, plan);
    }
  }

  await applyPromoRedemption(transaction as Record<string, unknown>);

  // Grant referral reward if applicable (first payment triggers reward for referrer)
  try {
    await grantReferralReward(transaction.user_id as string);
  } catch (err) {
    console.error('Referral reward grant failed (non-blocking)', err);
  }
}

export async function finalizeFailedPayment(params: FinalizeFailureParams) {
  const supabase = createServiceSupabaseClient();

  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('id, status, provider_reference, metadata')
    .eq('id', params.transactionId)
    .single();

  if (error || !transaction) {
    throw new Error('Transaction not found');
  }

  const meta =
    transaction.metadata && typeof transaction.metadata === 'object'
      ? (transaction.metadata as Record<string, unknown>)
      : {};

  const payunitMeta =
    meta.payunit && typeof meta.payunit === 'object'
      ? (meta.payunit as Record<string, unknown>)
      : {};

  await supabase
    .from('transactions')
    .update({
      status: 'failed',
      callback_received_at: new Date().toISOString(),
      provider_reference: params.payunitTransactionId || transaction.provider_reference,
      metadata: {
        ...meta,
        payunit: {
          ...payunitMeta,
          transaction_id: params.payunitTransactionId || payunitMeta.transaction_id,
          transaction_status: params.status,
          gateway: params.gateway || payunitMeta.gateway,
          failure_reason: params.reason || payunitMeta.failure_reason,
          finalized_from: params.source,
        },
      },
    })
    .eq('id', params.transactionId);
}
