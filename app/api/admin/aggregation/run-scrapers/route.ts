import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { runAllScrapers, runScraper, listScraperSources } from '@/lib/scrapers/registry';
import { ingestAllResults, ingestScrapeResult } from '@/lib/scrapers/ingestion';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

    if (source === 'all') {
      const overrides = Object.fromEntries(
        listScraperSources().map((s) => [s, { maxPages }])
      );

      const aggregate = await runAllScrapers(overrides);
      const ingestionResults = await ingestAllResults(aggregate.results, 'manual');

      return NextResponse.json({
        success: true,
        total_jobs: aggregate.total_jobs,
        duration_ms: aggregate.duration_ms,
        sources: aggregate.results.map((r) => ({
          source: r.source,
          jobs: r.jobs.length,
          errors: r.errors,
          duration_ms: r.duration_ms,
        })),
        ingestion: {
          runs: ingestionResults.length,
          total_inserted: ingestionResults.reduce((s, r) => s + r.inserted, 0),
          total_duplicates: ingestionResults.reduce((s, r) => s + r.duplicates, 0),
          details: ingestionResults.map((r) => ({
            runId: r.runId,
            status: r.status,
            inserted: r.inserted,
            duplicates: r.duplicates,
            suspicious: r.suspicious,
          })),
        },
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
