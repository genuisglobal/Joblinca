import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  clearRetiredExternalFeedSources,
  fetchExternalFeedJobs,
  replaceExternalJobsBySource,
} from '@/lib/externalJobs';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runAutoPipelineMaintenance } from '@/lib/scrapers/auto-pipeline';
import {
  AUTOMATED_SCRAPER_SOURCE_SLUGS,
  FACEBOOK_SCRAPER_SOURCE_SLUG,
} from '@/lib/scrapers/catalog';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SCRAPE_MAX_PAGES = 2;

interface SourceDispatchResult {
  source: string;
  ok: boolean;
  status: number;
  jobs?: number;
  error?: string;
}

/**
 * Daily aggregation dispatcher.
 *
 * Instead of scraping every source sequentially in one function (which exceeded
 * the 300s limit and never reached the publish stage), this fans out one request
 * per source to /api/cron/scrape-source — each running in its OWN serverless
 * invocation with its own 300s budget, in parallel. Total wall-clock ≈ the
 * slowest single source rather than the sum of all of them. It then runs the
 * fast maintenance pass inline so trustworthy jobs publish in the same cycle.
 *
 * Triggered by Vercel Cron, or manually with a CRON_SECRET bearer token.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const origin = new URL(request.url).origin;
  const cronSecret = (process.env.CRON_SECRET || '').trim();

  try {
    // --- 1. Legacy external feed (remote/international; single fast pass) ---
    const jobs = await fetchExternalFeedJobs();
    const retiredSourceSummary = { cleared: true, error: null as string | null };
    try {
      await clearRetiredExternalFeedSources(supabase);
    } catch (retiredSourceError) {
      retiredSourceSummary.cleared = false;
      retiredSourceSummary.error = String(retiredSourceError);
      console.error('[cron] Failed to clear retired external feed rows:', retiredSourceError);
    }
    const externalFeedSummary = await replaceExternalJobsBySource(supabase, jobs);
    console.log(`[cron] Refreshed ${jobs.length} legacy external feed jobs`);

    // --- 2. Fan out per-source scrapes (parallel, isolated invocations) ---
    const sources = [...AUTOMATED_SCRAPER_SOURCE_SLUGS, FACEBOOK_SCRAPER_SOURCE_SLUG];
    console.log(`[cron] Dispatching ${sources.length} per-source scrapes...`);

    const dispatch = await Promise.allSettled(
      sources.map(async (source): Promise<SourceDispatchResult> => {
        const url = `${origin}/api/cron/scrape-source?source=${encodeURIComponent(
          source,
        )}&maxPages=${SCRAPE_MAX_PAGES}`;
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
    console.log('[cron] Scrape dispatch complete:', scrapeSummary);

    // --- 3. Publish + dedup + archive (fast) so jobs go live this cycle ---
    let maintenanceSummary: unknown = null;
    try {
      maintenanceSummary = await runAutoPipelineMaintenance();
      console.log('[cron] Maintenance complete:', maintenanceSummary);
    } catch (maintErr) {
      console.error('[cron] Maintenance error (non-fatal):', maintErr);
      maintenanceSummary = { error: String(maintErr) };
    }

    const summary = {
      success: true,
      external_feed: {
        fetched: jobs.length,
        inserted: externalFeedSummary.inserted,
        errors: externalFeedSummary.errors,
        sources: externalFeedSummary.sources,
        retired_external_sources: retiredSourceSummary,
      },
      scrape_dispatch: scrapeSummary,
      maintenance: maintenanceSummary,
      timestamp: new Date().toISOString(),
    };

    console.log('[cron] Refresh complete');
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[cron] Fatal error during job refresh:', err);
    return NextResponse.json(
      { error: 'Job refresh failed', details: String(err) },
      { status: 500 },
    );
  }
}
