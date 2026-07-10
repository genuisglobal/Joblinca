/**
 * Coverage sentinel — detects when the aggregation pipeline is silently
 * missing jobs.
 *
 * A scraper that breaks (site HTML changed, Cloudflare, expired API key)
 * usually FAILS QUIETLY: it returns 0 jobs with no errors, the run is marked
 * "completed", and the source looks healthy. This module compares each
 * source's latest runs against its own 7-day baseline and surfaces:
 *
 *   - no_recent_run:        source hasn't run on schedule
 *   - consecutive_failures: the last 2+ runs failed outright
 *   - zero_yield:           latest run fetched 0 jobs from a normally-productive source
 *   - low_yield:            latest run fetched < 50% of the source's baseline
 *   - no_new_jobs:          nothing new ingested in 48h from a normally-active source
 *
 * Used by the aggregation-digest cron (daily admin report) and available to
 * the admin dashboard.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SCRAPER_SOURCE_CATALOG } from './catalog';

const BASELINE_WINDOW_HOURS = 7 * 24;
const RECENT_RUN_MAX_AGE_HOURS = 30;
const LOW_YIELD_RATIO = 0.5;
/** Baselines below this are too noisy to judge yield against */
const MIN_BASELINE_FETCHED = 6;
const MIN_BASELINE_FOR_ZERO_YIELD = 3;

export type AnomalyType =
  | 'no_recent_run'
  | 'consecutive_failures'
  | 'zero_yield'
  | 'low_yield'
  | 'no_new_jobs'
  | 'dead_source';

export interface CoverageAnomaly {
  source: string;
  type: AnomalyType;
  severity: 'critical' | 'warning';
  message: string;
}

export interface SourceCoverage {
  slug: string;
  label: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_fetched: number | null;
  runs_7d: number;
  baseline_fetched_per_run: number;
  fetched_24h: number;
  inserted_24h: number;
  inserted_48h: number;
  anomalies: CoverageAnomaly[];
}

export interface ReviewQueueSnapshot {
  needs_review: number;
  suspicious: number;
  oldest_review_days: number | null;
}

export interface CoverageReport {
  generated_at: string;
  sources: SourceCoverage[];
  anomalies: CoverageAnomaly[];
  review_queue: ReviewQueueSnapshot;
}

interface RunRow {
  source_id: string;
  status: string;
  started_at: string | null;
  created_at: string;
  fetched_count: number | null;
  inserted_count: number | null;
}

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 3_600_000;
}

function runTime(run: RunRow): string {
  return run.started_at || run.created_at;
}

