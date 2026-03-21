/**
 * Job deduplication utilities for the published jobs table.
 *
 * Prevents the same job from appearing multiple times on the public site,
 * even when scraped from different sources. Uses fuzzy title + company
 * matching with normalisation for accents, punctuation, and filler words.
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Normalize text for comparison: lowercase, strip accents, remove
 * punctuation, collapse whitespace, drop common filler words.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Skip words that add noise when comparing titles. */
const SKIP_WORDS = new Set([
  'recrutement', 'recruitment', 'hiring', 'avis', 'offre',
  'de', 'du', 'un', 'une', 'des', 'le', 'la', 'les', 'et',
  'a', 'the', 'an', 'for', 'of', 'at', 'and', 'is', 'are',
  'looking', 'recherche', 'cherche', 'recrute',
  'ngo', 'ong',
]);

/** Extract significant words from a title for comparison. */
function significantWords(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length > 1 && !SKIP_WORDS.has(w));
}

/** Jaccard similarity between two word sets. */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/** Normalize a company name for comparison. */
function normalizeCompany(name: string | null): string {
  if (!name) return '';
  return normalizeText(name)
    .replace(/\b(sarl|sa|sas|ltd|llc|inc|gmbh|plc|co|corp|group|international)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  company_name: string | null;
  similarity: number;
}

/**
 * Check if a job with similar title + company already exists in the
 * published jobs table. Returns the best match if found.
 *
 * Thresholds:
 * - Title similarity >= 0.65 AND company similarity >= 0.5  → duplicate
 * - Title similarity >= 0.85 (regardless of company)        → likely duplicate
 */
export async function findDuplicateJob(
  supabase: SupabaseClient,
  title: string,
  companyName: string | null,
): Promise<DuplicateCandidate | null> {
  // Fetch recent live published jobs for comparison
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id, title, company_name')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .in('lifecycle_status', ['live', 'on_hold'])
    .order('created_at', { ascending: false })
    .limit(500);

  if (!existingJobs || existingJobs.length === 0) return null;

  const inputWords = significantWords(title);
  const inputCompany = normalizeCompany(companyName);

  let bestMatch: DuplicateCandidate | null = null;
  let bestScore = 0;

  for (const job of existingJobs) {
    const jobWords = significantWords(job.title);
    const titleSim = jaccardSimilarity(inputWords, jobWords);

    // Quick reject
    if (titleSim < 0.5) continue;

    const jobCompany = normalizeCompany(job.company_name);
    const companySim = inputCompany && jobCompany
      ? jaccardSimilarity(inputCompany.split(' '), jobCompany.split(' '))
      : (!inputCompany && !jobCompany) ? 1 : 0;

    // Check thresholds
    const isDuplicate =
      (titleSim >= 0.65 && companySim >= 0.5) ||
      (titleSim >= 0.85);

    if (isDuplicate && titleSim > bestScore) {
      bestScore = titleSim;
      bestMatch = {
        id: job.id,
        title: job.title,
        company_name: job.company_name,
        similarity: Math.round(titleSim * 100),
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
  }>;
}

/**
 * Scan all live published jobs and group duplicates.
 * Returns groups where each group has a canonical job (oldest or native)
 * and its duplicates.
 */
export async function findAllDuplicateGroups(
  supabase: SupabaseClient,
): Promise<DuplicateGroup[]> {
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, company_name, created_at, origin_type')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .in('lifecycle_status', ['live', 'on_hold'])
    .order('created_at', { ascending: true });

  if (!jobs || jobs.length < 2) return [];

  const used = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < jobs.length; i++) {
    if (used.has(jobs[i].id)) continue;

    type JobRow = { id: string; title: string; company_name: string | null; created_at: string; origin_type: string | null };
    const cluster: JobRow[] = [jobs[i]];
    const iWords = significantWords(jobs[i].title);
    const iCompany = normalizeCompany(jobs[i].company_name);

    for (let j = i + 1; j < jobs.length; j++) {
      if (used.has(jobs[j].id)) continue;

      const jWords = significantWords(jobs[j].title);
      const titleSim = jaccardSimilarity(iWords, jWords);
      if (titleSim < 0.5) continue;

      const jCompany = normalizeCompany(jobs[j].company_name);
      const companySim = iCompany && jCompany
        ? jaccardSimilarity(iCompany.split(' '), jCompany.split(' '))
        : (!iCompany && !jCompany) ? 1 : 0;

      if ((titleSim >= 0.65 && companySim >= 0.5) || titleSim >= 0.85) {
        cluster.push(jobs[j]);
      }
    }

    if (cluster.length > 1) {
      // Pick canonical: prefer native jobs, then oldest
      cluster.sort((a: JobRow, b: JobRow) => {
        if (a.origin_type === 'native' && b.origin_type !== 'native') return -1;
        if (b.origin_type === 'native' && a.origin_type !== 'native') return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      const canonical = cluster[0];
      const duplicates = cluster.slice(1);

      for (const d of duplicates) used.add(d.id);
      used.add(canonical.id);

      groups.push({
        canonical: {
          id: canonical.id,
          title: canonical.title,
          company_name: canonical.company_name,
          created_at: canonical.created_at,
          origin_type: canonical.origin_type,
        },
        duplicates: duplicates.map((d: JobRow) => ({
          id: d.id,
          title: d.title,
          company_name: d.company_name,
          created_at: d.created_at,
          origin_type: d.origin_type,
          similarity: Math.round(
            jaccardSimilarity(significantWords(canonical.title), significantWords(d.title)) * 100
          ),
        })),
      });
    }
  }

  return groups;
}

/**
 * Hide duplicate jobs by marking them as archived/removed.
 * Keeps the canonical job live.
 */
export async function hideDuplicateJobs(
  supabase: SupabaseClient,
  duplicateJobIds: string[],
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
