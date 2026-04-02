/**
 * Cross-source deduplication for scraped jobs.
 *
 * Uses the shared job identity model so legacy feed dedupe follows the same
 * rules as discovered-job ingestion and published-job duplicate cleanup.
 */

import { buildJobIdentity, compareJobIdentity } from '@/lib/jobs/dedupe-model';

import type { ScrapedJob } from './types';

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
 * Exact URL and exact title/company hashes are grouped immediately, then
 * fuzzy title/company matching merges near-duplicates across sources.
 */
export function deduplicateCrossSources(jobs: ScrapedJob[]): DedupResult {
  const duplicateLog: DedupResult['duplicates'] = [];
  const grouped = new Map<
    string,
    Array<{ job: ScrapedJob; identity: ReturnType<typeof buildJobIdentity> }>
  >();

  for (const job of jobs) {
    const identity = buildJobIdentity({
      title: job.title,
      companyName: job.company_name,
      urls: [job.url],
    });
    const groupKey = identity.urls[0] || identity.textHash;
    const group = grouped.get(groupKey);
    if (group) {
      group.push({ job, identity });
    } else {
      grouped.set(groupKey, [{ job, identity }]);
    }
  }

  const groupList = [...grouped.values()];
  const mergedClusters: Array<Array<{ job: ScrapedJob; identity: ReturnType<typeof buildJobIdentity> }>> = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < groupList.length; i++) {
    if (usedIndices.has(i)) {
      continue;
    }

    const cluster = [...groupList[i]];
    usedIndices.add(i);

    for (let j = i + 1; j < groupList.length; j++) {
      if (usedIndices.has(j)) {
        continue;
      }

      const reference = cluster[0];
      const candidate = groupList[j][0];
      if (!reference || !candidate) {
        continue;
      }

      const match = compareJobIdentity(reference.identity, candidate.identity);
      if (match.duplicate) {
        cluster.push(...groupList[j]);
        usedIndices.add(j);
      }
    }

    mergedClusters.push(cluster);
  }

  const unique: ScrapedJob[] = [];

  for (const cluster of mergedClusters) {
    cluster.sort((a, b) => {
      const scoreDiff = completenessScore(b.job) - completenessScore(a.job);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const dateA = a.job.posted_at ? new Date(a.job.posted_at).getTime() : 0;
      const dateB = b.job.posted_at ? new Date(b.job.posted_at).getTime() : 0;
      return dateB - dateA;
    });

    const best = cluster[0]?.job;
    if (!best) {
      continue;
    }

    unique.push(best);

    if (cluster.length > 1) {
      const sources = new Set(cluster.map((entry) => entry.job.source));
      if (sources.size > 1) {
        duplicateLog.push({
          kept: { source: best.source, title: best.title },
          removed: cluster.slice(1).map((entry) => ({
            source: entry.job.source,
            title: entry.job.title,
          })),
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
