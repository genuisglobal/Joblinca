/**
 * Job search for the WhatsApp agent.
 *
 * Ranking goes through search_public_jobs, the same fuzzy + bilingual-synonym
 * RPC the website uses, so "chauffeur" finds "driver" and "Yaoundé" finds
 * "Yaounde". That RPC does not return public_id (the JL-xxxx the user types to
 * apply), so the matching ids are re-read from jobs in rank order. If the RPC
 * errors -- e.g. its migration is not applied in some environment -- we fall
 * back to the bot's original substring search rather than failing the turn.
 *
 * An empty result is never the end: the search widens one step at a time
 * (recency to 30 days, then any town, then any role) and reports what it
 * relaxed, so the agent can say "nothing in Buea, here is what's nationwide".
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { expandSearchSynonyms } from '@/lib/search/synonyms';
import {
  searchPublishedJobs,
  type SearchJobRow,
  type TimeFilter,
} from '@/lib/whatsapp-agent/job-search';

export interface AgentSearchQuery {
  location: string | null;
  role: string | null;
  type: 'job' | 'internship';
  recency: TimeFilter;
}

export type WidenStep = 'recency' | 'location' | 'role';

export interface AgentSearchResult {
  jobs: SearchJobRow[];
  /** The query that produced `jobs` -- the original, or a widened one. */
  query: AgentSearchQuery;
  widened: WidenStep[];
}

export type RankedSearchFn = (
  query: AgentSearchQuery,
  offset: number,
  limit: number
) => Promise<SearchJobRow[]>;

const JOB_COLUMNS =
  'id, public_id, title, location, salary, company_name, description, apply_method, external_apply_url, apply_email, apply_phone, apply_whatsapp, created_at, closes_at, recruiter_id, job_type, hiring_tier, wa_ai_screening_enabled';

const RECENCY_MS: Record<TimeFilter, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function isOpen(job: SearchJobRow, now: Date): boolean {
  return !job.closes_at || new Date(job.closes_at) > now;
}

/** One page of ranked results for an exact query, no widening. */
export const rankedSearch: RankedSearchFn = async (query, offset, limit) => {
  const db = createServiceSupabaseClient();
  const role = (query.role || '').trim();
  const synonyms = role ? expandSearchSynonyms(role) : [];

  const ranked = await db.rpc('search_public_jobs', {
    p_search: role || null,
    p_location: (query.location || '').trim() || null,
    p_job_type: query.type,
    p_posted_after: new Date(Date.now() - RECENCY_MS[query.recency]).toISOString(),
    p_limit: limit,
    p_offset: offset,
    p_search_terms: synonyms.length > 0 ? synonyms : null,
  });

  if (ranked.error) {
    console.warn('[wa-agent-search] search_public_jobs failed, using substring search', {
      error: ranked.error.message,
    });
    const { jobs } = await searchPublishedJobs({
      location: query.location,
      roleKeywords: query.role,
      jobType: query.type,
      timeFilter: query.recency,
      offset,
      limit,
    });
    return jobs;
  }

  const ids = ((ranked.data as Array<{ id: string }> | null) || []).map((row) => row.id);
  if (ids.length === 0) return [];

  const { data, error } = await db
    .from('jobs')
    .select(JOB_COLUMNS)
    .in('id', ids)
    .eq('published', true)
    .or('approval_status.eq.approved,approval_status.is.null');
  if (error) throw new Error(`rankedSearch row fetch failed: ${error.message}`);

  const byId = new Map(((data || []) as SearchJobRow[]).map((job) => [job.id, job]));
  const now = new Date();
  return ids
    .map((id) => byId.get(id))
    .filter((job): job is SearchJobRow => Boolean(job) && isOpen(job as SearchJobRow, now));
};

/** The next, wider query, or null when there is nothing left to relax. */
export function widenQuery(query: AgentSearchQuery): { query: AgentSearchQuery; step: WidenStep } | null {
  if (query.recency !== '30d') return { query: { ...query, recency: '30d' }, step: 'recency' };
  if (query.location) return { query: { ...query, location: null }, step: 'location' };
  if (query.role) return { query: { ...query, role: null }, step: 'role' };
  return null;
}

/**
 * First page for `query`, widening until something comes back. Only page 0
 * widens; paging through a widened search keeps using `result.query`.
 */
export async function searchWithWidening(
  query: AgentSearchQuery,
  limit: number,
  search: RankedSearchFn = rankedSearch
): Promise<AgentSearchResult> {
  let current = query;
  const widened: WidenStep[] = [];

  for (;;) {
    const jobs = await search(current, 0, limit);
    if (jobs.length > 0) return { jobs, query: current, widened };

    const next = widenQuery(current);
    if (!next) return { jobs: [], query: current, widened };
    current = next.query;
    widened.push(next.step);
  }
}
