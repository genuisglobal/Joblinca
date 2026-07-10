/**
 * Notify a recruiter about their job posting via WhatsApp.
 *
 * Uses the recruiter's linked WhatsApp lead (wa_leads.linked_user_id) — the
 * channel they already opted into by talking to the Joblinca agent. Fully
 * best-effort: returns false (never throws) when the recruiter has no linked
 * WhatsApp or sending fails, so approval flows never break on notification.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendText } from '@/lib/whatsapp';

export async function notifyRecruiterViaWhatsApp(
  supabase: SupabaseClient,
  recruiterUserId: string | null | undefined,
  message: string
): Promise<boolean> {
  if (!recruiterUserId) return false;

  try {
    const { data: lead } = await supabase
      .from('wa_leads')
      .select('phone_e164')
      .eq('linked_user_id', recruiterUserId)
      .limit(1)
      .maybeSingle();

    if (!lead?.phone_e164) return false;

    await sendText(lead.phone_e164, message);
    return true;
  } catch (err) {
    console.error('[recruiter-notify] WhatsApp notification failed (non-fatal):', err);
    return false;
  }
}
