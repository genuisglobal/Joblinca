import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import {
  runAllScrapers,
  runScraper,
  listAutomatedScraperSources,
} from '@/lib/scrapers/registry';
import { ingestAllResults, ingestScrapeResult } from '@/lib/scrapers/ingestion';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  facebookLimitFromMaxPages,
  processPendingFacebookRawPosts,
} from '@/lib/scrapers/facebook-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/aggregation/run-scrapers
 *
 * Admin-authenticated endpoint to trigger scrapers and ingest results
 * into the aggregation tracking system.
 *
 * Body: { "source": "kamerpower" } or { "source": "all", "maxPages": 1 }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const source = (body as { source?: string }).source || 'all';
    const maxPages = (body as { maxPages?: number }).maxPages || 1;
    const facebookLimit = facebookLimitFromMaxPages(maxPages, 50);

    if (source === 'all') {
      const overrides = Object.fromEntries(
        listAutomatedScraperSources().map((s) => [s, { maxPages }])
      );

      const aggregate = await runAllScrapers(overrides);
      const ingestionResults = await ingestAllResults(aggregate.results, 'manual');
      const supabase = createServiceSupabaseClient();
      const facebookResult = await processPendingFacebookRawPosts(supabase, {
        limit: facebookLimit,
        triggerType: 'manual',
      });

      return NextResponse.json({
        success: true,
        total_jobs: aggregate.total_jobs + facebookResult.jobs_extracted,
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
      });
    }

    if (source === 'facebook') {
      const supabase = createServiceSupabaseClient();
      const result = await processPendingFacebookRawPosts(supabase, {
        limit: facebookLimit,
        triggerType: 'manual',
      });

      return NextResponse.json({
        success: true,
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
    const result = await runScraper(source, { maxPages });
    const ingested = await ingestScrapeResult(result, 'manual');

    return NextResponse.json({
      success: true,
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
    });
  } catch (err) {
    console.error('[admin:run-scrapers] Error:', err);
    return NextResponse.json(
      { error: 'Scraper run failed', details: String(err) },
      { status: 500 }
    );
  }
}
