/**
 * Cross-source job deduplication.
 *
 * Jobs frequently appear on multiple Cameroon platforms. This module
 * detects duplicates across sources using fuzzy title + company matching
 * and keeps the best version (most complete data, most recent).
 */

import type { ScrapedJob } from './types';

/**
 * Normalize text for comparison: lowercase, strip accents, collapse whitespace,
 * remove common filler words.
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

/** Generate a fingerprint for dedup comparison. */
function fingerprint(job: ScrapedJob): string {
  const title = normalizeText(job.title);
  const company = normalizeText(job.company_name || '');

  // Take first 5 significant words of title (skip common prefixes)
  const skipWords = new Set(['recrutement', 'recruitment', 'hiring', 'avis', 'offre', 'de', 'un', 'une', 'des', 'le', 'la', 'les', 'a', 'the', 'an', 'for', 'of', 'at', 'and', 'et']);
  const titleWords = title.split(' ').filter((w) => w.length > 1 && !skipWords.has(w));
  const titleKey = titleWords.slice(0, 5).join(' ');

  // Take first 3 words of company
  const companyKey = company.split(' ').slice(0, 3).join(' ');

  return `${titleKey}|${companyKey}`;
}

/** Calculate similarity between two strings (Jaccard on word sets). */
function similarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' ').filter((w) => w.length > 2));
  const setB = new Set(normalizeText(b).split(' ').filter((w) => w.length > 2));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/** Score a job's completeness (more fields = better). */
function completenessScore(job: ScrapedJob): number {
  let score = 0;
  if (job.title) score += 1;
  if (job.company_name) score += 2;
  if (job.description) score += 2;
  if (job.salary) score += 3;
  if (job.location && job.location !== 'Cameroon') score += 1;
  if (job.region) score += 1;
  if (job.job_type) score += 1;
  if (job.posted_at) score += 1;
  if (job.closing_at) score += 1;
  if (job.company_logo) score += 1;
  return score;
}

export interface DedupResult {
  unique: ScrapedJob[];
  duplicates: Array<{
    kept: { source: string; title: string };
    removed: Array<{ source: string; title: string }>;
  }>;
  stats: {
    total_input: number;
    total_output: number;
    duplicates_removed: number;
  };
}

/**
 * Deduplicate jobs across all sources.
 *
 * Uses fingerprint-based grouping with fuzzy matching fallback.
 * For each group of duplicates, keeps the version with the highest
 * completeness score.
 */
export function deduplicateCrossSources(jobs: ScrapedJob[]): DedupResult {
  const groups = new Map<string, ScrapedJob[]>();
  const duplicateLog: DedupResult['duplicates'] = [];

  // Phase 1: Group by fingerprint
  for (const job of jobs) {
    const fp = fingerprint(job);
    const existing = groups.get(fp);
    if (existing) {
      existing.push(job);
    } else {
      groups.set(fp, [job]);
    }
  }

  // Phase 2: Within each fingerprint group, merge if different sources
  // Phase 3: Also do fuzzy matching between groups for near-duplicates
  const groupList = [...groups.values()];
  const merged: ScrapedJob[][] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < groupList.length; i++) {
    if (usedIndices.has(i)) continue;

    const cluster = [...groupList[i]];
    usedIndices.add(i);

    // Check remaining groups for fuzzy matches
    const refTitle = cluster[0].title;
    const refCompany = cluster[0].company_name || '';

    for (let j = i + 1; j < groupList.length; j++) {
      if (usedIndices.has(j)) continue;

      const candidate = groupList[j][0];
      const titleSim = similarity(refTitle, candidate.title);
      const companySim = refCompany && candidate.company_name
        ? similarity(refCompany, candidate.company_name)
        : 0;

      // High title similarity + some company match = duplicate
      if (titleSim > 0.7 && (companySim > 0.5 || (!refCompany && !candidate.company_name))) {
        cluster.push(...groupList[j]);
        usedIndices.add(j);
      }
    }

    merged.push(cluster);
  }

  // Phase 4: From each cluster, pick the best job
  const unique: ScrapedJob[] = [];

  for (const cluster of merged) {
    // Sort by completeness (descending), then by posted_at (most recent first)
    cluster.sort((a, b) => {
      const scoreDiff = completenessScore(b) - completenessScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      // Prefer more recent
      const dateA = a.posted_at ? new Date(a.posted_at).getTime() : 0;
      const dateB = b.posted_at ? new Date(b.posted_at).getTime() : 0;
      return dateB - dateA;
    });

    const best = cluster[0];
    unique.push(best);

    // Log duplicates if there were multiple sources
    if (cluster.length > 1) {
      const sources = new Set(cluster.map((j) => j.source));
      if (sources.size > 1) {
        duplicateLog.push({
          kept: { source: best.source, title: best.title },
          removed: cluster.slice(1).map((j) => ({ source: j.source, title: j.title })),
        });
      }
    }
  }

  return {
    unique,
    duplicates: duplicateLog,
    stats: {
      total_input: jobs.length,
      total_output: unique.length,
      duplicates_removed: jobs.length - unique.length,
    },
  };
}