export async function runCoverageSentinel(
  supabase: SupabaseClient
): Promise<CoverageReport> {
  const windowStart = new Date(
    Date.now() - BASELINE_WINDOW_HOURS * 3_600_000
  ).toISOString();

  // Sources registered in the DB (created lazily by ingestion)
  const { data: dbSources } = await supabase
    .from('aggregation_sources')
    .select('id, slug, name, enabled')
    .in('slug', SCRAPER_SOURCE_CATALOG.map((s) => s.slug));

  const sourcesBySlug = new Map(
    (dbSources || []).map((s) => [s.slug as string, s])
  );

  // All runs in the baseline window (finished or not)
  const sourceIds = (dbSources || []).map((s) => s.id);
  let runs: RunRow[] = [];
  if (sourceIds.length > 0) {
    const { data } = await supabase
      .from('aggregation_runs')
      .select('source_id, status, started_at, created_at, fetched_count, inserted_count')
      .in('source_id', sourceIds)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false });
    runs = (data || []) as RunRow[];
  }

  const runsBySource = new Map<string, RunRow[]>();
  for (const run of runs) {
    const list = runsBySource.get(run.source_id) || [];
    list.push(run);
    runsBySource.set(run.source_id, list);
  }

  const sources: SourceCoverage[] = [];

  for (const catalogEntry of SCRAPER_SOURCE_CATALOG) {
    const dbSource = sourcesBySlug.get(catalogEntry.slug);
    const sourceRuns = dbSource ? runsBySource.get(dbSource.id) || [] : [];
    // Exclude stuck 'running' rows from yield judgments
    const finishedRuns = sourceRuns.filter((r) => r.status !== 'running');
    const lastRun = finishedRuns[0] || null;

    const fetched24h = finishedRuns
      .filter((r) => hoursSince(runTime(r)) <= 24)
      .reduce((s, r) => s + (r.fetched_count || 0), 0);
    const inserted24h = finishedRuns
      .filter((r) => hoursSince(runTime(r)) <= 24)
      .reduce((s, r) => s + (r.inserted_count || 0), 0);
    const inserted48h = finishedRuns
      .filter((r) => hoursSince(runTime(r)) <= 48)
      .reduce((s, r) => s + (r.inserted_count || 0), 0);

    // Baseline: average fetched per successful run, excluding the latest run
    // (so a broken latest run can't drag its own baseline down)
    const baselineRuns = finishedRuns
      .slice(1)
      .filter((r) => r.status === 'completed' || r.status === 'partial');
    const baselineFetched =
      baselineRuns.length > 0
        ? baselineRuns.reduce((s, r) => s + (r.fetched_count || 0), 0) /
          baselineRuns.length
        : 0;

    const anomalies: CoverageAnomaly[] = [];
    const label = catalogEntry.label;

    // Facebook is manual intake — only report run failures, not yield
    const isManual = catalogEntry.sourceType === 'manual';

    if (!lastRun) {
      anomalies.push({
        source: catalogEntry.slug,
        type: 'no_recent_run',
        severity: 'critical',
        message: `${label}: no runs recorded in the last 7 days.`,
      });
    } else {
      const lastRunAgeH = hoursSince(runTime(lastRun));
      if (lastRunAgeH > RECENT_RUN_MAX_AGE_HOURS) {
        anomalies.push({
          source: catalogEntry.slug,
          type: 'no_recent_run',
          severity: 'critical',
          message: `${label}: last run was ${Math.round(lastRunAgeH)}h ago (expected several runs per day).`,
        });
      }

      const recentFailures = finishedRuns.slice(0, 3);
      if (
        recentFailures.length >= 2 &&
        recentFailures.slice(0, 2).every((r) => r.status === 'failed')
      ) {
        anomalies.push({
          source: catalogEntry.slug,
          type: 'consecutive_failures',
          severity: 'critical',
          message: `${label}: last ${recentFailures.filter((r) => r.status === 'failed').length}+ runs failed.`,
        });
      }

      // Source that has yielded 0 jobs in EVERY run for the whole window —
      // broken selector, blocked (Cloudflare), or missing API credentials.
      // zero_yield can't catch this because the baseline itself is 0.
      if (
        !isManual &&
        finishedRuns.length >= 3 &&
        finishedRuns.every((r) => (r.fetched_count || 0) === 0)
      ) {
        anomalies.push({
          source: catalogEntry.slug,
          type: 'dead_source',
          severity: 'critical',
          message: `${label}: fetched 0 jobs in all ${finishedRuns.length} runs over 7 days — scraper is blocked, broken, or missing credentials.`,
        });
      }

      if (!isManual && lastRun.status !== 'failed') {
        const lastFetched = lastRun.fetched_count || 0;
        if (lastFetched === 0 && baselineFetched >= MIN_BASELINE_FOR_ZERO_YIELD) {
          anomalies.push({
            source: catalogEntry.slug,
            type: 'zero_yield',
            severity: 'critical',
            message: `${label}: latest run fetched 0 jobs (baseline ~${Math.round(baselineFetched)}/run). The scraper may be broken.`,
          });
        } else if (
          baselineFetched >= MIN_BASELINE_FETCHED &&
          lastFetched > 0 &&
          lastFetched < baselineFetched * LOW_YIELD_RATIO
        ) {
          anomalies.push({
            source: catalogEntry.slug,
            type: 'low_yield',
            severity: 'warning',
            message: `${label}: latest run fetched ${lastFetched} jobs vs baseline ~${Math.round(baselineFetched)}/run.`,
          });
        }
      }

      // Normally-active source with nothing new in 48h
      if (!isManual && finishedRuns.length >= 4) {
        const totalInserted7d = finishedRuns.reduce(
          (s, r) => s + (r.inserted_count || 0),
          0
        );
        const avgInsertedPerDay = totalInserted7d / 7;
        if (avgInsertedPerDay >= 1 && inserted48h === 0) {
          anomalies.push({
            source: catalogEntry.slug,
            type: 'no_new_jobs',
            severity: 'warning',
            message: `${label}: no new jobs ingested in 48h (normally ~${avgInsertedPerDay.toFixed(1)}/day).`,
          });
        }
      }
    }

    sources.push({
      slug: catalogEntry.slug,
      label,
      last_run_at: lastRun ? runTime(lastRun) : null,
      last_run_status: lastRun?.status ?? null,
      last_run_fetched: lastRun?.fetched_count ?? null,
      runs_7d: finishedRuns.length,
      baseline_fetched_per_run: Math.round(baselineFetched * 10) / 10,
      fetched_24h: fetched24h,
      inserted_24h: inserted24h,
      inserted_48h: inserted48h,
      anomalies,
    });
  }

  // Review queue snapshot
  const [{ count: needsReview }, { count: suspicious }, oldestReview] =
    await Promise.all([
      supabase
        .from('discovered_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('ingestion_status', 'review_required')
        .is('native_job_id', null),
      supabase
        .from('discovered_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'suspicious')
        .is('native_job_id', null),
      supabase
        .from('discovered_jobs')
        .select('discovered_at')
        .eq('ingestion_status', 'review_required')
        .is('native_job_id', null)
        .order('discovered_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const oldestReviewDays = oldestReview?.data?.discovered_at
    ? Math.floor(hoursSince(oldestReview.data.discovered_at) / 24)
    : null;

  return {
    generated_at: new Date().toISOString(),
    sources,
    anomalies: sources.flatMap((s) => s.anomalies),
    review_queue: {
      needs_review: needsReview ?? 0,
      suspicious: suspicious ?? 0,
      oldest_review_days: oldestReviewDays,
    },
  };
}
