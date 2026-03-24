/**
 * Subscription expiry notification logic.
 *
 * Sends WhatsApp and in-app notifications to users whose subscriptions
 * are expiring within 3 days. Each user is notified at most once per
 * expiry window.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import { isEmailDeliveryConfigured, sendSubscriptionExpiryEmail } from '@/lib/messaging/email';

interface ExpiringSubscription {
  id: string;
  user_id: string;
  end_date: string;
  auto_renew: boolean;
  profiles: {
    full_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  pricing_plans: {
    name: string;
    slug: string;
  } | null;
}

interface NotifyResult {
  userId: string;
  whatsapp: boolean;
  inApp: boolean;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Find subscriptions expiring within the next 3 days that haven't
 * been notified yet (checked via user_notifications).
 */
export async function findExpiringSoonSubscriptions(): Promise<ExpiringSubscription[]> {
  const supabase = createServiceSupabaseClient();
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id, user_id, end_date, auto_renew,
      profiles:user_id (full_name, phone, email),
      pricing_plans (name, slug)
    `)
    .eq('status', 'active')
    .gte('end_date', formatDateOnly(now))
    .lte('end_date', formatDateOnly(threeDaysLater))
    .limit(100);

  if (error) {
    throw new Error(`Failed to load expiring subscriptions: ${error.message}`);
  }

  return (data || []).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles)
      ? row.profiles[0] ?? null
      : row.profiles,
    pricing_plans: Array.isArray(row.pricing_plans)
      ? row.pricing_plans[0] ?? null
      : row.pricing_plans,
  })) as ExpiringSubscription[];
}

/**
 * Send expiry notification to a single user (WhatsApp + in-app).
 */
async function notifyUser(sub: ExpiringSubscription): Promise<NotifyResult> {
  const supabase = createServiceSupabaseClient();
  const profile = sub.profiles;
  const plan = sub.pricing_plans;
  const endDate = new Date(sub.end_date);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';

  const result: NotifyResult = {
    userId: sub.user_id,
    whatsapp: false,
    inApp: false,
  };

  // Check if we already notified this user for this subscription expiry
  const { data: existing } = await supabase
    .from('user_notifications')
    .select('id')
    .eq('user_id', sub.user_id)
    .eq('type', 'subscription_expiry')
    .gte('created_at', new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (existing) {
    return result; // Already notified recently
  }

  const firstName = (profile?.full_name || '').split(/\s+/)[0] || 'there';
  const planName = plan?.name || 'your subscription';
  const renewNote = sub.auto_renew
    ? 'Auto-renewal is enabled — no action needed.'
    : `Renew now to keep your access: ${appUrl}/billing`;

  // In-app notification
  try {
    await supabase.from('user_notifications').insert({
      user_id: sub.user_id,
      type: 'subscription_expiry',
      title: `Your ${planName} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
      body: sub.auto_renew
        ? 'Auto-renewal is enabled. Your subscription will be renewed automatically.'
        : `Visit your billing page to renew and keep your premium features.`,
      metadata: {
        subscription_id: sub.id,
        plan_slug: plan?.slug,
        days_left: daysLeft,
        auto_renew: sub.auto_renew,
      },
    });
    result.inApp = true;
  } catch {
    // Non-critical
  }

  // WhatsApp notification
  if (profile?.phone) {
    try {
      const message = [
        `Hi ${firstName}, your Joblinca ${planName} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`,
        renewNote,
      ].join('\n');

      await sendWhatsappMessage(profile.phone, message, sub.user_id);
      result.whatsapp = true;
    } catch {
      // WhatsApp send failure is non-critical
    }
  }

  // Email notification
  if (profile?.email && isEmailDeliveryConfigured()) {
    try {
      await sendSubscriptionExpiryEmail({
        to: profile.email,
        userName: firstName,
        planName,
        daysLeft,
        autoRenew: sub.auto_renew,
        billingUrl: `${appUrl}/dashboard/subscription`,
      });
    } catch {
      // Email send failure is non-critical
    }
  }

  return result;
}

/**
 * Process all expiring subscription notifications.
 */
export async function processExpiryNotifications(): Promise<{
  checked: number;
  notified: number;
  whatsappSent: number;
  results: NotifyResult[];
}> {
  const subs = await findExpiringSoonSubscriptions();
  const results: NotifyResult[] = [];

  for (const sub of subs) {
    const result = await notifyUser(sub);
    results.push(result);
  }

  return {
    checked: subs.length,
    notified: results.filter((r) => r.inApp || r.whatsapp).length,
    whatsappSent: results.filter((r) => r.whatsapp).length,
    results,
  };
}
