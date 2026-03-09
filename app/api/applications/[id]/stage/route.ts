import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { moveApplicationToStage } from '@/lib/hiring-pipeline/transitions';

function recruiterIdFromRelation(
  jobs: { recruiter_id: string | null } | { recruiter_id: string | null }[] | null | undefined
) {
  return Array.isArray(jobs) ? jobs[0]?.recruiter_id ?? null : jobs?.recruiter_id ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: application, error: fetchError } = await supabase
    .from('applications')
    .select(
      `
      id,
      job_id,
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

  if (recruiterIdFromRelation(application.jobs) !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  const stageId =
    typeof body.stageId === 'string' && body.stageId.trim()
      ? body.stageId.trim()
      : null;
  const stageKey =
    typeof body.stageKey === 'string' && body.stageKey.trim()
      ? body.stageKey.trim()
      : null;
  const note = typeof body.note === 'string' ? body.note.trim() : null;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : null;

  if (!stageId && !stageKey) {
    return NextResponse.json(
      { error: 'stageId or stageKey is required' },
      { status: 400 }
    );
  }

  try {
    const transition = await moveApplicationToStage({
      applicationId: params.id,
      actorId: user.id,
      toStageId: stageId || undefined,
      toStageKey: stageKey || undefined,
      note,
      reason,
      trigger: 'applications_stage_route',
    });

    return NextResponse.json({
      application: transition.application,
      fromStage: transition.fromStage,
      toStage: transition.toStage,
      legacyStatus: transition.legacyStatus,
      eventId: transition.eventId,
    });
  } catch (transitionError) {
    return NextResponse.json(
      {
        error:
          transitionError instanceof Error
            ? transitionError.message
            : 'Failed to move application stage',
      },
      { status: 500 }
    );
  }
}
