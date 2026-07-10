/**
 * Generic admin WhatsApp alerts (job approvals, moderation, etc.).
 *
 * Recipients come from ADMIN_ALERT_WHATSAPP (comma-separated E.164 numbers),
 * falling back to AGGREGATION_ALERT_WHATSAPP so one configured variable
 * covers both. Degrades gracefully: when unset or WhatsApp credentials are
 * missing, the alert is logged and skipped — callers never fail because
 * alerting is off.
 */

import { sendText } from '@/lib/whatsapp';

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
