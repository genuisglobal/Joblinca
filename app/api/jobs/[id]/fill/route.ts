import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

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
        lifecycle_status,
        target_hire_date,
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

  const isSuperAdmin = profile?.admin_type === 'super';
  const isPoster = job.posted_by === user.id;
  const isAssignedRecruiter = job.recruiter_id === user.id;

  if (!isPoster && !isAssignedRecruiter && !isSuperAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Only the posting admin, assigned recruiter, or a super admin can mark jobs as filled.' },
        { status: 403 }
      ),
    };
  }

  return {
    serviceClient,
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

  if (
    access.job.approval_status !== 'approved' ||
    access.job.removed_at ||
    access.job.archived_at ||
    access.job.filled_at ||
    !['live', 'closed_reviewing', 'on_hold'].includes(access.job.lifecycle_status || '')
  ) {
    return NextResponse.json(
      { error: 'Only approved active or review-stage jobs can be marked as filled.' },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const targetHireDateInput =
    typeof body?.targetHireDate === 'string' && body.targetHireDate.trim().length > 0
      ? body.targetHireDate.trim()
      : null;

  let normalizedTargetHireDate: string | null = access.job.target_hire_date || null;
  if (targetHireDateInput) {
    const parsed = new Date(targetHireDateInput);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: 'Target hire date must be a valid date.' },
        { status: 400 }
      );
    }

    normalizedTargetHireDate = targetHireDateInput;
  }

  const nowIso = new Date().toISOString();
  const { data: job, error } = await access.serviceClient
    .from('jobs')
    .update({
      target_hire_date: normalizedTargetHireDate,
      filled_at: nowIso,
      closed_at: nowIso,
      closed_reason: 'filled',
      retention_expires_at: null,
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !job) {
    console.error('Job fill error:', error);
    return NextResponse.json({ error: 'Failed to mark job as filled.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    job,
  });
}
