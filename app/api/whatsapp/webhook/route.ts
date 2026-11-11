/**
 * WhatsApp Business Cloud API webhook handler.
 *
 * GET  — Meta verification challenge (one-time setup)
 * POST — Inbound events: messages, delivery statuses, read receipts
 *
 * Security: every POST is verified with X-Hub-Signature-256 (HMAC-SHA256
 * over the raw body, signed with your Meta App Secret).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { waitUntil } from '@vercel/functions';
import {
  verifySignature,
  markRead,
  extractTextBody,
  toE164,
  type WAWebhookPayload,
  type WAInboundMessage,
  type WAStatusUpdate,
  type WAContact,
} from '@/lib/whatsapp';
import {
  upsertConversation,
  setOptIn,
  saveInboundMessage,
  saveStatusUpdate,
} from '@/lib/whatsapp-db';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import { handleWhatsAppScreeningInbound } from '@/lib/whatsapp-screening/service';
import { handleWhatsAppJobAgentInbound } from '@/lib/whatsapp-agent/router';
import { isOptOutCommand } from '@/lib/whatsapp-agent/parser';
import { handleDailyDrillReply } from '@/lib/skillup/drill-inbound';
import { maskPII } from '@/lib/pii-mask';

export const runtime = 'nodejs';
// waitUntil work after the 200 counts against this, so it has to cover
// routing a whole payload, model calls included.
export const maxDuration = 60;

function toUnixTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return 0;
  return parsed;
}

function maskWaId(value: string): string {
  if (value.length <= 4) {
    return '[masked]';
  }

  return `***${value.slice(-4)}`;
}

// ─── GET: webhook verification ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

// ─── POST: inbound event handler ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Read raw body bytes for signature verification
  const rawBody = Buffer.from(await request.arrayBuffer());

  // 2. Verify signature — MANDATORY in all environments
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[WA webhook] WHATSAPP_APP_SECRET is not configured — rejecting request');
    return new NextResponse('Server misconfiguration', { status: 500 });
  }
  const sig = request.headers.get('x-hub-signature-256') ?? '';
  if (!verifySignature(rawBody, sig)) {
    console.warn('[WA webhook] Invalid signature — rejecting request');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 3. Parse payload
  let payload: WAWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString('utf-8'));
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  if (payload.object !== 'whatsapp_business_account') {
    return new NextResponse('OK', { status: 200 });
  }

  // 4. Persist inbound messages before acknowledging. The unique index on
  //    wa_message_id is what makes Meta's retries harmless, so it must hold
  //    before we say 200; only messages that are new here get routed.
  const accepted: AcceptedInbound[] = [];
  const statuses: WAStatusUpdate[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      // Build a contact lookup map: wa_id → WAContact
      const contactMap = new Map<string, WAContact>(
        (value.contacts ?? []).map(c => [c.wa_id, c])
      );

      const orderedMessages = [...(value.messages ?? [])].sort(
        (a, b) => toUnixTimestamp(a.timestamp) - toUnixTimestamp(b.timestamp)
      );
      for (const msg of orderedMessages) {
        const inbound = await acceptInboundMessage(msg, contactMap.get(msg.from));
        if (inbound) accepted.push(inbound);
      }

      statuses.push(
        ...[...(value.statuses ?? [])].sort(
          (a, b) => toUnixTimestamp(a.timestamp) - toUnixTimestamp(b.timestamp)
        )
      );
    }
  }

  // 5. Answer Meta now and do the slow part afterwards. Routing can call the
  //    model and send several replies; doing that before the 200 made Meta
  //    time out and redeliver. Messages are still routed one at a time, in
  //    delivery order, to avoid conversation-state races within a payload.
  waitUntil(processAccepted(accepted, statuses));

  return new NextResponse('OK', { status: 200 });
}

// ─── Inbound message handler ──────────────────────────────────────────────────

interface AcceptedInbound {
  msg: WAInboundMessage;
  textBody: string | null;
  conversationId: string;
  conversationUserId: string | null;
}

/**
 * Upsert the conversation and log the message. Returns null for duplicate
 * deliveries and for failures, which are logged: Meta must still get a 200.
 */
