import { NextRequest, NextResponse } from 'next/server';
import { runAllScrapers, runScraper, listScraperSources, deduplicateJobs } from '@/lib/scrapers/registry';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

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

    if (source === 'all') {
      const overrides = maxPages
        ? Object.fromEntries(listScraperSources().map((s) => [s, { maxPages }]))
        : undefined;

      const aggregate = await runAllScrapers(overrides);
      const dedupedJobs = deduplicateJobs(aggregate.results);

      return NextResponse.json({
        total_jobs: dedupedJobs.length,
        total_before_dedup: aggregate.total_jobs,
        duration_ms: aggregate.duration_ms,
        sources: aggregate.results.map((r) => ({
          source: r.source,
          jobs: r.jobs.length,
          errors: r.errors,
          duration_ms: r.duration_ms,
        })),
        sample_jobs: dedupedJobs.slice(0, 5).map((j) => ({
          title: j.title,
          company: j.company_name,
          location: j.location,
          source: j.source,
          url: j.url,
        })),
      });
    }

    // Single scraper
    const config = maxPages ? { maxPages } : undefined;
    const result = await runScraper(source, config);

    return NextResponse.json({
      source: result.source,
      jobs: result.jobs.length,
      errors: result.errors,
      duration_ms: result.duration_ms,
      pages_scraped: result.pages_scraped,
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
