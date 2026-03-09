import { NextResponse, type NextRequest } from 'next/server';
import {
  createApplicationInterviewSlot,
  loadApplicationInterviewSlots,
  cancelApplicationInterviewSlot,
} from '@/lib/interview-scheduling/server';
import { normalizeInterviewMode } from '@/lib/interview-scheduling/utils';
import {
  requireApplicantOwnedApplication,
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();

    let authorized = false;
    try {
      await requireRecruiterOwnedApplication(params.id, user.id);
      authorized = true;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Not authorized') {
        throw error;
      }
    }

    if (!authorized) {
      await requireApplicantOwnedApplication(params.id, user.id);
    }

    const slots = await loadApplicationInterviewSlots(params.id);
    return NextResponse.json({ slots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load interview slots';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedApplication(params.id, user.id);
    const body = await request.json();

    const scheduledAt =
      typeof body.scheduledAt === 'string' && body.scheduledAt.trim()
        ? body.scheduledAt.trim()
        : null;

    if (!scheduledAt) {
      return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 });
    }

    const result = await createApplicationInterviewSlot({
      applicationId: params.id,
      actorId: user.id,
      scheduledAt,
      timezone:
        typeof body.timezone === 'string' && body.timezone.trim()
          ? body.timezone.trim()
          : 'UTC',
      mode: normalizeInterviewMode(body.mode),
      location: typeof body.location === 'string' ? body.location : null,
      meetingUrl: typeof body.meetingUrl === 'string' ? body.meetingUrl : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      sendInvitation: body.sendInvitation !== false,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create interview slot';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : message === 'scheduledAt is required' ||
                message === 'scheduledAt must be a valid ISO datetime' ||
                message === 'Interview time must be in the future' ||
                message === 'Only active applications can receive self-schedule slots' ||
                message.includes('Self-schedule')
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedApplication(params.id, user.id);
    const body = await request.json();

    const slotId =
      typeof body.slotId === 'string' && body.slotId.trim() ? body.slotId.trim() : null;
    if (!slotId) {
      return NextResponse.json({ error: 'slotId is required' }, { status: 400 });
    }

    if (body.action !== 'cancel') {
      return NextResponse.json({ error: 'action must be cancel' }, { status: 400 });
    }

    const slot = await cancelApplicationInterviewSlot({
      slotId,
      applicationId: params.id,
      actorId: user.id,
    });

    return NextResponse.json({ slot });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update interview slot';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found' ||
              message === 'Interview slot not found'
            ? 404
            : message === 'Interview slot does not belong to this application' ||
                message === 'Only available interview slots can be cancelled'
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
