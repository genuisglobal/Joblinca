import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { shouldArchiveClosedJob, shouldArchiveFilledJob } from '@/lib/jobs/lifecycle';

export const runtime = 'nodejs';
export const maxDuration = 60;

const cronDb = createServiceSupabaseClient();

interface ExpiredLiveJobRow {
  id: string;
}

interface FilledJobRow {
  id: string;
  filled_at: string | null;
  retention_expires_at: string | null;
  archived_at: string | null;
}

interface ClosedReviewingJobRow {
  id: string;
  lifecycle_status: string | null;
  closed_at: string | null;
  archived_at: string | null;
  filled_at: string | null;
  target_hire_date: string | null;
  retention_expires_at: string | null;
}

function parseBoundedInteger(
  rawValue: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(rawValue || '');
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

async function selectExpiredLiveJobs(
  nowIso: string,
  batchSize: number
): Promise<ExpiredLiveJobRow[]> {
  const { data, error } = await cronDb
    .from('jobs')
    .select('id')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('lifecycle_status', 'live')
    .not('closes_at', 'is', null)
    .lte('closes_at', nowIso)
    .order('closes_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(`Failed to load expired live jobs: ${error.message}`);
  }

  return (data || []) as ExpiredLiveJobRow[];
}

async function closeExpiredJobs(jobIds: string[], nowIso: string): Promise<number> {
  if (jobIds.length === 0) {
    return 0;
  }

  const { data, error } = await cronDb
    .from('jobs')
    .update({
      closed_reason: 'deadline_elapsed',
      updated_at: nowIso,
    })
    .in('id', jobIds)
    .select('id');

  if (error) {
    throw new Error(`Failed to close expired jobs: ${error.message}`);
  }

  return (data || []).length;
}

async function selectFilledJobsForArchival(batchSize: number): Promise<FilledJobRow[]> {
  const { data, error } = await cronDb
    .from('jobs')
    .select('id, filled_at, retention_expires_at, archived_at')
    .eq('lifecycle_status', 'filled')
    .is('archived_at', null)
    .not('retention_expires_at', 'is', null)
    .order('retention_expires_at', { ascending: true })
    .limit(batchSize);

  if (error) {
    throw new Error(`Failed to load filled jobs for archival: ${error.message}`);
  }

  return (data || []) as FilledJobRow[];
}

async function selectClosedJobsForArchival(
  batchSize: number
): Promise<ClosedReviewingJobRow[]> {
  const scanLimit = Math.max(batchSize, batchSize * 3);
  const { data, error } = await cronDb
    .from('jobs')
    .select(
      'id, lifecycle_status, closed_at, archived_at, filled_at, target_hire_date, retention_expires_at'
    )
    .eq('lifecycle_status', 'closed_reviewing')
    .is('archived_at', null)
    .is('filled_at', null)
    .not('closed_at', 'is', null)
    .order('closed_at', { ascending: true })
    .limit(scanLimit);

  if (error) {
    throw new Error(`Failed to load closed jobs for archival: ${error.message}`);
  }

  return (data || []) as ClosedReviewingJobRow[];
}

async function archiveJobs(jobIds: string[], nowIso: string): Promise<number> {
  if (jobIds.length === 0) {
    return 0;
  }

  const { data, error } = await cronDb
    .from('jobs')
    .update({
      archived_at: nowIso,
      updated_at: nowIso,
    })
    .in('id', jobIds)
    .select('id');

  if (error) {
    throw new Error(`Failed to archive jobs: ${error.message}`);
  }

  return (data || []).length;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun =
    searchParams.get('dryRun') === '1' ||
    searchParams.get('dryRun')?.toLowerCase() === 'true';
  const batchSize = parseBoundedInteger(
    searchParams.get('batchSize') || process.env.JOB_CLEANUP_BATCH_SIZE || null,
    250,
    1,
    1000
  );
  const reviewWindowDays = parseBoundedInteger(
    searchParams.get('reviewWindowDays') ||
      process.env.JOB_CLOSED_REVIEW_WINDOW_DAYS ||
      null,
    45,
    1,
    365
  );
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const [expiredLiveJobs, filledJobs, closedJobs] = await Promise.all([
      selectExpiredLiveJobs(nowIso, batchSize),
      selectFilledJobsForArchival(batchSize),
      selectClosedJobsForArchival(batchSize),
    ]);

    const filledArchiveIds = filledJobs
      .filter((job) => shouldArchiveFilledJob(job, now))
      .map((job) => job.id);
    const closedArchiveIds = closedJobs
      .filter((job) => shouldArchiveClosedJob(job, now, reviewWindowDays))
      .slice(0, batchSize)
      .map((job) => job.id);

    const expiredLiveIds = expiredLiveJobs.map((job) => job.id);

    const expiredUpdated = dryRun ? 0 : await closeExpiredJobs(expiredLiveIds, nowIso);
    const filledArchived = dryRun ? 0 : await archiveJobs(filledArchiveIds, nowIso);
    const closedArchived = dryRun ? 0 : await archiveJobs(closedArchiveIds, nowIso);

    return NextResponse.json({
      ok: true,
      dryRun,
      batchSize,
      reviewWindowDays,
      expiredLive: {
        selected: expiredLiveIds.length,
        updated: expiredUpdated,
        ids: expiredLiveIds,
      },
      filledArchival: {
        selected: filledArchiveIds.length,
        archived: filledArchived,
        ids: filledArchiveIds,
      },
      closedArchival: {
        scanned: closedJobs.length,
        selected: closedArchiveIds.length,
        archived: closedArchived,
        ids: closedArchiveIds,
      },
      timestamp: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job cleanup failed';
    return NextResponse.json(
      {
        ok: false,
        error: message,
        timestamp: nowIso,
      },
      { status: 500 }
    );
  }
}
