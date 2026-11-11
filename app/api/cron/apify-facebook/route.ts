import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { isApifyConfigured } from '@/lib/apify/client';
import { startFacebookGroupRuns, startLeadSearchRun } from '@/lib/apify/facebook-runs';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/apify-facebook?task=jobs|leads
 *
 * Starts Apify runs only; results arrive later at /api/webhooks/apify.
 *   jobs  - daily: one facebook-groups-scraper run per enabled group
 *   leads - weekly: facebook-search-scraper for recruiter/company Pages
 *
 * Auth: CRON_SECRET bearer. Needs APIFY_TOKEN + APIFY_WEBHOOK_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = request.nextUrl.searchParams.get('task');
  if (task !== 'jobs' && task !== 'leads') {
    return NextResponse.json({ error: 'Use ?task=jobs or ?task=leads' }, { status: 400 });
  }

  if (!isApifyConfigured()) {
    return NextResponse.json(
      { skipped: true, reason: 'APIFY_TOKEN / APIFY_WEBHOOK_SECRET not configured' },
      { status: 200 },
    );
  }

  try {
    const supabase = createServiceSupabaseClient();
    const origin = request.nextUrl.origin;
    const summary =
      task === 'jobs'
        ? await startFacebookGroupRuns(supabase, origin)
        : await startLeadSearchRun(supabase, origin);

    return NextResponse.json({ task, ...summary }, { status: summary.errors.length && !summary.started.length ? 502 : 200 });
  } catch (err) {
    console.error('[cron:apify-facebook]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to start Apify run' },
      { status: 500 },
    );
  }
}
