import { NextResponse, type NextRequest } from 'next/server';
import {
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';
import { moveApplicationToStage } from '@/lib/hiring-pipeline/transitions';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedApplication(params.id, user.id);
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
      candidateNotification: transition.candidateNotification,
    });
  } catch (transitionError) {
    const message =
      transitionError instanceof Error
        ? transitionError.message
        : 'Failed to move application stage';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
