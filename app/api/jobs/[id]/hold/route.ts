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
        { error: 'Only the posting admin, assigned recruiter, or a super admin can put jobs on hold.' },
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
  _request: Request,
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
    (access.job.lifecycle_status !== 'live' &&
      access.job.lifecycle_status !== 'closed_reviewing')
  ) {
    return NextResponse.json(
      { error: 'Only approved live or closed jobs can be placed on hold.' },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: job, error } = await access.serviceClient
    .from('jobs')
    .update({
      published: false,
      approval_status: 'approved',
      closed_at: nowIso,
      closed_reason: 'manual_hold',
      updated_at: nowIso,
    })
    .eq('id', jobId)
    .select('*')
    .single();

  if (error || !job) {
    console.error('Job hold error:', error);
    return NextResponse.json({ error: 'Failed to put job on hold.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    job,
  });
}
