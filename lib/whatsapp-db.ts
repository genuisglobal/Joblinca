/**
 * WhatsApp database persistence helpers.
 *
 * All functions use the service-role Supabase client so they can run from
 * API route handlers without being blocked by RLS policies.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { WAInboundMessage, WAStatusUpdate, WAContact } from '@/lib/whatsapp';
import { toE164 } from '@/lib/whatsapp';

// Use the service-role client so writes are never blocked by RLS
const supabaseAdmin = createServiceSupabaseClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WaConversation {
  id: string;
  wa_phone: string;
  display_name: string | null;
  user_id: string | null;
  opted_in: boolean;
  opted_in_at: string | null;
  opted_out_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaLog {
  id: string;
  user_id: string | null;
  phone: string;
  message: string;
  direction: 'inbound' | 'outbound';
  status: string | null;
  wa_message_id: string | null;
  wa_conversation_id: string | null;
  message_type: string;
  template_name: string | null;
  raw_payload: unknown;
  created_at: string;
}

// ─── Conversations ────────────────────────────────────────────────────────────

/**
 * Get or create a wa_conversations row for the given phone number.
 * Updates display_name and last_inbound_at when the contact is already known.
 */
export async function upsertConversation(
  waId: string,
  contact?: WAContact
): Promise<WaConversation> {
  const phone       = toE164(waId);
  const displayName = contact?.profile?.name ?? null;

  const { data, error } = await supabaseAdmin
    .from('wa_conversations')
    .upsert(
      {
        wa_phone:        phone,
        display_name:    displayName,
        last_inbound_at: new Date().toISOString(),
      },
      {
        onConflict: 'wa_phone',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) throw new Error(`upsertConversation: ${error.message}`);
  return data as WaConversation;
}

/**
 * Link a wa_conversations row to a JobLinca user (by matching phone number
 * against profiles or job_seekers).  Call after matching a phone to a user.
 */
export async function linkConversationToUser(
  waPhone: string,
  userId: string
): Promise<void> {
  const phone = toE164(waPhone);
  const { error } = await supabaseAdmin
    .from('wa_conversations')
    .update({ user_id: userId })
    .eq('wa_phone', phone);
  if (error) throw new Error(`linkConversationToUser: ${error.message}`);
}

/**
 * Mark a conversation as opted-in for WhatsApp notifications.
 */
export async function setOptIn(waPhone: string, optedIn: boolean): Promise<void> {
  const phone = toE164(waPhone);
  const now   = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from('wa_conversations')
    .update(
      optedIn
        ? { opted_in: true,  opted_in_at:  now, opted_out_at: null }
        : { opted_in: false, opted_out_at: now }
    )
    .eq('wa_phone', phone);
  if (error) throw new Error(`setOptIn: ${error.message}`);
}

// ─── Messages (whatsapp_logs) ─────────────────────────────────────────────────

/**
 * Persist an inbound message from Meta.
 * Idempotent: if wa_message_id already exists the row is silently skipped
 * (unique index on whatsapp_logs.wa_message_id).
 *
 * Returns the persisted log row, or null if it was a duplicate.
 */
export async function saveInboundMessage(
  msg: WAInboundMessage,
  textBody: string | null,
  waConversationId: string | null,
  userId: string | null
): Promise<WaLog | null> {
  const phone    = toE164(msg.from);
  const msgText  = textBody ?? `[${msg.type}]`;
  const ts       = new Date(parseInt(msg.timestamp, 10) * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('whatsapp_logs')
    .insert({
      user_id:            userId,
      phone,
      message:            msgText,
      direction:          'inbound',
      status:             'received',
      wa_message_id:      msg.id,
      wa_conversation_id: waConversationId,
      message_type:       msg.type,
      raw_payload:        msg,
      created_at:         ts,
    })
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation — duplicate delivery from Meta, ignore it
    if ((error as { code?: string }).code === '23505') return null;
    throw new Error(`saveInboundMessage: ${error.message}`);
  }
  return data as WaLog;
}

/**
 * Persist an outbound message we sent via the Meta API.
 */
export async function saveOutboundMessage(opts: {
  to: string;
  message: string;
  waMessageId: string;
  messageType?: string;
  templateName?: string;
  userId?: string | null;
}): Promise<WaLog> {
  const phone = toE164(opts.to);
  const { data, error } = await supabaseAdmin
    .from('whatsapp_logs')
    .insert({
      user_id:       opts.userId ?? null,
      phone,
      message:       opts.message,
      direction:     'outbound',
      status:        'sent',
      wa_message_id: opts.waMessageId,
      message_type:  opts.messageType ?? 'text',
      template_name: opts.templateName ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`saveOutboundMessage: ${error.message}`);

  // Update last_outbound_at on the conversation row
  await supabaseAdmin
    .from('wa_conversations')
    .update({ last_outbound_at: new Date().toISOString() })
    .eq('wa_phone', phone);

  return data as WaLog;
}

// ─── Status updates (wa_statuses) ────────────────────────────────────────────

/**
 * Persist a delivery/read status event from Meta.
 * Also updates the corresponding whatsapp_logs row.
 */
export async function saveStatusUpdate(status: WAStatusUpdate): Promise<void> {
  const ts = new Date(parseInt(status.timestamp, 10) * 1000).toISOString();

  // 1. Insert into wa_statuses
  await supabaseAdmin.from('wa_statuses').insert({
    wa_message_id:  status.id,
    status:         status.status,
    timestamp:      ts,
    recipient_phone: status.recipient_id ? toE164(status.recipient_id) : null,
    error_code:     status.errors?.[0]?.code ?? null,
    error_title:    status.errors?.[0]?.title ?? null,
    raw_payload:    status,
  });

  // 2. Update the corresponding whatsapp_logs row
  await supabaseAdmin
    .from('whatsapp_logs')
    .update({ status: status.status })
    .eq('wa_message_id', status.id);
}
