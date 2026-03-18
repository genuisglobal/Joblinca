import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireActiveSubscription } from '@/lib/subscriptions';
import {
  summarizeInterviewPrepSessionRow,
  withInterviewPrepSessionSummaryReadiness,
} from '@/lib/interview-prep/sessions';
import {
  buildInterviewPrepReadinessBySession,
  isInterviewPrepAttemptsTableMissing,
  normalizeInterviewPrepAttemptRow,
} from '@/lib/interview-prep/readiness';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    await requireActiveSubscription(user.id, 'job_seeker');
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'An active job seeker subscription is required',
      },
      { status: 402 }
    );
  }

  const { data: sessions, error } = await supabase
    .from('interview_prep_sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to fetch interview prep sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch interview prep sessions' },
      { status: 500 }
    );
  }

  const sessionRows = sessions || [];
  if (!sessionRows.length) {
    return NextResponse.json([]);
  }

  const sessionIds = sessionRows.map((session) => session.id);
  const { data: attempts, error: attemptsError } = await supabase
    .from('interview_prep_attempts')
    .select('*')
    .eq('user_id', user.id)
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false });

  if (attemptsError && !isInterviewPrepAttemptsTableMissing(attemptsError)) {
    console.error('Failed to fetch interview prep attempts:', attemptsError);
    return NextResponse.json(
      { error: 'Failed to fetch interview prep sessions' },
      { status: 500 }
    );
  }

  const normalizedAttempts = (attempts || [])
    .map(normalizeInterviewPrepAttemptRow)
    .filter(Boolean) as NonNullable<ReturnType<typeof normalizeInterviewPrepAttemptRow>>[];
  const readinessBySession = buildInterviewPrepReadinessBySession(normalizedAttempts);

  return NextResponse.json(
    sessionRows.map((session) => {
      const summary = summarizeInterviewPrepSessionRow(session);
      const readiness = readinessBySession.get(session.id) || null;
      return withInterviewPrepSessionSummaryReadiness(summary, readiness);
    })
  );
}
