import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runRefreshJobsDispatch } from '@/lib/scrapers/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Deep enough to cover a busy posting day; early-stop pagination keeps quiet
// runs cheap by halting once a full page of already-seen jobs is reached.
const SCRAPE_MAX_PAGES = 6;

/**
 * Aggregation dispatcher — runs several times daily (see vercel.json).
 *
 * Fans out one request per source to /api/cron/scrape-source, each in its own
 * serverless invocation, then runs the fast maintenance pass inline so
 * trustworthy jobs publish in the same cycle.
 *
 * Triggered by Vercel Cron, or manually with a CRON_SECRET bearer token.
 * For the weekly full-pagination sweep, see /api/cron/refresh-jobs-deep.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runRefreshJobsDispatch({
      origin: new URL(request.url).origin,
      maxPages: SCRAPE_MAX_PAGES,
      earlyStop: true,
      includeExternalFeed: true,
    });

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
