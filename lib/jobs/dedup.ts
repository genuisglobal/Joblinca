/**
 * Job deduplication utilities for the published jobs table.
 *
 * Duplicate detection shares the same identity model as discovered-job
 * ingestion and legacy cross-source dedupe: exact canonical URL match first,
 * then exact title/company hash, then fuzzy title/company comparison.
 */

import { SupabaseClient } from '@supabase/supabase-js';

import {
  buildJobIdentity,
  compareJobIdentity,
  normalizeUrlForDedup,
} from './dedupe-model';

export interface DuplicateCandidate {
  id: string;
  title: string;
  company_name: string | null;
  similarity: number;
  reason?: 'exact_url' | 'exact_text' | 'fuzzy';
}

type DuplicateLookupInput = {
  title: string;
  companyName: string | null;
  urls?: Array<string | null | undefined>;
};

type JobRow = {
  id: string;
  title: string;
  company_name: string | null;
  created_at: string;
  origin_type: string | null;
  external_apply_url?: string | null;
  external_url?: string | null;
  source_attribution_json?: { original_job_url?: string | null } | null;
};

const JOB_SELECT =
  'id, title, company_name, created_at, origin_type, external_apply_url, external_url, source_attribution_json';

function getJobUrls(
  job: Pick<JobRow, 'external_apply_url' | 'external_url' | 'source_attribution_json'>
): string[] {
  return [
    job.external_apply_url || null,
    job.external_url || null,
    job.source_attribution_json?.original_job_url || null,
  ].filter(Boolean) as string[];
}

