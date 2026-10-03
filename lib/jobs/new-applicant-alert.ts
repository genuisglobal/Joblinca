/**
 * WhatsApp alert to a recruiter when someone applies to their job.
 *
 * Throttled per job: at most one alert per ALERT_WINDOW, claimed with a
 * single conditional update on jobs.last_applicant_alert_at so two
 * applications arriving together can't both send. The alert says how many
 * applications arrived since the previous one, so nothing is lost by
 * batching -- a busy job produces a few alerts a day, not one per applicant.
 *
 * Goes to the recruiter's linked WhatsApp lead only (the channel they opted
 * into by talking to the bot), via the new_applicant_alert template with a
 * plain-text fallback. Best-effort: never throws.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTemplate, sendText } from '@/lib/whatsapp';
import { sendTemplateWithFallback, type TemplateSenders } from '@/lib/messaging/wa-templates';

export const ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

export type NewApplicantAlertResult =
  | 'sent'
  | 'throttled'
  | 'no_whatsapp'
  | 'not_found'
  | 'failed';

interface ApplicationRow {
  id: string;
  job_id: string;
  applicant_id: string;
  is_draft: boolean | null;
  contact_info: { full_name?: string | null } | null;
}

interface JobRow {
  id: string;
  title: string | null;
  public_id: string | null;
  recruiter_id: string | null;
  last_applicant_alert_at: string | null;
}

export async function notifyRecruiterOfNewApplication(
  db: SupabaseClient,
  applicationId: string,
  options: {
    appUrl?: string;
    senders?: TemplateSenders;
    now?: number;
  } = {}
): Promise<NewApplicantAlertResult> {
  const now = options.now ?? Date.now();
  const appUrl = (options.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/+$/, '');

  try {
    const { data: application } = await db
      .from('applications')
      .select('id, job_id, applicant_id, is_draft, contact_info')
      .eq('id', applicationId)
      .maybeSingle();
    const app = application as ApplicationRow | null;
    if (!app || app.is_draft) return 'not_found';

    const { data: jobData } = await db
      .from('jobs')
      .select('id, title, public_id, recruiter_id, last_applicant_alert_at')
      .eq('id', app.job_id)
      .maybeSingle();
    const job = jobData as JobRow | null;
    if (!job?.recruiter_id) return 'not_found';

    const { data: lead } = await db
      .from('wa_leads')
      .select('phone_e164, language')
      .eq('linked_user_id', job.recruiter_id)
      .limit(1)
      .maybeSingle();
    if (!lead?.phone_e164) return 'no_whatsapp';

    // Claim this job's alert slot. Losing the race, or being inside the
    // window, means another alert already covers this application.
    const windowStart = new Date(now - ALERT_WINDOW_MS).toISOString();
    const previousAlertAt = job.last_applicant_alert_at;
    const { data: claimed, error: claimError } = await db
      .from('jobs')
      .update({ last_applicant_alert_at: new Date(now).toISOString() })
      .eq('id', job.id)
      .or(`last_applicant_alert_at.is.null,last_applicant_alert_at.lt.${windowStart}`)
      .select('id');
    if (claimError) {
      console.warn('[new-applicant-alert] could not claim alert slot', { jobId: job.id, error: claimError.message });
      return 'failed';
    }
    if (!claimed || claimed.length === 0) return 'throttled';

    // Everything submitted since the previous alert -- including applications
    // throttled inside its window, which this alert now reports. For a job's
    // first alert, only the last window: older applications predate alerts.
    const { count } = await db
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('is_draft', false)
      .gt('created_at', previousAlertAt ?? windowStart);
    const newCount = Math.max(1, count ?? 1);

    const fr = lead.language === 'fr';
    const title = job.title || (fr ? 'votre offre' : 'your job');
    const ref = job.public_id || job.id.slice(0, 8);
    const applicant = (app.contact_info?.full_name || '').trim() || (fr ? 'Un candidat' : 'A candidate');
    const reviewUrl = `${appUrl}/dashboard/recruiter/applications`;
    const others = newCount - 1;

    const fallbackText = fr
      ? `📥 Nouvelle candidature pour « ${title} » (${ref}) : ${applicant}${others > 0 ? ` et ${others} autre(s) depuis la dernière alerte` : ''}.\nVoir les candidatures : ${reviewUrl}`
      : `📥 New application for "${title}" (${ref}): ${applicant}${others > 0 ? ` and ${others} more since your last alert` : ''}.\nReview applications: ${reviewUrl}`;

    const result = await sendTemplateWithFallback(options.senders ?? { sendTemplate, sendText }, {
      to: lead.phone_e164,
      template: 'newApplicantAlert',
      language: lead.language,
      body: [title, ref, applicant, String(newCount)],
      fallbackText,
    });
    return result === 'failed' ? 'failed' : 'sent';
  } catch (error) {
    console.error('[new-applicant-alert] failed (non-fatal)', error);
    return 'failed';
  }
}
