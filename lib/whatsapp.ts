/**
 * WhatsApp Business Cloud API client.
 *
 * Handles outbound messaging (text + templates) and signature verification for
 * inbound webhooks. All network calls go through the Meta Graph API.
 *
 * Required environment variables:
 *   WHATSAPP_ACCESS_TOKEN   — permanent system-user token from Meta Business Suite
 *   WHATSAPP_PHONE_NUMBER_ID — the numeric phone-number-ID for your WABA
 *   WHATSAPP_APP_SECRET     — Meta App Secret (used for X-Hub-Signature-256)
 *   WHATSAPP_VERIFY_TOKEN   — arbitrary string you chose in the Meta webhook config
 *   WHATSAPP_API_VERSION    — optional, defaults to v22.0
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────────────

export const WA_API_VERSION =
  process.env.WHATSAPP_API_VERSION ?? 'v22.0';

export const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

// ─── Inbound webhook payload types ───────────────────────────────────────────

export interface WAWebhookEntry {
  id: string;
  changes: WAWebhookChange[];
}

export interface WAWebhookChange {
  value: WAWebhookValue;
  field: string;
}

export interface WAWebhookValue {
  messaging_product: 'whatsapp';
  metadata: { display_phone_number: string; phone_number_id: string };
  contacts?: WAContact[];
  messages?: WAInboundMessage[];
  statuses?: WAStatusUpdate[];
  errors?: WAError[];
}

export interface WAContact {
  profile: { name: string };
  wa_id: string; // E.164 without leading +
}

export interface WAInboundMessage {
  id: string; // wamid
  from: string; // wa_id (no +)
  timestamp: string; // unix epoch string
  type: WAMessageType;
  text?: { body: string };
  image?: WAMedia;
  audio?: WAMedia;
  video?: WAMedia;
  document?: WAMedia;
  sticker?: WAMedia;
  location?: WALocation;
  interactive?: WAInteractive;
  button?: { payload: string; text: string };
  context?: { from: string; id: string };
  referral?: { source_url: string; source_type: string; source_id: string; headline: string; body: string };
}

export type WAMessageType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'interactive'
  | 'button'
  | 'unsupported';

export interface WAMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface WALocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WAInteractive {
  type: 'button_reply' | 'list_reply';
  button_reply?: { id: string; title: string };
  list_reply?: { id: string; title: string; description?: string };
}

export interface WAStatusUpdate {
  id: string; // wamid
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; expiration_timestamp?: string; origin?: { type: string } };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: WAError[];
}

export interface WAError {
  code: number;
  title: string;
  message?: string;
  error_data?: { details: string };
}

export interface WAWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WAWebhookEntry[];
}

// ─── Outbound API response ────────────────────────────────────────────────────

export interface WASendResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

// ─── Template component types ─────────────────────────────────────────────────

export type WATemplateComponent =
  | { type: 'header'; parameters: WATemplateParam[] }
  | { type: 'body';   parameters: WATemplateParam[] }
  | { type: 'button'; sub_type: 'quick_reply' | 'url'; index: string; parameters: WATemplateParam[] };

export type WATemplateParam =
  | { type: 'text'; text: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } }
  | { type: 'image'; image: { link: string } };

// ─── Credential helpers ───────────────────────────────────────────────────────

function getCredentials() {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    throw new Error(
      'WhatsApp credentials not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'
    );
  }
  return { token, phoneId };
}

// ─── Outbound: send plain text ────────────────────────────────────────────────

export async function sendText(
  to: string,
  body: string,
  previewUrl = false
): Promise<WASendResponse> {
  const { token, phoneId } = getCredentials();
  const res = await fetch(`${WA_BASE_URL}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: previewUrl },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WA sendText failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<WASendResponse>;
}

// ─── Outbound: send approved template ────────────────────────────────────────

export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: WATemplateComponent[] = []
): Promise<WASendResponse> {
  const { token, phoneId } = getCredentials();
  const res = await fetch(`${WA_BASE_URL}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WA sendTemplate failed (${res.status}): ${err}`);
  }
  return res.json() as Promise<WASendResponse>;
}

// ─── Outbound: mark message as read ──────────────────────────────────────────

export async function markRead(waMessageId: string): Promise<void> {
  const { token, phoneId } = getCredentials();
  await fetch(`${WA_BASE_URL}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: waMessageId,
    }),
  });
  // Best-effort — don't throw on failure
}

// ─── Security: verify X-Hub-Signature-256 ────────────────────────────────────

/**
 * Verify that a webhook POST genuinely came from Meta.
 * Returns true if the signature is valid.
 *
 * @param rawBody   Raw request body bytes (read before parsing JSON)
 * @param signature The full value of the X-Hub-Signature-256 header (e.g. "sha256=abc…")
 */
export function verifySignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error('WHATSAPP_APP_SECRET is not set — cannot verify webhook signature');
    return false;
  }
  try {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const sigBuf  = Buffer.from(signature);
    const expBuf  = Buffer.from(expected);
    // timingSafeEqual requires identical lengths
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// ─── Convenience: extract text body from an inbound message ──────────────────

export function extractTextBody(msg: WAInboundMessage): string | null {
  switch (msg.type) {
    case 'text':        return msg.text?.body ?? null;
    case 'button':      return msg.button?.payload ?? null;
    case 'interactive': return (
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      null
    );
    default:            return null;
  }
}

// ─── Convenience: normalise phone to E.164 with leading + ─────────────────────

export function toE164(waId: string): string {
  return waId.startsWith('+') ? waId : `+${waId}`;
}
