/**
 * Subscription status utilities.
 *
 * Used to gate premium features behind active subscriptions.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';

export interface UserSubscription {
  isActive: boolean;
  plan: {
    id: string;
    slug: string;
    name: string;
    role: string;
    plan_type: string;
    features: unknown[];
  } | null;
  expiresAt: string | null;
  daysRemaining: number;
  subscriptionId: string | null;
  autoRenew: boolean;
}

/**
 * Get the current user's active subscription (if any).
 */
export async function getUserSubscription(
  userId: string
): Promise<UserSubscription> {
  const supabase = createServiceSupabaseClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: sub } = await supabase
    .from('subscriptions')
    .select(
      `
      id,
      status,
      end_date,
      plan_id,
      auto_renew,
      pricing_plans (
        id,
        slug,
        name,
        role,
        plan_type,
        features
      )
    `
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`end_date.gte.${today},end_date.is.null`)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub || !sub.pricing_plans) {
    return {
      isActive: false,
      plan: null,
      expiresAt: null,
      daysRemaining: 0,
      subscriptionId: null,
      autoRenew: false,
    };
  }

  let daysRemaining = 0;
  if (sub.end_date) {
    const endDate = new Date(sub.end_date);
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }

  // pricing_plans comes back as an object (single FK join)
  const plan = sub.pricing_plans as unknown as {
    id: string;
    slug: string;
    name: string;
    role: string;
    plan_type: string;
    features: unknown[];
  };

  return {
    isActive: true,
    plan,
    expiresAt: sub.end_date,
    daysRemaining,
    subscriptionId: sub.id,
    autoRenew: sub.auto_renew ?? false,
  };
}

/**
 * Throws an error if the user does not have an active subscription
 * for the given role.
 */
export async function requireActiveSubscription(
  userId: string,
  role: string
): Promise<UserSubscription> {
  const sub = await getUserSubscription(userId);

  if (!sub.isActive) {
    throw new Error('An active subscription is required to access this feature');
  }

  if (sub.plan && sub.plan.role !== role) {
    throw new Error(`An active ${role} subscription is required`);
  }

  return sub;
}
