import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireActiveSubscription } from '@/lib/subscriptions';
import {
  normalizeInterviewPrepSessionRow,
  withInterviewPrepSessionReadiness,
} from '@/lib/interview-prep/sessions';
import {
  buildInterviewPrepReadinessSummary,
  isInterviewPrepAttemptsTableMissing,
  normalizeInterviewPrepAttemptRow,
} from '@/lib/interview-prep/readiness';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  const { data: session, error } = await supabase
    .from('interview_prep_sessions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from('interview_prep_attempts')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', params.id)
    .order('created_at', { ascending: false });

  if (attemptsError && !isInterviewPrepAttemptsTableMissing(attemptsError)) {
    console.error('Failed to fetch interview prep attempts:', attemptsError);
    return NextResponse.json(
      { error: 'Failed to fetch interview prep session' },
      { status: 500 }
    );
  }

  const normalizedAttempts = (attempts || [])
    .map(normalizeInterviewPrepAttemptRow)
    .filter(Boolean) as NonNullable<ReturnType<typeof normalizeInterviewPrepAttemptRow>>[];
  const readiness = buildInterviewPrepReadinessSummary(normalizedAttempts);

  return NextResponse.json(
    withInterviewPrepSessionReadiness(
      normalizeInterviewPrepSessionRow(session),
      readiness,
      normalizedAttempts.slice(0, 5)
    )
  );
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { error } = await supabase
    .from('interview_prep_sessions')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Failed to delete interview prep session:', error);
    return NextResponse.json(
      { error: 'Failed to delete interview prep session' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
