import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/hiring-pipeline/server';
import { respondToInterviewInvitation } from '@/lib/interview-scheduling/server';
import { normalizeInterviewResponseStatus } from '@/lib/interview-scheduling/utils';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await request.json();
    const responseStatus = normalizeInterviewResponseStatus(body.responseStatus);

    if (!['confirmed', 'declined'].includes(responseStatus)) {
      return NextResponse.json(
        { error: 'responseStatus must be one of: confirmed, declined' },
        { status: 400 }
      );
    }

    const interview = await respondToInterviewInvitation({
      interviewId: params.id,
      candidateUserId: user.id,
      responseStatus,
      note: typeof body.note === 'string' ? body.note : null,
    });

    return NextResponse.json({ interview });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to record interview response';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Interview not found'
            ? 404
            : message === 'Only scheduled interviews can be acknowledged'
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
