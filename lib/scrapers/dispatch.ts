/**
 * Shared scrape-dispatch logic for the refresh-jobs cron family.
 *
 * Fans out one request per source to /api/cron/scrape-source — each running in
 * its OWN serverless invocation with its own 300s budget, in parallel — then
 * runs the fast maintenance pass inline so trustworthy jobs publish in the
 * same cycle. Used by:
 *   - /api/cron/refresh-jobs        (several times daily, early-stop pagination)
 *   - /api/cron/refresh-jobs-deep   (weekly deep sweep, full pagination)
 */

import { createClient } from '@supabase/supabase-js';
import {
  clearRetiredExternalFeedSources,
  fetchExternalFeedJobs,
  replaceExternalJobsBySource,
} from '@/lib/externalJobs';
import { runAutoPipelineMaintenance } from '@/lib/scrapers/auto-pipeline';
import {
  AUTOMATED_SCRAPER_SOURCE_SLUGS,
  FACEBOOK_SCRAPER_SOURCE_SLUG,
} from '@/lib/scrapers/catalog';
import { sendAggregationAlert } from '@/lib/aggregation/alerts';

export interface SourceDispatchResult {
  source: string;
  ok: boolean;
  status: number;
  jobs?: number;
  error?: string;
}

export interface RefreshDispatchOptions {
  /** Origin of the deployment, used to call the per-source worker route */
  origin: string;
  /** Page ceiling passed to each scraper */
  maxPages: number;
  /** Stop paginating when a full page is already known (skip for deep sweeps) */
  earlyStop: boolean;
  /** Refresh the legacy external feed (remote intl jobs) in the same cycle */
  includeExternalFeed: boolean;
}

export interface RefreshDispatchSummary {
  success: boolean;
  mode: 'standard' | 'deep';
  external_feed: unknown;
  scrape_dispatch: {
    dispatched: number;
    succeeded: number;
    failed: number;
    total_jobs: number;
    results: SourceDispatchResult[];
  };
  maintenance: unknown;
  timestamp: string;
}

export async function runRefreshJobsDispatch(
  options: RefreshDispatchOptions
): Promise<RefreshDispatchSummary> {
  const { origin, maxPages, earlyStop, includeExternalFeed } = options;
  const cronSecret = (process.env.CRON_SECRET || '').trim();

  // --- 1. Legacy external feed (remote/international; single fast pass) ---
  let externalFeedSummary: unknown = { skipped: true };
  if (includeExternalFeed) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      const jobs = await fetchExternalFeedJobs();
      const retiredSourceSummary = { cleared: true, error: null as string | null };
      try {
        await clearRetiredExternalFeedSources(supabase);
      } catch (retiredSourceError) {
        retiredSourceSummary.cleared = false;
        retiredSourceSummary.error = String(retiredSourceError);
        console.error('[dispatch] Failed to clear retired external feed rows:', retiredSourceError);
      }
      const feedResult = await replaceExternalJobsBySource(supabase, jobs);
      externalFeedSummary = {
        fetched: jobs.length,
        inserted: feedResult.inserted,
        errors: feedResult.errors,
        sources: feedResult.sources,
        retired_external_sources: retiredSourceSummary,
      };
      console.log(`[dispatch] Refreshed ${jobs.length} legacy external feed jobs`);
    } else {
      externalFeedSummary = { skipped: true, reason: 'Supabase not configured' };
    }
  }

  // --- 2. Fan out per-source scrapes (parallel, isolated invocations) ---
  const sources = [...AUTOMATED_SCRAPER_SOURCE_SLUGS, FACEBOOK_SCRAPER_SOURCE_SLUG];
  console.log(`[dispatch] Dispatching ${sources.length} per-source scrapes (maxPages=${maxPages}, earlyStop=${earlyStop})...`);

  const dispatch = await Promise.allSettled(
    sources.map(async (source): Promise<SourceDispatchResult> => {
      const url =
        `${origin}/api/cron/scrape-source?source=${encodeURIComponent(source)}` +
        `&maxPages=${maxPages}&earlyStop=${earlyStop ? '1' : '0'}`;
      const res = await fetch(url, {
        headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
      });
      const body = (await res.json().catch(() => null)) as
        | { jobs?: number; error?: string }
        | null;
      return {
        source,
        ok: res.ok,
        status: res.status,
        jobs: body?.jobs,
        error: res.ok ? undefined : body?.error || `HTTP ${res.status}`,
      };
    }),
  );

  const scrapeResults: SourceDispatchResult[] = dispatch.map((d, i) =>
    d.status === 'fulfilled'
      ? d.value
      : { source: sources[i], ok: false, status: 0, error: String(d.reason) },
  );
  const scrapeSummary = {
    dispatched: sources.length,
    succeeded: scrapeResults.filter((r) => r.ok).length,
    failed: scrapeResults.filter((r) => !r.ok).length,
    total_jobs: scrapeResults.reduce((s, r) => s + (r.jobs || 0), 0),
    results: scrapeResults,
  };
  console.log('[dispatch] Scrape dispatch complete:', scrapeSummary);

  // Immediate alert on hard dispatch failures (a source's invocation errored).
  // Yield anomalies (zero jobs, low volume) are the daily digest's job.
  if (scrapeSummary.failed > 0) {
    const failedList = scrapeResults
      .filter((r) => !r.ok)
      .map((r) => `• ${r.source}: ${r.error}`)
      .join('\n');
    try {
      await sendAggregationAlert(
        `🚨 Joblinca scrape dispatch: ${scrapeSummary.failed}/${sources.length} source${
          scrapeSummary.failed !== 1 ? 's' : ''
        } failed\n${failedList}`
      );
    } catch (alertErr) {
      console.error('[dispatch] Alert delivery failed (non-fatal):', alertErr);
    }
  }

  // --- 3. Publish + dedup + archive (fast) so jobs go live this cycle ---
  let maintenanceSummary: unknown = null;
  try {
    maintenanceSummary = await runAutoPipelineMaintenance();
    console.log('[dispatch] Maintenance complete:', maintenanceSummary);
  } catch (maintErr) {
    console.error('[dispatch] Maintenance error (non-fatal):', maintErr);
    maintenanceSummary = { error: String(maintErr) };
  }

  return {
    success: true,
    mode: earlyStop ? 'standard' : 'deep',
    external_feed: externalFeedSummary,
    scrape_dispatch: scrapeSummary,
    maintenance: maintenanceSummary,
    timestamp: new Date().toISOString(),
  };
}
