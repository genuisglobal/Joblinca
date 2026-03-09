import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 60;

const cronDb = createServiceSupabaseClient();

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.length <= 200 ? message : `${message.slice(0, 197)}...`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lookbackHoursRaw = Number(
    process.env.MATCHING_AGENT_DAILY_LOOKBACK_HOURS || '168'
  );
  const lookbackHours = Number.isFinite(lookbackHoursRaw)
    ? Math.max(24, Math.min(336, Math.floor(lookbackHoursRaw)))
    : 168;

  const limitRaw = Number(process.env.MATCHING_AGENT_DAILY_JOB_LIMIT || '250');
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(500, Math.floor(limitRaw)))
    : 250;

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  try {
    const { data: jobs, error } = await cronDb
      .from('jobs')
      .select('id, approved_at, published, approval_status')
      .eq('published', true)
      .eq('approval_status', 'approved')
      .gte('approved_at', since)
      .order('approved_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to load jobs for daily matching cron: ${error.message}`);
    }

    const selectedJobs = (jobs || []) as Array<{ id: string }>;
    const summaries = [];
    let failures = 0;

    for (const job of selectedJobs) {
      try {
        const summary = await dispatchJobMatchNotifications({
          jobId: job.id,
          trigger: 'cron_daily_backfill',
        });
        summaries.push(summary);
      } catch (dispatchError) {
        failures += 1;
        summaries.push({
          jobId: job.id,
          error: sanitizeError(dispatchError),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      lookbackHours,
      selectedJobs: selectedJobs.length,
      failures,
      summaries,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
