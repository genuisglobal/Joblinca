import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/hiring-pipeline/server';
import { bookApplicationInterviewSlot } from '@/lib/interview-scheduling/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    const result = await bookApplicationInterviewSlot({
      slotId: params.id,
      candidateUserId: user.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to book interview slot';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Interview slot not found'
            ? 404
            : message === 'Interview slot is no longer available' ||
                message === 'scheduledAt must be a valid ISO datetime' ||
                message === 'Interview time must be in the future'
              ? 400
              : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
