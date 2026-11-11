import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { AiToolLoopMessage } from '@/lib/ai/client';

const HISTORY_LIMIT = 10;
const MAX_CHARS_PER_MESSAGE = 500;
/** Older than this is a different conversation; don't drag it in. */
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

interface LogRow {
  direction: 'inbound' | 'outbound';
  message: string | null;
  wa_message_id: string | null;
  created_at: string;
}

/**
 * The last few messages with this phone before the one being answered, as chat
 * turns. Strictly before `beforeIso`: in shadow mode the menu flow has already
 * replied to the current message, and the agent must not see that reply.
 */
export async function loadConversationHistory(params: {
  phone: string;
  beforeIso: string;
  excludeWaMessageId: string | null;
  db?: Pick<ReturnType<typeof createServiceSupabaseClient>, 'from'>;
}): Promise<AiToolLoopMessage[]> {
  const db = params.db ?? createServiceSupabaseClient();
  const sinceIso = new Date(new Date(params.beforeIso).getTime() - HISTORY_WINDOW_MS).toISOString();

  const { data, error } = await db
    .from('whatsapp_logs')
    .select('direction, message, wa_message_id, created_at')
    .eq('phone', params.phone)
    .gte('created_at', sinceIso)
    .lt('created_at', params.beforeIso)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT + 1);

  if (error || !data) return [];

  return (data as LogRow[])
    .filter((row) => row.wa_message_id !== params.excludeWaMessageId && row.message)
    .slice(0, HISTORY_LIMIT)
    .reverse()
    .map((row) => {
      const text = (row.message as string).trim();
      const content = text.length > MAX_CHARS_PER_MESSAGE ? `${text.slice(0, MAX_CHARS_PER_MESSAGE)}...` : text;
      return row.direction === 'inbound'
        ? { role: 'user' as const, content }
        : { role: 'assistant' as const, content };
    });
}
