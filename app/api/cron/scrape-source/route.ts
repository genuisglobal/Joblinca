import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runScraper } from '@/lib/scrapers/registry';
import { ingestScrapeResult } from '@/lib/scrapers/ingestion';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  facebookLimitFromMaxPages,
  processPendingFacebookRawPosts,
} from '@/lib/scrapers/facebook-pipeline';
import {
  FACEBOOK_SCRAPER_SOURCE_SLUG,
  getScraperSourceCatalogEntry,
} from '@/lib/scrapers/catalog';

export const runtime = 'nodejs';
export const maxDuration = 300; // each source gets its OWN 300s budget

/**
 * Per-source scrape worker.
 *
 * Scrapes and ingests a SINGLE source in its own serverless invocation, so the
 * daily dispatcher (/api/cron/refresh-jobs) can fan out across sources in
 * parallel instead of scraping all of them sequentially in one function — which
 * was exceeding the 300s limit and never reaching the publish stage.
 *
 * GET /api/cron/scrape-source?source=<slug>&maxPages=2
 * Auth: CRON_SECRET bearer (passed by the dispatcher) or Vercel cron header.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const source = (searchParams.get('source') || '').trim();
  const maxPages = Number(searchParams.get('maxPages')) || 2;
  const earlyStop = searchParams.get('earlyStop') === '1';

  if (!source) {
    return NextResponse.json({ error: 'Missing ?source=' }, { status: 400 });
  }

  try {
    // Facebook group backlog is processed differently (no live scrape).
    if (source === FACEBOOK_SCRAPER_SOURCE_SLUG) {
      const supabase = createServiceSupabaseClient();
      const result = await processPendingFacebookRawPosts(supabase, {
        limit: facebookLimitFromMaxPages(maxPages, 75),
        triggerType: 'cron',
      });
      return NextResponse.json({
        success: true,
        source,
        jobs: result.jobs_extracted,
        errors: result.errors,
        duration_ms: result.duration_ms,
        ingestion: result.ingestion,
      });
    }

    if (!getScraperSourceCatalogEntry(source)) {
      return NextResponse.json(
        { error: `Unknown source: ${source}` },
        { status: 400 },
      );
    }

    const result = await runScraper(source, { maxPages, earlyStop });
    const ingested = await ingestScrapeResult(result, 'cron');

    return NextResponse.json({
      success: true,
      source: result.source,
      jobs: result.jobs.length,
      errors: result.errors,
      duration_ms: result.duration_ms,
      pages_scraped: result.pages_scraped,
      ingestion: ingested
        ? {
            runId: ingested.runId,
            status: ingested.status,
            inserted: ingested.inserted,
            duplicates: ingested.duplicates,
            suspicious: ingested.suspicious,
          }
        : null,
    });
  } catch (err) {
    console.error(`[cron scrape-source:${source}] Error:`, err);
    return NextResponse.json(
      { error: 'Scrape failed', source, details: String(err) },
      { status: 500 },
    );
  }
}
