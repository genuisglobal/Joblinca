import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runRefreshJobsDispatch } from '@/lib/scrapers/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Weekly backfill depth — paginate far past the daily ceiling with
// early-stop disabled, so anything the frequent runs missed gets swept up.
const DEEP_SWEEP_MAX_PAGES = 10;

/**
 * Weekly deep-sweep dispatcher (Sunday, see vercel.json).
 *
 * Same fan-out as /api/cron/refresh-jobs but with full pagination (no
 * early-stop) and a deeper page ceiling — a safety net that backfills any
 * job the intraday runs missed. Skips the legacy external feed since the
 * daily runs already refresh it.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runRefreshJobsDispatch({
      origin: new URL(request.url).origin,
      maxPages: DEEP_SWEEP_MAX_PAGES,
      earlyStop: false,
      includeExternalFeed: false,
    });

    console.log('[cron] Deep sweep complete');
    return NextResponse.json(summary);
  } catch (err) {
    console.error('[cron] Fatal error during deep sweep:', err);
    return NextResponse.json(
      { error: 'Deep sweep failed', details: String(err) },
      { status: 500 },
    );
  }
}
