/**
 * Data for the admin agent-review page (/admin/whatsapp/agent): how the
 * conversational agent is doing, and -- in shadow mode -- what it would have
 * said next to what the menu bot actually sent.
 */

import type { createServiceSupabaseClient } from '@/lib/supabase/service';

type Db = Pick<ReturnType<typeof createServiceSupabaseClient>, 'from'>;

export type ReviewRange = '24h' | '7d' | '30d';

export interface ReviewFilters {
  range: ReviewRange;
  route: 'all' | 'shadow' | 'live';
  outcome: 'all' | 'agent' | 'fallback';
  phone: string | null;
  page: number;
}

export const REVIEW_PAGE_SIZE = 25;
/** Summary stats are computed over at most this many turns in the range. */
const SUMMARY_SAMPLE = 5000;

/**
 * gpt-4o-mini list prices (USD per 1M tokens) used for the cost estimate.
 * An estimate only -- the OpenAI bill is the source of truth.
 */
const PRICE_PER_M_INPUT = 0.15;
const PRICE_PER_M_OUTPUT = 0.6;

const RANGE_MS: Record<ReviewRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export interface ReviewSummary {
  total: number;
  sampled: boolean;
  byRoute: { shadow: number; live: number };
  agent: number;
  fallback: number;
  fallbackRate: number;
  fallbackReasons: Array<{ reason: string; count: number }>;
  tools: Array<{ name: string; count: number; failed: number }>;
  latencyAvgMs: number | null;
  latencyP95Ms: number | null;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  distinctLeads: number;
}

export interface ReviewTurn {
  id: string;
  createdAt: string;
  route: 'shadow' | 'live';
  outcome: 'agent' | 'fallback';
  fallbackReason: string | null;
  phone: string | null;
  language: string | null;
  hasAccount: boolean;
  inboundText: string | null;
  replyText: string | null;
  /** What the menu flow sent for the same message (shadow turns). */
  menuReplies: string[];
  tools: Array<{ name: string; ok: boolean }>;
  latencyMs: number | null;
  tokens: number;
}

interface TurnRow {
  id: string;
  created_at: string;
  lead_id: string | null;
  wa_message_id: string | null;
  route: 'shadow' | 'live';
  outcome: 'agent' | 'fallback';
  fallback_reason: string | null;
  inbound_text: string | null;
  reply_text: string | null;
  tool_calls: Array<{ name?: string; ok?: boolean }> | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  lead?: { phone_e164: string | null; language: string | null; linked_user_id: string | null } | Array<{ phone_e164: string | null; language: string | null; linked_user_id: string | null }> | null;
}

