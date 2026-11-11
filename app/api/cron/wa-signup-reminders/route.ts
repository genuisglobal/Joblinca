import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendWhatsappSelfSignupReminders } from '@/lib/field-registration/service';
import { sendWhatsappMessage, sendWhatsappTemplate } from '@/lib/messaging/whatsapp';
import { sendTemplateWithFallback } from '@/lib/messaging/wa-templates';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Daily (see vercel.json): remind people who asked the WhatsApp agent for an
 * account but never set a password. Uses the signup_link_reminder template
 * (the window has usually closed by then), falling back to text.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceSupabaseClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';

  try {
    const stats = await sendWhatsappSelfSignupReminders(db, {
      baseUrl,
      send: async (lead, claimUrl, rawToken) => {
        const { data: waLead } = await db
          .from('wa_leads')
          .select('language')
          .eq('phone_e164', lead.phone_e164)
          .maybeSingle();
        const language = waLead?.language === 'fr' ? 'fr' : 'en';
        const firstName = lead.full_name.split(/\s+/)[0] || lead.full_name;

        const result = await sendTemplateWithFallback(
          {
            sendTemplate: (to, name, lang, components) => sendWhatsappTemplate(to, name, lang, components),
            sendText: (to, text) => sendWhatsappMessage(to, text),
          },
          {
            to: lead.phone_e164,
            template: 'signupReminder',
            language,
            body: [firstName],
            urlButtonSuffix: encodeURIComponent(rawToken),
            fallbackText:
              language === 'fr'
                ? `Bonjour ${firstName}, votre compte JobLinca est presque prêt. Choisissez votre mot de passe ici :\n${claimUrl}`
                : `Hi ${firstName}, your JobLinca account is almost ready. Set your password here:\n${claimUrl}`,
          }
        );
        return result !== 'failed';
      },
    });

    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error('[cron/wa-signup-reminders] failed', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown_error' },
      { status: 500 }
    );
  }
}
