/**
 * Subscription auto-renewal logic.
 *
 * Called by the renewal cron job to process subscriptions with
 * auto_renew=true that are expiring within the next 24 hours.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { initiateSubscriptionPayment } from '@/lib/payments';

interface RenewableSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  end_date: string;
  renewal_attempts: number;
  pricing_plans: {
    slug: string;
    name: string;
    duration_days: number | null;
  } | null;
  profiles: {
    full_name: string | null;
    phone: string | null;
  } | null;
}

interface RenewalResult {
  subscriptionId: string;
  userId: string;
  status: 'renewed' | 'failed' | 'skipped';
  reason?: string;
}

const MAX_RENEWAL_ATTEMPTS = 3;

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Find subscriptions eligible for auto-renewal:
 * - auto_renew = true
 * - status = 'active'
 * - end_date within the next 24 hours (or already expired within last 3 days)
 * - renewal_attempts < MAX_RENEWAL_ATTEMPTS
 */
export async function findRenewableSubscriptions(): Promise<RenewableSubscription[]> {
  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id, user_id, plan_id, end_date, renewal_attempts,
      pricing_plans (slug, name, duration_days),
      profiles:user_id (full_name, phone)
    `)
    .eq('auto_renew', true)
    .eq('status', 'active')
    .lte('end_date', formatDateOnly(tomorrow))
    .gte('end_date', formatDateOnly(threeDaysAgo))
    .lt('renewal_attempts', MAX_RENEWAL_ATTEMPTS)
    .limit(50);

  if (error) {
    throw new Error(`Failed to load renewable subscriptions: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...row,
    renewal_attempts: row.renewal_attempts ?? 0,
    pricing_plans: Array.isArray(row.pricing_plans)
      ? row.pricing_plans[0] ?? null
      : row.pricing_plans,
    profiles: Array.isArray(row.profiles)
      ? row.profiles[0] ?? null
      : row.profiles,
  })) as RenewableSubscription[];
}

/**
 * Attempt to renew a single subscription by initiating a payment.
 */
export async function renewSubscription(
  sub: RenewableSubscription
): Promise<RenewalResult> {
  const supabase = createServiceSupabaseClient();
  const plan = sub.pricing_plans;
  const phone = (sub.profiles as any)?.phone;

  if (!plan?.slug || !plan.duration_days) {
    return {
      subscriptionId: sub.id,
      userId: sub.user_id,
      status: 'skipped',
      reason: 'Missing plan info or non-renewable plan',
    };
  }

  if (!phone) {
    await supabase
      .from('subscriptions')
      .update({
        renewal_attempts: sub.renewal_attempts + 1,
        last_renewal_attempt_at: new Date().toISOString(),
        renewal_failure_reason: 'No payment phone on file',
      })
      .eq('id', sub.id);

    return {
      subscriptionId: sub.id,
      userId: sub.user_id,
      status: 'failed',
      reason: 'No payment phone on file',
    };
  }

  try {
    await initiateSubscriptionPayment({
      userId: sub.user_id,
      planSlug: plan.slug,
      phoneNumber: phone,
    });

    await supabase
      .from('subscriptions')
      .update({
        renewal_attempts: sub.renewal_attempts + 1,
        last_renewal_attempt_at: new Date().toISOString(),
        renewal_failure_reason: null,
      })
      .eq('id', sub.id);

    return {
      subscriptionId: sub.id,
      userId: sub.user_id,
      status: 'renewed',
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error';

    await supabase
      .from('subscriptions')
      .update({
        renewal_attempts: sub.renewal_attempts + 1,
        last_renewal_attempt_at: new Date().toISOString(),
        renewal_failure_reason: reason,
      })
      .eq('id', sub.id);

    return {
      subscriptionId: sub.id,
      userId: sub.user_id,
      status: 'failed',
      reason,
    };
  }
}

/**
 * Process all eligible auto-renewals.
 */
export async function processAutoRenewals(): Promise<{
  processed: number;
  renewed: number;
  failed: number;
  skipped: number;
  results: RenewalResult[];
}> {
  const subs = await findRenewableSubscriptions();
  const results: RenewalResult[] = [];

  for (const sub of subs) {
    const result = await renewSubscription(sub);
    results.push(result);
  }

  return {
    processed: results.length,
    renewed: results.filter((r) => r.status === 'renewed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    results,
  };
}