export function parseReviewFilters(params: Record<string, string | string[] | undefined>): ReviewFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) || '';
  };
  const range = one('range');
  const route = one('route');
  const outcome = one('outcome');
  const phoneDigits = one('phone').replace(/\D/g, '');
  const page = Number.parseInt(one('page'), 10);
  return {
    range: range === '24h' || range === '30d' ? range : '7d',
    route: route === 'shadow' || route === 'live' ? route : 'all',
    outcome: outcome === 'agent' || outcome === 'fallback' ? outcome : 'all',
    phone: phoneDigits.length >= 6 ? `+${phoneDigits}` : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** "model_error: OpenAI call failed (429): ..." -> "model_error (429)" -- groups reasons for the table. */
export function normalizeFallbackReason(reason: string | null): string {
  if (!reason) return 'unknown';
  const head = reason.split(':')[0].trim();
  const status = reason.match(/\((\d{3})\)/);
  if (head === 'tool_error') {
    const tool = reason.split(':')[1]?.trim();
    return tool ? `tool_error (${tool})` : head;
  }
  return status ? `${head} (${status[1]})` : head;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function summarizeTurns(rows: TurnRow[], sampled: boolean): ReviewSummary {
  const reasons = new Map<string, number>();
  const tools = new Map<string, { count: number; failed: number }>();
  const latencies: number[] = [];
  const leads = new Set<string>();
  let promptTokens = 0;
  let completionTokens = 0;
  let agent = 0;
  let shadow = 0;

  for (const row of rows) {
    if (row.outcome === 'agent') agent++;
    else reasons.set(normalizeFallbackReason(row.fallback_reason), (reasons.get(normalizeFallbackReason(row.fallback_reason)) || 0) + 1);
    if (row.route === 'shadow') shadow++;
    if (row.lead_id) leads.add(row.lead_id);
    if (typeof row.latency_ms === 'number') latencies.push(row.latency_ms);
    promptTokens += row.prompt_tokens || 0;
    completionTokens += row.completion_tokens || 0;
    for (const call of row.tool_calls || []) {
      const name = call.name || 'unknown';
      const entry = tools.get(name) || { count: 0, failed: 0 };
      entry.count++;
      if (call.ok === false) entry.failed++;
      tools.set(name, entry);
    }
  }

  latencies.sort((a, b) => a - b);
  const total = rows.length;
  return {
    total,
    sampled,
    byRoute: { shadow, live: total - shadow },
    agent,
    fallback: total - agent,
    fallbackRate: total ? (total - agent) / total : 0,
    fallbackReasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    tools: [...tools.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count),
    latencyAvgMs: latencies.length ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : null,
    latencyP95Ms: percentile(latencies, 95),
    promptTokens,
    completionTokens,
    estimatedCostUsd: (promptTokens * PRICE_PER_M_INPUT + completionTokens * PRICE_PER_M_OUTPUT) / 1_000_000,
    distinctLeads: leads.size,
  };
}

function leadOf(row: TurnRow) {
  return Array.isArray(row.lead) ? row.lead[0] ?? null : row.lead ?? null;
}

/**
 * What the menu flow sent in answer to the same inbound message: outbound
 * logs for that phone after the inbound message and before the agent turn
 * was logged (shadow runs only once the menu flow has replied).
 */
async function loadMenuReplies(db: Db, phone: string, waMessageId: string, turnAt: string): Promise<string[]> {
  const { data: inbound } = await db
    .from('whatsapp_logs')
    .select('created_at')
    .eq('wa_message_id', waMessageId)
    .eq('direction', 'inbound')
    .maybeSingle();
  if (!inbound?.created_at) return [];

  const { data } = await db
    .from('whatsapp_logs')
    .select('message, created_at')
    .eq('phone', phone)
    .eq('direction', 'outbound')
    .gte('created_at', inbound.created_at as string)
    .lte('created_at', turnAt)
    .order('created_at', { ascending: true })
    .limit(5);
  return ((data || []) as Array<{ message: string | null }>).map((r) => r.message || '').filter(Boolean);
}

export async function loadAgentReview(
  db: Db,
  filters: ReviewFilters,
  now = Date.now()
): Promise<{ summary: ReviewSummary; turns: ReviewTurn[]; hasNextPage: boolean; leadFound: boolean }> {
  const sinceIso = new Date(now - RANGE_MS[filters.range]).toISOString();

  let leadId: string | null = null;
  if (filters.phone) {
    const { data: lead } = await db.from('wa_leads').select('id').eq('phone_e164', filters.phone).maybeSingle();
    leadId = (lead?.id as string | undefined) ?? null;
    if (!leadId) {
      return { summary: summarizeTurns([], false), turns: [], hasNextPage: false, leadFound: false };
    }
  }

  const applyFilters = <T extends { eq: (c: string, v: unknown) => T; gte: (c: string, v: unknown) => T }>(query: T): T => {
    let q = query.gte('created_at', sinceIso);
    if (filters.route !== 'all') q = q.eq('route', filters.route);
    if (filters.outcome !== 'all') q = q.eq('outcome', filters.outcome);
    if (leadId) q = q.eq('lead_id', leadId);
    return q;
  };

  const summaryQuery = applyFilters(
    db
      .from('wa_agent_turns')
      .select('id, created_at, lead_id, route, outcome, fallback_reason, tool_calls, prompt_tokens, completion_tokens, latency_ms') as any
  );
  const { data: summaryRows, error: summaryError } = await summaryQuery
    .order('created_at', { ascending: false })
    .limit(SUMMARY_SAMPLE);
  if (summaryError) throw new Error(`wa_agent_turns: ${summaryError.message}`);

  const offset = (filters.page - 1) * REVIEW_PAGE_SIZE;
  const pageQuery = applyFilters(
    db
      .from('wa_agent_turns')
      .select(
        'id, created_at, lead_id, wa_message_id, route, outcome, fallback_reason, inbound_text, reply_text, tool_calls, prompt_tokens, completion_tokens, latency_ms, lead:lead_id (phone_e164, language, linked_user_id)'
      ) as any
  );
  const { data: pageRows, error: pageError } = await pageQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + REVIEW_PAGE_SIZE); // one extra row tells us there is a next page
  if (pageError) throw new Error(`wa_agent_turns: ${pageError.message}`);

  const rows = (pageRows || []) as TurnRow[];
  const visible = rows.slice(0, REVIEW_PAGE_SIZE);
  const turns = await Promise.all(
    visible.map(async (row): Promise<ReviewTurn> => {
      const lead = leadOf(row);
      const phone = lead?.phone_e164 ?? null;
      return {
        id: row.id,
        createdAt: row.created_at,
        route: row.route,
        outcome: row.outcome,
        fallbackReason: row.fallback_reason,
        phone,
        language: lead?.language ?? null,
        hasAccount: Boolean(lead?.linked_user_id),
        inboundText: row.inbound_text,
        replyText: row.reply_text,
        menuReplies:
          row.route === 'shadow' && phone && row.wa_message_id
            ? await loadMenuReplies(db, phone, row.wa_message_id, row.created_at)
            : [],
        tools: (row.tool_calls || []).map((c) => ({ name: c.name || 'unknown', ok: c.ok !== false })),
        latencyMs: row.latency_ms,
        tokens: (row.prompt_tokens || 0) + (row.completion_tokens || 0),
      };
    })
  );

  const summarySet = (summaryRows || []) as TurnRow[];
  return {
    summary: summarizeTurns(summarySet, summarySet.length >= SUMMARY_SAMPLE),
    turns,
    hasNextPage: rows.length > REVIEW_PAGE_SIZE,
    leadFound: true,
  };
}
