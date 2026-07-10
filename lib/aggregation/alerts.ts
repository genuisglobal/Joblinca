/**
 * Admin alerting for the aggregation pipeline.
 *
 * Sends WhatsApp messages to the numbers in AGGREGATION_ALERT_WHATSAPP
 * (comma-separated, international format e.g. "+2376XXXXXXXX,+2376YYYYYYYY").
 * Degrades gracefully: when the env var or WhatsApp credentials are missing,
 * alerts are logged and skipped — callers never fail because alerting is off.
 */

import { sendText } from '@/lib/whatsapp';

export interface AlertDeliveryResult {
  configured: boolean;
  sent: number;
  failed: number;
  recipients: number;
}

function getAlertRecipients(): string[] {
  return (process.env.AGGREGATION_ALERT_WHATSAPP || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
}

export async function sendAggregationAlert(
  message: string
): Promise<AlertDeliveryResult> {
  const recipients = getAlertRecipients();

  if (recipients.length === 0) {
    console.log(
      '[aggregation-alerts] AGGREGATION_ALERT_WHATSAPP not set — alert logged only:\n' +
        message
    );
    return { configured: false, sent: 0, failed: 0, recipients: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const to of recipients) {
    try {
      await sendText(to, message);
      sent++;
    } catch (err) {
      failed++;
      console.error(`[aggregation-alerts] Failed to send to ${to}:`, err);
    }
  }

  return { configured: true, sent, failed, recipients: recipients.length };
}
