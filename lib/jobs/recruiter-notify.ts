/**
 * Notify a recruiter about their job posting via WhatsApp.
 *
 * Uses the recruiter's linked WhatsApp lead (wa_leads.linked_user_id) — the
 * channel they already opted into by talking to the Joblinca agent. Fully
 * best-effort: returns false (never throws) when the recruiter has no linked
 * WhatsApp or sending fails, so approval flows never break on notification.
 *
 * With `template` details the approved job_post_approved / job_post_rejected
 * template is tried first, so the notice arrives even when the recruiter has
 * not messaged us in the last 24h; `message` is the plain-text fallback (and
 * what is sent until Meta approves the template).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTemplate, sendText } from '@/lib/whatsapp';
import { sendTemplateWithFallback } from '@/lib/messaging/wa-templates';

export type RecruiterNoticeTemplate =
  | { kind: 'approved'; jobId: string; jobTitle: string; publicId: string | null }
  | { kind: 'rejected'; jobTitle: string; publicId: string | null; reason: string };

export async function notifyRecruiterViaWhatsApp(
  supabase: SupabaseClient,
  recruiterUserId: string | null | undefined,
  message: string,
  template?: RecruiterNoticeTemplate
): Promise<boolean> {
  if (!recruiterUserId) return false;

  try {
    const { data: lead } = await supabase
      .from('wa_leads')
      .select('phone_e164, language')
      .eq('linked_user_id', recruiterUserId)
      .limit(1)
      .maybeSingle();

    if (!lead?.phone_e164) return false;

    if (!template) {
      await sendText(lead.phone_e164, message);
      return true;
    }

    const ref = template.publicId || '-';
    const result = await sendTemplateWithFallback(
      { sendTemplate, sendText },
      template.kind === 'approved'
        ? {
            to: lead.phone_e164,
            template: 'jobPostApproved',
            language: lead.language,
            body: [template.jobTitle, ref],
            urlButtonSuffix: template.jobId,
            fallbackText: message,
          }
        : {
            to: lead.phone_e164,
            template: 'jobPostRejected',
            language: lead.language,
            body: [template.jobTitle, ref, template.reason],
            fallbackText: message,
          }
    );
    return result !== 'failed';
  } catch (err) {
    console.error('[recruiter-notify] WhatsApp notification failed (non-fatal):', err);
    return false;
  }
}
