/**
 * Generic admin WhatsApp alerts (job approvals, moderation, etc.).
 *
 * Recipients come from ADMIN_ALERT_WHATSAPP (comma-separated E.164 numbers),
 * falling back to AGGREGATION_ALERT_WHATSAPP so one configured variable
 * covers both. Degrades gracefully: when unset or WhatsApp credentials are
 * missing, the alert is logged and skipped — callers never fail because
 * alerting is off.
 */

import { sendTemplate, sendText } from '@/lib/whatsapp';
import { sendTemplateWithFallback, type TemplateKey } from '@/lib/messaging/wa-templates';

export interface AdminAlertResult {
  configured: boolean;
  sent: number;
  failed: number;
}

function getRecipients(): string[] {
  const raw =
    process.env.ADMIN_ALERT_WHATSAPP || process.env.AGGREGATION_ALERT_WHATSAPP || '';
  return raw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Whether a phone is one of the admin alert recipients. Used to accept admin
 * commands (REPLY / RESUME) sent to the business number; inbound numbers are
 * trustworthy because the webhook verifies Meta's signature.
 */
export function isAdminAlertRecipient(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 0 && getRecipients().some((r) => r.replace(/\D/g, '') === digits);
}

/**
 * Alert every admin with an approved template, falling back per recipient to
 * the plain `fallbackText`. Plain text only reaches admins who messaged the
 * business number in the last 24h; the template reaches them regardless.
 */
export async function sendAdminTemplateAlert(
  template: TemplateKey,
  body: string[],
  fallbackText: string
): Promise<AdminAlertResult> {
  const recipients = getRecipients();
  if (recipients.length === 0) {
    console.log('[admin-alerts] No alert recipients configured — alert logged only:\n' + fallbackText);
    return { configured: false, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const to of recipients) {
    const result = await sendTemplateWithFallback(
      { sendTemplate, sendText },
      { to, template, body, fallbackText }
    );
    if (result === 'failed') failed++;
    else sent++;
  }
  return { configured: true, sent, failed };
}

export async function sendAdminWhatsAppAlert(message: string): Promise<AdminAlertResult> {
  const recipients = getRecipients();

  if (recipients.length === 0) {
    console.log('[admin-alerts] No alert recipients configured — alert logged only:\n' + message);
    return { configured: false, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const to of recipients) {
    try {
      await sendText(to, message);
      sent++;
    } catch (err) {
      failed++;
      console.error(`[admin-alerts] Failed to send to ${to}:`, err);
    }
  }

  return { configured: true, sent, failed };
}
