/**
 * Seen-job lookup for early-stop pagination.
 *
 * Loads the external_ids already recorded for a source so scrapers can stop
 * paginating once a full page contains only jobs we already know about —
 * deep ceilings become safe (busy days get depth, quiet days stay cheap).
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_LIMIT = 5000;

export async function loadSeenExternalIds(
  sourceSlug: string,
  limit = DEFAULT_LIMIT
): Promise<Set<string>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Set();

  const supabase = createClient(url, key);

  const { data: source } = await supabase
    .from('aggregation_sources')
    .select('id')
    .eq('slug', sourceSlug)
    .maybeSingle();

  if (!source?.id) return new Set();

  const { data, error } = await supabase
    .from('discovered_job_sources')
    .select('external_job_id')
    .eq('source_id', source.id)
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error(`[seen-store] Failed to load seen ids for ${sourceSlug}:`, error.message);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row) => row.external_job_id as string | null)
      .filter((id): id is string => Boolean(id))
  );
}
