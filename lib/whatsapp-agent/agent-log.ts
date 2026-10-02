import { createServiceSupabaseClient } from '@/lib/supabase/service';

export interface AgentToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  ms: number;
}

export interface AgentTurnRecord {
  leadId: string | null;
  waMessageId: string | null;
  route: 'shadow' | 'live';
  outcome: 'agent' | 'fallback';
  fallbackReason?: string | null;
  inboundText: string | null;
  replyText: string | null;
  toolCalls?: AgentToolCallRecord[];
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
}

/** Inbound and reply text are capped; this is an audit log, not an archive. */
const MAX_TEXT = 2000;

function cap(value: string | null): string | null {
  if (value === null) return null;
  return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT) : value;
}

/**
 * Record one agent turn in wa_agent_turns. Never throws: a logging failure
 * (including the table not existing yet) must not cost the user their reply.
 */
export async function logAgentTurn(
  record: AgentTurnRecord,
  db: Pick<ReturnType<typeof createServiceSupabaseClient>, 'from'> = createServiceSupabaseClient()
): Promise<void> {
  try {
    const { error } = await db.from('wa_agent_turns').insert({
      lead_id: record.leadId,
      wa_message_id: record.waMessageId,
      route: record.route,
      outcome: record.outcome,
      fallback_reason: record.fallbackReason ?? null,
      inbound_text: cap(record.inboundText),
      reply_text: cap(record.replyText),
      tool_calls: record.toolCalls ?? [],
      model: record.model ?? null,
      prompt_tokens: record.promptTokens ?? null,
      completion_tokens: record.completionTokens ?? null,
      latency_ms: record.latencyMs ?? null,
    });
    if (error) {
      console.warn('[wa-agent-log] could not record agent turn', { error: error.message });
    }
  } catch (error) {
    console.warn('[wa-agent-log] could not record agent turn', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  }
}
