import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, AdminRequiredError } from '@/lib/admin';
import type { WAContact, WAInboundMessage } from '@/lib/whatsapp';
import { upsertConversation, saveInboundMessage } from '@/lib/whatsapp-db';
import { handleWhatsAppScreeningInbound } from '@/lib/whatsapp-screening/service';

interface SimulateBody {
  from?: string;
  text?: string;
  waMessageId?: string;
  timestamp?: string;
  contactName?: string;
  contextMessageId?: string;
  referralUrl?: string;
}

function sanitizeWaFrom(input: string): string {
  return input.replace(/[^\d]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  let body: SimulateBody;
  try {
    body = (await request.json()) as SimulateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fromRaw = body.from?.trim() ?? '';
  const text = body.text?.trim() ?? '';
  const from = sanitizeWaFrom(fromRaw);

  if (!from || from.length < 8) {
    return NextResponse.json(
      { error: '`from` is required and must include a valid phone number' },
      { status: 422 }
    );
  }

  if (!text) {
    return NextResponse.json({ error: '`text` is required' }, { status: 422 });
  }

  const waMessageId = body.waMessageId?.trim() || `wamid.sim.${Date.now()}`;
  const timestamp = body.timestamp?.trim() || `${Math.floor(Date.now() / 1000)}`;
  const contactName = body.contactName?.trim() || 'Simulation User';

  const inboundMessage: WAInboundMessage = {
    id: waMessageId,
    from,
    timestamp,
    type: 'text',
    text: { body: text },
    ...(body.contextMessageId?.trim()
      ? { context: { from, id: body.contextMessageId.trim() } }
      : {}),
    ...(body.referralUrl?.trim()
      ? {
          referral: {
            source_url: body.referralUrl.trim(),
            source_type: 'ad',
            source_id: 'simulate',
            headline: 'simulate',
            body: 'simulate',
          },
        }
      : {}),
  };

  const contact: WAContact = {
    wa_id: from,
    profile: { name: contactName },
  };

  try {
    const conversation = await upsertConversation(from, contact);
    const persisted = await saveInboundMessage(
      inboundMessage,
      text,
      conversation.id,
      conversation.user_id
    );

    if (!persisted) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        waMessageId,
        conversationId: conversation.id,
      });
    }

    const screeningResult = await handleWhatsAppScreeningInbound({
      message: inboundMessage,
      textBody: text,
      conversationId: conversation.id,
      conversationUserId: conversation.user_id,
      waPhone: from,
    });

    return NextResponse.json({
      ok: true,
      duplicate: false,
      waMessageId,
      conversationId: conversation.id,
      screeningResult,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Simulation failed',
      },
      { status: 500 }
    );
  }
}

