import { NextResponse } from 'next/server';
import {
  requireApplicantOwnedApplication,
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';
import { buildInterviewCalendarEvent } from '@/lib/interview-scheduling/calendar';
import { loadInterviewCalendarContext } from '@/lib/interview-scheduling/server';
import { getInterviewModeLabel } from '@/lib/interview-scheduling/utils';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { interview, applicationContext } = await loadInterviewCalendarContext(params.id);

    let authorized = false;
    try {
      await requireRecruiterOwnedApplication(interview.applicationId, user.id);
      authorized = true;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Not authorized') {
        throw error;
      }
    }

    if (!authorized) {
      await requireApplicantOwnedApplication(interview.applicationId, user.id);
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/$/, '');
    const calendarEvent = buildInterviewCalendarEvent({
      interviewId: interview.id,
      scheduledAt: interview.scheduledAt,
      jobTitle: applicationContext.job.title,
      companyName: applicationContext.job.companyName,
      modeLabel: getInterviewModeLabel(interview.mode),
      location: interview.location,
      meetingUrl: interview.meetingUrl,
      notes: interview.notes,
      manageUrl: `${appUrl}/dashboard`,
    });

    return new NextResponse(calendarEvent.icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${calendarEvent.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to export interview calendar event';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Interview not found' || message === 'Application not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
