import { NextRequest, NextResponse } from 'next/server';
import { runAllScrapers, runScraper, listScraperSources, deduplicateJobs } from '@/lib/scrapers/registry';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { ingestAllResults, ingestScrapeResult } from '@/lib/scrapers/ingestion';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  facebookLimitFromMaxPages,
  processPendingFacebookRawPosts,
} from '@/lib/scrapers/facebook-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET /api/admin/scrapers — list available scrapers
 * POST /api/admin/scrapers — run scrapers (all or specific source)
 *
 * Auth: CRON_SECRET or Vercel cron header (same as cron routes).
 *
 * POST body (optional):
 *   { "source": "reliefweb" }         — run single scraper
 *   { "source": "all", "maxPages": 2 } — run all with config
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    sources: listScraperSources(),
    usage: 'POST with { "source": "reliefweb" } or { "source": "all" }',
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const source = (body as { source?: string }).source || 'all';
    const maxPages = (body as { maxPages?: number }).maxPages;
    const facebookLimit = facebookLimitFromMaxPages(maxPages, 50);

    if (source === 'all') {
      const overrides = maxPages
        ? Object.fromEntries(listScraperSources().map((s) => [s, { maxPages }]))
        : undefined;

      const aggregate = await runAllScrapers(overrides);
      const dedupedJobs = deduplicateJobs(aggregate.results);

      // Ingest into aggregation tracking system
      const ingestionResults = await ingestAllResults(aggregate.results, 'manual');
      const supabase = createServiceSupabaseClient();
      const facebookResult = await processPendingFacebookRawPosts(supabase, {
        limit: facebookLimit,
        triggerType: 'manual',
      });

      return NextResponse.json({
        total_jobs: dedupedJobs.length + facebookResult.jobs_extracted,
        total_before_dedup: aggregate.total_jobs + facebookResult.jobs_extracted,
        duration_ms: aggregate.duration_ms + facebookResult.duration_ms,
        sources: [
          ...aggregate.results.map((r) => ({
            source: r.source,
            jobs: r.jobs.length,
            errors: r.errors,
            duration_ms: r.duration_ms,
          })),
          {
            source: 'facebook',
            jobs: facebookResult.jobs_extracted,
            errors: facebookResult.errors,
            duration_ms: facebookResult.duration_ms,
            queued_posts: facebookResult.queued,
            failed_posts: facebookResult.failed_posts,
            image_assisted_posts: facebookResult.image_assisted_posts,
          },
        ],
        ingestion: {
          runs: ingestionResults.length + (facebookResult.ingestion ? 1 : 0),
          total_inserted:
            ingestionResults.reduce((s, r) => s + r.inserted, 0) +
            (facebookResult.ingestion?.inserted || 0),
          total_duplicates:
            ingestionResults.reduce((s, r) => s + r.duplicates, 0) +
            (facebookResult.ingestion?.duplicates || 0),
          details: [
            ...ingestionResults.map((r) => ({
              runId: r.runId,
              status: r.status,
              inserted: r.inserted,
              duplicates: r.duplicates,
              suspicious: r.suspicious,
            })),
            ...(facebookResult.ingestion
              ? [
                  {
                    runId: facebookResult.ingestion.runId,
                    status: facebookResult.ingestion.status,
                    inserted: facebookResult.ingestion.inserted,
                    duplicates: facebookResult.ingestion.duplicates,
                    suspicious: facebookResult.ingestion.suspicious,
                  },
                ]
              : []),
          ],
          facebook: facebookResult,
        },
        sample_jobs: dedupedJobs.slice(0, 5).map((j) => ({
          title: j.title,
          company: j.company_name,
          location: j.location,
          source: j.source,
          url: j.url,
        })),
      });
    }

    if (source === 'facebook') {
      const supabase = createServiceSupabaseClient();
      const result = await processPendingFacebookRawPosts(supabase, {
        limit: facebookLimit,
        triggerType: 'manual',
      });

      return NextResponse.json({
        source: 'facebook',
        jobs: result.jobs_extracted,
        errors: result.errors,
        duration_ms: result.duration_ms,
        queued_posts: result.queued,
        jobs_inserted: result.jobs_inserted,
        skipped_posts: result.skipped_posts,
        non_job_posts: result.non_job_posts,
        failed_posts: result.failed_posts,
        image_assisted_posts: result.image_assisted_posts,
        ingestion: result.ingestion,
      });
    }

    // Single scraper
    const config = maxPages ? { maxPages } : undefined;
    const result = await runScraper(source, config);

    // Ingest into aggregation tracking system
    const ingested = await ingestScrapeResult(result, 'manual');

    return NextResponse.json({
      source: result.source,
      jobs: result.jobs.length,
      errors: result.errors,
      duration_ms: result.duration_ms,
      pages_scraped: result.pages_scraped,
      ingestion: ingested ? {
        runId: ingested.runId,
        status: ingested.status,
        inserted: ingested.inserted,
        duplicates: ingested.duplicates,
        suspicious: ingested.suspicious,
      } : null,
      sample_jobs: result.jobs.slice(0, 5).map((j) => ({
        title: j.title,
        company: j.company_name,
        location: j.location,
        region: j.region,
        language: j.language,
        url: j.url,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Scraper run failed', details: String(err) },
      { status: 500 }
    );
  }
}
