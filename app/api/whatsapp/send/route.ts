/**
 * POST /api/whatsapp/send
 *
 * Send a plain-text WhatsApp message to a given phone number.
 * Requires admin authentication (super or operations).
 *
 * Body: { to: string, message: string }
 */

import { NextResponse } from 'next/server';
import { requireAdmin, AdminRequiredError } from '@/lib/admin';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';

export async function POST(request: Request) {
  // Auth check — throws AdminRequiredError if not an active admin
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AdminRequiredError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { to, message } = body as { to?: string; message?: string };

  if (!to || typeof to !== 'string') {
    return NextResponse.json({ error: '`to` phone number is required' }, { status: 422 });
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: '`message` is required' }, { status: 422 });
  }

  try {
    await sendWhatsappMessage(to.trim(), message.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[WA send] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
