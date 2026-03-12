import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import {
  moveApplicationToLegacyStatus,
  type LegacyApplicationStatus,
} from '@/lib/hiring-pipeline/transitions';

function recruiterIdFromRelation(
  jobs: { recruiter_id: string | null } | { recruiter_id: string | null }[] | null | undefined
) {
  return Array.isArray(jobs) ? jobs[0]?.recruiter_id ?? null : jobs?.recruiter_id ?? null;
}

// GET: Get a single application
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { isAdmin } = await checkAdminStatus();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: application, error } = await supabase
    .from('applications')
    .select(
      `
      *,
      jobs:job_id (
        id,
        title,
        company_name,
        recruiter_id
      ),
      profiles:applicant_id (
        id,
        full_name,
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .eq('id', params.id)
    .single();

  if (error || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Check if user is the applicant or the job recruiter
  const isApplicant = application.applicant_id === user.id;
  const isRecruiter = recruiterIdFromRelation(application.jobs) === user.id;

  if (!isApplicant && !isRecruiter && !isAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  return NextResponse.json(application);
}

// PUT: Update application status (recruiters only)
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { isAdmin } = await checkAdminStatus();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Get the application to check authorization
  const { data: application, error: fetchError } = await supabase
    .from('applications')
    .select(
      `
      *,
      jobs:job_id (
        recruiter_id
      )
    `
    )
    .eq('id', params.id)
    .single();

  if (fetchError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Only the job's recruiter can update the status
  if (recruiterIdFromRelation(application.jobs) !== user.id && !isAdmin) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body;

  const validStatuses = ['submitted', 'shortlisted', 'interviewed', 'hired', 'rejected'];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
      { status: 400 }
    );
  }

  try {
    const transition = await moveApplicationToLegacyStatus({
      applicationId: params.id,
      actorId: user.id,
      status: status as LegacyApplicationStatus,
      reason: 'legacy_status_update',
      trigger: 'applications_put_route',
    });

    const reviewedAt =
      status !== 'submitted' && !application.reviewed_at
        ? new Date().toISOString()
        : application.reviewed_at || null;

    if (reviewedAt !== application.reviewed_at) {
      await supabase
        .from('applications')
        .update({
          reviewed_at: reviewedAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id);
    }

    return NextResponse.json({
      ...transition.application,
      reviewed_at: reviewedAt,
      legacy_status: transition.legacyStatus,
      current_stage_id: transition.toStage.id,
      current_stage_label: transition.toStage.label,
      current_stage_key: transition.toStage.stage_key,
      candidateNotification: transition.candidateNotification,
    });
  } catch (transitionError) {
    return NextResponse.json(
      {
        error:
          transitionError instanceof Error
            ? transitionError.message
            : 'Failed to update application stage',
      },
      { status: 500 }
    );
  }
}