function compareCanonicalPriority(
  a: Pick<JobRow, 'created_at' | 'origin_type'>,
  b: Pick<JobRow, 'created_at' | 'origin_type'>
): number {
  if (a.origin_type === 'native' && b.origin_type !== 'native') {
    return -1;
  }

  if (b.origin_type === 'native' && a.origin_type !== 'native') {
    return 1;
  }

  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function buildLookupUrls(urls: Array<string | null | undefined> | undefined): string[] {
  const seen = new Set<string>();
  const lookupUrls: string[] = [];

  for (const value of urls || []) {
    const trimmed = (value || '').trim();
    if (!trimmed) {
      continue;
    }

    const lookupKey = normalizeUrlForDedup(trimmed) || trimmed.toLowerCase();
    if (seen.has(lookupKey)) {
      continue;
    }

    seen.add(lookupKey);
    lookupUrls.push(trimmed);
  }

  return lookupUrls;
}

async function findExactUrlDuplicateJob(
  supabase: SupabaseClient,
  urls: Array<string | null | undefined> | undefined
): Promise<DuplicateCandidate | null> {
  const lookupUrls = buildLookupUrls(urls);
  if (lookupUrls.length === 0) {
    return null;
  }

  const matches = new Map<string, JobRow>();

  for (const lookupUrl of lookupUrls) {
    // Use indexed exact URL probes first so publish-time dedupe does not rely
    // on the broader similarity scan for obvious repeats.
    const [applyUrlResult, externalUrlResult, sourceUrlResult] = await Promise.all([
      supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('published', true)
        .eq('approval_status', 'approved')
        .is('removed_at', null)
        .eq('external_apply_url', lookupUrl)
        .limit(5),
      supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('published', true)
        .eq('approval_status', 'approved')
        .is('removed_at', null)
        .eq('external_url', lookupUrl)
        .limit(5),
      supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('published', true)
        .eq('approval_status', 'approved')
        .is('removed_at', null)
        .filter('source_attribution_json->>original_job_url', 'eq', lookupUrl)
        .limit(5),
    ]);

    for (const result of [applyUrlResult, externalUrlResult, sourceUrlResult]) {
      for (const row of (result.data || []) as JobRow[]) {
        matches.set(row.id, row);
      }
    }
  }

  const candidates = [...matches.values()];
  if (candidates.length === 0) {
    return null;
  }

  candidates.sort(compareCanonicalPriority);
  const match = candidates[0];

  return {
    id: match.id,
    title: match.title,
    company_name: match.company_name,
    similarity: 100,
    reason: 'exact_url',
  };
}

/**
 * Check if a job with similar identity already exists in the published
 * jobs table. Returns the best match if found.
 */
export async function findDuplicateJob(
  supabase: SupabaseClient,
  input: DuplicateLookupInput
): Promise<DuplicateCandidate | null> {
  const exactUrlMatch = await findExactUrlDuplicateJob(supabase, input.urls);
  if (exactUrlMatch) {
    return exactUrlMatch;
  }

  const { data: existingJobs } = await supabase
    .from('jobs')
    .select(JOB_SELECT)
    .eq('published', true)
    .eq('approval_status', 'approved')
    .is('removed_at', null)
    .order('created_at', { ascending: false })
    .limit(500);

  if (!existingJobs || existingJobs.length === 0) {
    return null;
  }

  const inputIdentity = buildJobIdentity({
    title: input.title,
    companyName: input.companyName,
    urls: input.urls,
  });

  let bestMatch: DuplicateCandidate | null = null;
  let bestScore = -1;

  for (const job of existingJobs as JobRow[]) {
    const candidateIdentity = buildJobIdentity({
      title: job.title,
      companyName: job.company_name,
      urls: getJobUrls(job),
    });
    const match = compareJobIdentity(inputIdentity, candidateIdentity);

    if (match.duplicate && match.score > bestScore) {
      bestScore = match.score;
      bestMatch = {
        id: job.id,
        title: job.title,
        company_name: job.company_name,
        similarity: Math.round(match.score * 100),
        reason: match.reason === 'none' ? undefined : match.reason,
      };
    }
  }

  return bestMatch;
}

export interface DuplicateGroup {
  canonical: {
    id: string;
    title: string;
    company_name: string | null;
    created_at: string;
    origin_type: string | null;
  };
  duplicates: Array<{
    id: string;
    title: string;
    company_name: string | null;
    created_at: string;
    origin_type: string | null;
    similarity: number;
    reason?: 'exact_url' | 'exact_text' | 'fuzzy';
  }>;
}

/**
 * Scan all live published jobs and group duplicates.
 * Returns groups where each group has a canonical job (oldest or native)
 * and its duplicates.
 */
export async function findAllDuplicateGroups(
  supabase: SupabaseClient
): Promise<DuplicateGroup[]> {
  const { data: jobs } = await supabase
    .from('jobs')
    .select(JOB_SELECT)
    .eq('published', true)
    .eq('approval_status', 'approved')
    .is('removed_at', null)
    .order('created_at', { ascending: true });

  if (!jobs || jobs.length < 2) {
    return [];
  }

  const rows = jobs as JobRow[];
  const used = new Set<string>();
  const identities = new Map(
    rows.map((job) => [
      job.id,
      buildJobIdentity({
        title: job.title,
        companyName: job.company_name,
        urls: getJobUrls(job),
      }),
    ])
  );
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (used.has(rows[i].id)) {
      continue;
    }

    const baseIdentity = identities.get(rows[i].id);
    if (!baseIdentity) {
      continue;
    }

    const cluster: JobRow[] = [rows[i]];
    const matchMeta = new Map<
      string,
      { similarity: number; reason: 'exact_url' | 'exact_text' | 'fuzzy' }
    >();

    for (let j = i + 1; j < rows.length; j++) {
      if (used.has(rows[j].id)) {
        continue;
      }

      const candidateIdentity = identities.get(rows[j].id);
      if (!candidateIdentity) {
        continue;
      }

      const match = compareJobIdentity(baseIdentity, candidateIdentity);
      if (match.duplicate) {
        cluster.push(rows[j]);
        matchMeta.set(rows[j].id, {
          similarity: Math.round(match.score * 100),
          reason: match.reason === 'none' ? 'fuzzy' : match.reason,
        });
      }
    }

    if (cluster.length <= 1) {
      continue;
    }

    cluster.sort(compareCanonicalPriority);

    const canonical = cluster[0];
    const duplicates = cluster.slice(1);

    used.add(canonical.id);
    for (const duplicate of duplicates) {
      used.add(duplicate.id);
    }

    groups.push({
      canonical: {
        id: canonical.id,
        title: canonical.title,
        company_name: canonical.company_name,
        created_at: canonical.created_at,
        origin_type: canonical.origin_type,
      },
      duplicates: duplicates.map((duplicate) => ({
        id: duplicate.id,
        title: duplicate.title,
        company_name: duplicate.company_name,
        created_at: duplicate.created_at,
        origin_type: duplicate.origin_type,
        similarity: matchMeta.get(duplicate.id)?.similarity ?? 0,
        reason: matchMeta.get(duplicate.id)?.reason,
      })),
    });
  }

  return groups;
}

/**
 * Hide duplicate jobs by marking them as archived/removed.
 * Keeps the canonical job live.
 */
export async function hideDuplicateJobs(
  supabase: SupabaseClient,
  duplicateJobIds: string[]
): Promise<{ hidden: number; errors: string[] }> {
  const errors: string[] = [];
  let hidden = 0;

  for (const id of duplicateJobIds) {
    const { error } = await supabase
      .from('jobs')
      .update({
        lifecycle_status: 'removed',
        published: false,
        removed_at: new Date().toISOString(),
        removal_reason: 'duplicate',
      })
      .eq('id', id);

    if (error) {
      errors.push(`${id}: ${error.message}`);
    } else {
      hidden++;
    }
  }

  return { hidden, errors };
}
