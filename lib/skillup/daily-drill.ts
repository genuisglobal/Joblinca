/**
 * Daily WhatsApp drill — fan-out logic for active subscriptions.
 *
 * Strategy:
 *   - One question per (user, domain, drill_date). Enforced by the unique
 *     index on daily_drill_dispatches(user_id, drill_date, domain).
 *   - Question picker reuses the in-app practice queue: due/overdue items
 *     first, then never-attempted ones.
 *   - We require either a phone on the subscription itself OR a wa_leads row
 *     with linked_user_id matching the talent.
 *   - Question is sent as a plain WhatsApp text message rather than a
 *     template so we don't depend on an approved template at first launch.
 *     The actual switch to `daily_quiz_drill_v1` (approved Meta template)
 *     is a one-line swap once the template is live.
 */
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import { pickNextPracticeQuestion } from '@/lib/skillup/practice';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';

export interface DailyDrillRunResult {
  drill_date: string;
  subscriptions_processed: number;
  sent: number;
  skipped_already_sent: number;
  skipped_no_phone: number;
  skipped_no_question: number;
  failures: number;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  domain: string;
  phone_e164: string | null;
}

function doualaIsoDate(now: Date): string {
  // Africa/Douala is UTC+1 with no DST. Compute the local date as YYYY-MM-DD.
  const offsetHours = 1;
  const offsetMs = offsetHours * 60 * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs);
  return local.toISOString().slice(0, 10);
}

async function resolvePhoneForUser(
  db: ReturnType<typeof createServiceSupabaseClient>,
  userId: string,
  subscriptionPhone: string | null
): Promise<string | null> {
  if (subscriptionPhone) return subscriptionPhone;

  const { data: lead } = await db
    .from('wa_leads')
    .select('phone_e164')
    .eq('linked_user_id', userId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lead?.phone_e164) return lead.phone_e164;

  const { data: profile } = await db
    .from('profiles')
    .select('phone')
    .eq('id', userId)
    .maybeSingle();
  return profile?.phone || null;
}

export async function runDailyDrill(options: { now?: Date } = {}): Promise<DailyDrillRunResult> {
  const db = createServiceSupabaseClient();
  const now = options.now ?? new Date();
  const drillDate = doualaIsoDate(now);

  const result: DailyDrillRunResult = {
    drill_date: drillDate,
    subscriptions_processed: 0,
    sent: 0,
    skipped_already_sent: 0,
    skipped_no_phone: 0,
    skipped_no_question: 0,
    failures: 0,
  };

  const { data: subscriptions, error: subscriptionsError } = await db
    .from('daily_drill_subscriptions')
    .select('id, user_id, domain, phone_e164')
    .eq('active', true)
    .order('user_id', { ascending: true })
    .limit(2000);

  if (subscriptionsError) {
    throw new Error(`Failed to load drill subscriptions: ${subscriptionsError.message}`);
  }

  const subs = (subscriptions || []) as SubscriptionRow[];

  for (const sub of subs) {
    result.subscriptions_processed += 1;

    const { data: existing } = await db
      .from('daily_drill_dispatches')
      .select('id')
      .eq('user_id', sub.user_id)
      .eq('domain', sub.domain)
      .eq('drill_date', drillDate)
      .maybeSingle();
    if (existing) {
      result.skipped_already_sent += 1;
      continue;
    }

    const phone = await resolvePhoneForUser(db, sub.user_id, sub.phone_e164);
    if (!phone) {
      result.skipped_no_phone += 1;
      continue;
    }

    const { data: profile } = await db
      .from('profiles')
      .select('preferred_locale')
      .eq('id', sub.user_id)
      .maybeSingle();
    const locale = profile?.preferred_locale === 'fr' ? 'fr' : 'en';

    const question = await pickNextPracticeQuestion({
      userId: sub.user_id,
      domain: sub.domain,
      locale,
    });
    if (!question) {
      result.skipped_no_question += 1;
      continue;
    }

    const optionLines = question.options
      .map((opt, index) => `${String.fromCharCode(65 + index)}. ${opt}`)
      .join('\n');
    const practiceUrl = `${APP_BASE_URL}/dashboard/talent/practice`;
    const messageBody =
      locale === 'fr'
        ? `JobLinca - Question du jour (${sub.domain})\n\n${question.prompt}\n\n${optionLines}\n\nRépondez par A, B, C ou D. Ou ouvrez l'app: ${practiceUrl}`
        : `JobLinca - Daily Question (${sub.domain})\n\n${question.prompt}\n\n${optionLines}\n\nReply A, B, C, or D. Or open the app: ${practiceUrl}`;

    let sendOk = true;
    let sendError: string | null = null;
    try {
      await sendWhatsappMessage(phone, messageBody, sub.user_id);
    } catch (err) {
      sendOk = false;
      sendError = err instanceof Error ? err.message : 'unknown_send_error';
      result.failures += 1;
    }

    const { error: dispatchError } = await db
      .from('daily_drill_dispatches')
      .insert({
        user_id: sub.user_id,
        subscription_id: sub.id,
        challenge_id: question.challenge_id,
        question_id: question.question_id,
        domain: sub.domain,
        options: question.options,
        correct_index: question.correct_index,
        phone_e164: phone,
        delivery_channel: 'whatsapp_text',
        send_status: sendOk ? 'sent' : 'failed',
        send_error: sendError,
        drill_date: drillDate,
        metadata: {
          locale,
          challenge_title: question.challenge_title,
        },
      });

    if (dispatchError) {
      // The unique (user_id, drill_date, domain) constraint protects against
      // double-send races between concurrent crons. Treat conflict as skip.
      if ((dispatchError as { code?: string }).code === '23505') {
        if (sendOk) result.skipped_already_sent += 1;
        continue;
      }
      result.failures += 1;
      continue;
    }

    if (sendOk) result.sent += 1;
  }

  return result;
}
