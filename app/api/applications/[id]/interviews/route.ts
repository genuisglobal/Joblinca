import { NextResponse, type NextRequest } from 'next/server';
import {
  loadApplicationInterviews,
  scheduleApplicationInterview,
  updateApplicationInterview,
} from '@/lib/interview-scheduling/server';
import { normalizeInterviewMode } from '@/lib/interview-scheduling/utils';
import {
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedApplication(params.id, user.id);
    const interviews = await loadApplicationInterviews(params.id);

    return NextResponse.json({ interviews });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load interviews';
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

    const interview = await scheduleApplicationInterview({
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
      sendNotifications: body.sendNotifications !== false,
      moveToInterviewStage: body.moveToInterviewStage !== false,
    });

    return NextResponse.json(interview, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to schedule interview';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : message === 'scheduledAt must be a valid ISO datetime' ||
                message === 'Interview time must be in the future' ||
                message === 'Only active applications can be scheduled for interviews'
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

    const interviewId =
      typeof body.interviewId === 'string' && body.interviewId.trim()
        ? body.interviewId.trim()
        : null;
    const action =
      typeof body.action === 'string' && body.action.trim() ? body.action.trim() : null;

    if (!interviewId) {
      return NextResponse.json({ error: 'interviewId is required' }, { status: 400 });
    }

    if (!['reschedule', 'cancel', 'complete', 'no_show'].includes(action || '')) {
      return NextResponse.json(
        { error: 'action must be one of: reschedule, cancel, complete, no_show' },
        { status: 400 }
      );
    }

    const result = await updateApplicationInterview({
      interviewId,
      applicationId: params.id,
      actorId: user.id,
      action: action as 'reschedule' | 'cancel' | 'complete' | 'no_show',
      scheduledAt:
        typeof body.scheduledAt === 'string' && body.scheduledAt.trim()
          ? body.scheduledAt.trim()
          : null,
      timezone:
        typeof body.timezone === 'string' && body.timezone.trim()
          ? body.timezone.trim()
          : null,
      mode: Object.prototype.hasOwnProperty.call(body, 'mode')
        ? normalizeInterviewMode(body.mode)
        : undefined,
      location: Object.prototype.hasOwnProperty.call(body, 'location')
        ? body.location
        : undefined,
      meetingUrl: Object.prototype.hasOwnProperty.call(body, 'meetingUrl')
        ? body.meetingUrl
        : undefined,
      notes: Object.prototype.hasOwnProperty.call(body, 'notes')
        ? body.notes
        : undefined,
      sendNotifications: body.sendNotifications !== false,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update interview';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found' ||
              message === 'Interview not found'
            ? 404
            : message === 'Interview does not belong to this application' ||
                message === 'scheduledAt must be a valid ISO datetime' ||
                message === 'Interview time must be in the future' ||
                message === 'Only active applications can be rescheduled for interviews' ||
                message.startsWith('Only scheduled interviews can be updated with action')
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