async function acceptInboundMessage(
  msg: WAInboundMessage,
  contact: WAContact | undefined
): Promise<AcceptedInbound | null> {
  try {
    const conversation = await upsertConversation(msg.from, contact);

    // Null for media/sticker/unsupported
    const textBody = extractTextBody(msg);

    // Idempotent: duplicate wamids are silently skipped
    const log = await saveInboundMessage(
      msg,
      textBody,
      conversation.id,
      conversation.user_id
    );
    if (!log) return null;

    return {
      msg,
      textBody,
      conversationId: conversation.id,
      conversationUserId: conversation.user_id,
    };
  } catch (err) {
    console.error('[WA webhook] acceptInboundMessage error:', err);
    return null;
  }
}

async function processAccepted(
  accepted: AcceptedInbound[],
  statuses: WAStatusUpdate[]
): Promise<void> {
  for (const inbound of accepted) {
    try {
      // Best-effort
      void markRead(inbound.msg.id).catch(() => {});

      await routeInboundMessage(
        inbound.msg,
        inbound.textBody,
        inbound.conversationId,
        toE164(inbound.msg.from),
        inbound.conversationUserId
      );
    } catch (err) {
      console.error('[WA webhook] routeInboundMessage error:', err);
    }
  }

  for (const status of statuses) {
    await handleStatusUpdate(status);
  }
}

// ─── Message router ───────────────────────────────────────────────────────────

async function routeInboundMessage(
  msg: WAInboundMessage,
  textBody: string | null,
  conversationId: string,
  phone: string,
  conversationUserId: string | null
): Promise<void> {
  const lower = textBody?.trim().toLowerCase() ?? '';

  // Phase 1 recruiter screening flow.
  const screeningResult = await handleWhatsAppScreeningInbound({
    message: msg,
    textBody,
    conversationId,
    conversationUserId,
    waPhone: phone,
  });
  if (screeningResult.handled) {
    return;
  }

  // WhatsApp Job Agent flow (menu + job search + recruiter gate + talent leads).
  const agentResult = await handleWhatsAppJobAgentInbound({
    message: msg,
    textBody,
    conversationId,
    conversationUserId,
    waPhone: phone,
  });
  if (agentResult.handled) {
    return;
  }

  // Daily quiz drill reply (A/B/C/D). Only claims when an unanswered dispatch
  // exists for this phone in the last 24h — otherwise falls through.
  const drillResult = await handleDailyDrillReply({
    textBody,
    waPhone: phone,
  });
  if (drillResult.handled) {
    return;
  }

  // Opt-in keywords
  if (['start', 'subscribe', 'oui', 'yes'].includes(lower)) {
    await setOptIn(phone, true);
    await sendWhatsappMessage(
      phone,
      'You are now subscribed to JobLinca WhatsApp updates. Send APPLY <jobId> to start a WhatsApp application.'
    );
    return;
  }

  // Opt-out keywords (STOP is required by Meta policy)
  if (textBody && isOptOutCommand(textBody)) {
    await setOptIn(phone, false);
    await sendWhatsappMessage(
      phone,
      'You have been unsubscribed from JobLinca WhatsApp updates. Reply START to subscribe again.'
    );
    return;
  }

  // Help / menu
  if (['help', 'aide', 'menu'].includes(lower)) {
    await sendWhatsappMessage(
      phone,
      'WhatsApp commands:\n- APPLY <jobId>\n- HELP\n- STOP\n- START'
    );
    return;
  }

  // Default: log unhandled message without exposing phone numbers or message PII.
  console.info('[WA] Unhandled inbound message', {
    type: msg.type,
    from: maskWaId(msg.from),
    textBody: textBody ? maskPII(textBody) : null,
  });
}

// ─── Status update handler ────────────────────────────────────────────────────

async function handleStatusUpdate(status: WAStatusUpdate): Promise<void> {
  try {
    await saveStatusUpdate(status);
  } catch (err) {
    console.error('[WA webhook] handleStatusUpdate error:', err);
  }
}
