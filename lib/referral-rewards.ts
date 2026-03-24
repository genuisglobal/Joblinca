/**
 * Referral rewards system.
 *
 * When a referred user completes their first subscription payment,
 * the referrer receives bonus subscription days as a reward.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isEmailDeliveryConfigured, sendReferralRewardEmail } from '@/lib/messaging/email';

const REWARD_DAYS = 7;

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Grant referral reward to the referrer when a referred user makes their first payment.
 * Should be called after a successful subscription payment finalization.
 */
export async function grantReferralReward(referredUserId: string): Promise<{
  granted: boolean;
  reason: string;
}> {
  const supabase = createServiceSupabaseClient();

  // 1. Check if user was referred by someone
  const { data: profile } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', referredUserId)
    .maybeSingle();

  if (!profile?.referred_by) {
    return { granted: false, reason: 'User was not referred' };
  }

  const referrerId = profile.referred_by;

  // 2. Check if reward was already granted for this pair
  const { data: existingReward } = await supabase
    .from('referral_rewards')
    .select('id')
    .eq('referrer_id', referrerId)
    .eq('referred_id', referredUserId)
    .maybeSingle();

  if (existingReward) {
    return { granted: false, reason: 'Reward already granted' };
  }

  // 3. Check if the referred user has completed at least one payment
  const { count: paymentCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', referredUserId)
    .eq('status', 'completed');

  if (!paymentCount || paymentCount < 1) {
    return { granted: false, reason: 'Referred user has no completed payments' };
  }

  // 4. Create the reward record
  const { error: rewardError } = await supabase.from('referral_rewards').insert({
    referrer_id: referrerId,
    referred_id: referredUserId,
    reward_type: 'subscription_days',
    reward_value: REWARD_DAYS,
    status: 'granted',
    granted_at: new Date().toISOString(),
  });

  if (rewardError) {
    // Unique constraint violation means already granted (race condition)
    if (rewardError.code === '23505') {
      return { granted: false, reason: 'Reward already granted' };
    }
    throw new Error(`Failed to create reward: ${rewardError.message}`);
  }

  // 5. Extend referrer's subscription by REWARD_DAYS
  const { data: referrerSub } = await supabase
    .from('subscriptions')
    .select('id, end_date')
    .eq('user_id', referrerId)
    .eq('status', 'active')
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (referrerSub?.end_date) {
    const currentEnd = new Date(referrerSub.end_date);
    const now = new Date();
    const baseDate = currentEnd > now ? currentEnd : now;
    const newEnd = new Date(baseDate);
    newEnd.setDate(newEnd.getDate() + REWARD_DAYS);

    await supabase
      .from('subscriptions')
      .update({ end_date: formatDateOnly(newEnd) })
      .eq('id', referrerSub.id);
  }

  // 6. Create in-app notification for the referrer
  try {
    await supabase.from('user_notifications').insert({
      user_id: referrerId,
      type: 'referral_reward',
      title: 'Referral Reward Earned!',
      body: `You earned ${REWARD_DAYS} bonus days because someone you referred subscribed to Joblinca.`,
      metadata: { referred_id: referredUserId, reward_days: REWARD_DAYS },
    });
  } catch {
    // Non-critical
  }

  // 7. Send email notification to referrer
  if (isEmailDeliveryConfigured()) {
    try {
      const { data: referrerProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', referrerId)
        .maybeSingle();

      if (referrerProfile?.email) {
        await sendReferralRewardEmail({
          to: referrerProfile.email,
          userName: (referrerProfile.full_name || '').split(/\s+/)[0] || 'there',
          rewardDays: REWARD_DAYS,
        });
      }
    } catch {
      // Non-critical
    }
  }

  return { granted: true, reason: `Granted ${REWARD_DAYS} bonus days` };
}
