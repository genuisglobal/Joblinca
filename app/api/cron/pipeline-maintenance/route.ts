import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { runAutoPipelineMaintenance } from '@/lib/scrapers/auto-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Lightweight maintenance cron — decoupled from the heavy scrape.
 *
 * The daily /api/cron/refresh-jobs run does the full scrape+ingest+publish in a
 * single invocation and can exceed the function timeout before it reaches the
 * auto-publish stage, leaving eligible jobs unpublished. This endpoint runs ONLY
 * the fast stages (close stale runs → auto-publish → dedup → archive expired),
 * so trustworthy discovered jobs reliably go live even when the scrape times out.
 *
 * Scheduled in vercel.json; also safe to trigger manually with CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runAutoPipelineMaintenance();

    if (!result) {
      return NextResponse.json(
        { error: 'Maintenance failed — Supabase not configured or no result' },
        { status: 500 },
      );
    }

    console.log('[cron pipeline-maintenance] Complete:', result);
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron pipeline-maintenance] Error:', err);
    return NextResponse.json(
      { error: 'Maintenance failed', details: String(err) },
      { status: 500 },
    );
  }
}
