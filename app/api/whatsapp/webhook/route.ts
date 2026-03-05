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

  // 2. Verify signature (skip in local dev when APP_SECRET is absent)
  const sig = request.headers.get('x-hub-signature-256') ?? '';
  if (process.env.WHATSAPP_APP_SECRET) {
    if (!verifySignature(rawBody, sig)) {
      console.warn('[WA webhook] Invalid signature — rejecting request');
      return new NextResponse('Unauthorized', { status: 401 });
    }
  } else {
    // No secret configured — log a warning but don't block (dev/test)
    console.warn('[WA webhook] WHATSAPP_APP_SECRET not set — skipping signature check');
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

  // 4. Process each entry with bounded parallelism per change.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;
      const value = change.value;

      // Build a contact lookup map: wa_id → WAContact
      const contactMap = new Map<string, WAContact>(
        (value.contacts ?? []).map(c => [c.wa_id, c])
      );

      const tasks: Array<Promise<void>> = [];

      // Handle inbound messages
      for (const msg of value.messages ?? []) {
        tasks.push(handleInboundMessage(msg, contactMap.get(msg.from)));
      }

      // Handle delivery / read status updates
      for (const status of value.statuses ?? []) {
        tasks.push(handleStatusUpdate(status));
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    }
  }

  // Meta expects a 200 quickly — always return OK
  return new NextResponse('OK', { status: 200 });
}

// ─── Inbound message handler ──────────────────────────────────────────────────

async function handleInboundMessage(
  msg: WAInboundMessage,
  contact: WAContact | undefined
): Promise<void> {
  try {
    // 1. Get/create conversation row
    const conversation = await upsertConversation(msg.from, contact);

    // 2. Extract text (null for media/sticker/unsupported)
    const textBody = extractTextBody(msg);

    // 3. Persist (idempotent — duplicate wamids are silently skipped)
    const log = await saveInboundMessage(
      msg,
      textBody,
      conversation.id,
      conversation.user_id
    );

    if (!log) {
      // Duplicate delivery from Meta — nothing more to do
      return;
    }

    // 4. Mark as read (best-effort)
    void markRead(msg.id).catch(() => {});

    // 5. Route by message content
    await routeInboundMessage(
      msg,
      textBody,
      conversation.id,
      toE164(msg.from),
      conversation.user_id
    );
  } catch (err) {
    // Log but don't re-throw — we must return 200 to Meta
    console.error('[WA webhook] handleInboundMessage error:', err);
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
  if (['stop', 'unsubscribe', 'non', 'no'].includes(lower)) {
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

  // Default: log unhandled message (future: forward to AM inbox, AI reply, etc.)
  console.log(`[WA] Unhandled message type=${msg.type} from=${msg.from}`, { textBody });
}

// ─── Status update handler ────────────────────────────────────────────────────

async function handleStatusUpdate(status: WAStatusUpdate): Promise<void> {
  try {
    await saveStatusUpdate(status);
  } catch (err) {
    console.error('[WA webhook] handleStatusUpdate error:', err);
  }
}
