import { NextResponse, type NextRequest } from 'next/server';
import { generateApplicationInterviewSlotsFromRange } from '@/lib/interview-scheduling/server';
import {
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedApplication(params.id, user.id);
    const body = await request.json();

    const templateId =
      typeof body.templateId === 'string' && body.templateId.trim()
        ? body.templateId.trim()
        : null;
    const startDate =
      typeof body.startDate === 'string' && body.startDate.trim()
        ? body.startDate.trim()
        : null;
    const endDate =
      typeof body.endDate === 'string' && body.endDate.trim()
        ? body.endDate.trim()
        : null;

    if (!templateId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'templateId, startDate, and endDate are required' },
        { status: 400 }
      );
    }

    const result = await generateApplicationInterviewSlotsFromRange({
      applicationId: params.id,
      actorId: user.id,
      templateId,
      startDate,
      endDate,
      sendInvitation: body.sendInvitation !== false,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate interview slots';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : message === 'Only active applications can receive self-schedule slots' ||
                message === 'Self-schedule template not found' ||
                message === 'No self-schedule days are available in the selected range' ||
                message === 'templateId, startDate, and endDate are required' ||
                message.includes('Self-schedule generation') ||
                message.includes('startDate and endDate must use YYYY-MM-DD format') ||
                message.includes('endDate must be on or after startDate')
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
