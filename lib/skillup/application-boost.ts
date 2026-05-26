/**
 * Atomic consume of a talent_application_boosts row.
 *
 * Race-condition strategy:
 *   - SELECT the freshest active row (tokens_remaining > 0, expires_at > now()).
 *   - UPDATE with WHERE tokens_remaining = <observed value>. PostgREST returns
 *     the row only if the conditional update matched. A concurrent consumer
 *     who decremented first will leave a different tokens_remaining and our
 *     UPDATE matches zero rows — we treat that as "race lost" and try the next
 *     boost row.
 */
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const MAX_ATTEMPTS = 3;

export interface ApplicationBoostConsumption {
  boostId: string;
  weekKey: string | null;
  domain: string | null;
  challengeId: string | null;
  score: number | null;
  tokensRemaining: number;
  expiresAt: string;
  rank: number | null;
}

interface BoostRow {
  id: string;
  tokens_remaining: number;
  expires_at: string;
  granted_for: string;
  domain: string | null;
  metadata: Record<string, unknown> | null;
}

function metaString(meta: Record<string, unknown> | null, key: string): string | null {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === 'string' && value ? value : null;
}

function metaNumber(meta: Record<string, unknown> | null, key: string): number | null {
  if (!meta) return null;
  const value = meta[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function consumeApplicationBoost(
  userId: string
): Promise<{ ok: true; consumption: ApplicationBoostConsumption } | { ok: false; reason: string }> {
  const db = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { data: rows, error } = await db
      .from('talent_application_boosts')
      .select('id, tokens_remaining, expires_at, granted_for, domain, metadata')
      .eq('user_id', userId)
      .gt('tokens_remaining', 0)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: true })
      .limit(5);

    if (error) {
      return { ok: false, reason: error.message };
    }
    if (!rows || rows.length === 0) {
      return { ok: false, reason: 'no_active_boost' };
    }

    for (const row of rows as BoostRow[]) {
      const nextRemaining = row.tokens_remaining - 1;
      const { data: updated, error: updateError } = await db
        .from('talent_application_boosts')
        .update({ tokens_remaining: nextRemaining })
        .eq('id', row.id)
        .eq('tokens_remaining', row.tokens_remaining)
        .select('id, tokens_remaining, expires_at, granted_for, domain, metadata')
        .maybeSingle();

      if (updateError) {
        return { ok: false, reason: updateError.message };
      }
      if (updated) {
        const meta = updated.metadata as Record<string, unknown> | null;
        return {
          ok: true,
          consumption: {
            boostId: updated.id,
            weekKey: metaString(meta, 'week_key'),
            domain: updated.domain ?? metaString(meta, 'domain'),
            challengeId: metaString(meta, 'challenge_id'),
            score: metaNumber(meta, 'score'),
            tokensRemaining: updated.tokens_remaining,
            expiresAt: updated.expires_at,
            rank: metaNumber(meta, 'rank'),
          },
        };
      }
      // Conditional update matched zero rows — another caller consumed this
      // row in the gap. Loop to the next candidate or refetch.
    }
  }

  return { ok: false, reason: 'boost_contention' };
}
