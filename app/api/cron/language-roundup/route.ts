import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import {
  generateLanguageRoundup,
  type RoundupLanguage,
} from '@/lib/whatsapp-agent/language-roundup';
import { sendAdminWhatsAppAlert } from '@/lib/admin-alerts';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FORWARD_HINT: Record<RoundupLanguage, string> = {
  en: '⬇️ Forward the next message into the ENGLISH WhatsApp group:',
  fr: '⬇️ Transférez le prochain message dans le groupe WhatsApp FRANCOPHONE :',
};

/**
 * Daily language roundup (see vercel.json).
 *
 * Composes one digest of yesterday's published jobs per language cohort
 * (EN / FR — the group strategy is language-based, not town-based) and sends
 * each to the admin forwarders as two messages: a forward hint, then the
 * clean digest ready to forward into the matching community group.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, { jobs: number; sent: boolean; message: string }> = {};

  try {
    for (const language of ['en', 'fr'] as RoundupLanguage[]) {
      const roundup = await generateLanguageRoundup({ language, days: 1, limit: 10 });

      let sent = false;
      if (roundup.jobs.length > 0) {
        await sendAdminWhatsAppAlert(FORWARD_HINT[language]);
        const delivery = await sendAdminWhatsAppAlert(roundup.message);
        sent = delivery.sent > 0;
      }

      results[language] = {
        jobs: roundup.jobs.length,
        sent,
        message: roundup.message,
      };
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[cron language-roundup] Error:', err);
    return NextResponse.json(
      { error: 'Language roundup failed', details: String(err) },
      { status: 500 },
    );
  }
}
