import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { dispatchUpcomingInterviewReminders } from '@/lib/interview-scheduling/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.length <= 200 ? message : `${message.slice(0, 197)}...`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawWindowHours = Number(
    searchParams.get('windowHours') || process.env.INTERVIEW_REMINDER_WINDOW_HOURS || '4'
  );
  const windowHours = Number.isFinite(rawWindowHours)
    ? Math.max(1, Math.min(48, Math.floor(rawWindowHours)))
    : 4;

  try {
    const summary = await dispatchUpcomingInterviewReminders({ windowHours });

    return NextResponse.json({
      ok: true,
      windowHours,
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
