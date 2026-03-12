import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';
import { canJobBeReopened, isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';

const MAX_STANDARD_REOPENS = 1;

async function getAuthorizedJobManager(jobId: string) {
  const supabase = createServerSupabaseClient();
  const serviceClient = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const [{ data: profile }, { data: job }] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('id, admin_type')
      .eq('id', user.id)
      .maybeSingle(),
    serviceClient
      .from('jobs')
      .select(
        `
        id,
        posted_by,
        recruiter_id,
        approval_status,
        published,
        lifecycle_status,
        closes_at,
        target_hire_date,
        reopen_count,
        removed_at,
        archived_at,
        filled_at
      `
      )
      .eq('id', jobId)
      .maybeSingle(),
  ]);

  if (!job) {
    return {
      error: NextResponse.json({ error: 'Job not found' }, { status: 404 }),
    };
  }

  const isActiveAdmin = Boolean(
    profile?.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );
  const isSuperAdmin = profile?.admin_type === 'super';
  const isPoster = job.posted_by === user.id;
  const isAssignedRecruiter = job.recruiter_id === user.id;

  if (!isPoster && !isAssignedRecruiter && !isSuperAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Only the posting admin, assigned recruiter, or a super admin can reopen jobs.' },
        { status: 403 }
      ),
    };
  }

  return {
    serviceClient,
    userId: user.id,
    isActiveAdmin,
    job,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const access = await getAuthorizedJobManager(jobId);

  if ('error' in access) {
    return access.error;
  }

  const body = await request.json().catch(() => ({}));
  const closesAt =
    typeof body?.closesAt === 'string' && body.closesAt.trim().length > 0
      ? body.closesAt.trim()
      : '';
  const targetHireDate =
    typeof body?.targetHireDate === 'string' && body.targetHireDate.trim().length > 0
      ? body.targetHireDate.trim()
      : null;

  if (!closesAt) {
    return NextResponse.json(
      { error: 'A new future application deadline is required to reopen a job.' },
      { status: 400 }
    );
  }

  const parsedDeadline = new Date(closesAt);
  if (Number.isNaN(parsedDeadline.getTime()) || parsedDeadline.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Application deadline must be a valid future date.' },
      { status: 400 }
    );
  }

  let normalizedTargetHireDate: string | null = access.job.target_hire_date || null;
  if (targetHireDate) {
    const parsedTargetHireDate = new Date(targetHireDate);
    if (Number.isNaN(parsedTargetHireDate.getTime())) {
      return NextResponse.json(
        { error: 'Target hire date must be a valid date.' },
        { status: 400 }
      );
    }

    normalizedTargetHireDate = targetHireDate;
  }

  if (!canJobBeReopened(access.job)) {
    return NextResponse.json(
      { error: 'This job cannot be reopened in its current state.' },
      { status: 409 }
    );
  }

  if (!access.isActiveAdmin && (access.job.reopen_count || 0) >= MAX_STANDARD_REOPENS) {
    return NextResponse.json(
      {
        error:
          'This job has already been reopened once. Repost it as a new listing to refresh it again.',
      },
      { status: 409 }
    );
  }

  const { data: reopenedJob, error } = await access.serviceClient
    .from('jobs')
    .update({
      published: true,
      approval_status: 'approved',
      closes_at: parsedDeadline.toISOString(),
      target_hire_date: normalizedTargetHireDate,
      archived_at: null,
      filled_at: null,
      retention_expires_at: null,
      removed_at: null,
      removed_by: null,
      removal_reason: null,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !reopenedJob) {
    console.error('Job reopen error:', error);
    return NextResponse.json({ error: 'Failed to reopen job.' }, { status: 500 });
  }

  if (isJobPubliclyListable(reopenedJob)) {
    try {
      await dispatchJobMatchNotifications({
        jobId,
        trigger: 'job_reopened',
      });
    } catch (matchError) {
      console.error('Job matching dispatch failed after reopen', matchError);
    }
  }

  return NextResponse.json({
    success: true,
    job: reopenedJob,
  });
}
