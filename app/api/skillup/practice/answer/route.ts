import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { questionsFromChallengeConfig, recordPracticeAttempt } from '@/lib/skillup/practice';
import type { Locale } from '@/lib/i18n/locale';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const challengeId = typeof payload.challenge_id === 'string' ? payload.challenge_id.trim() : '';
  const questionId = typeof payload.question_id === 'string' ? payload.question_id.trim() : '';
  const answerIndexRaw = Number(payload.answer_index);
  if (!challengeId || !questionId || !Number.isFinite(answerIndexRaw)) {
    return NextResponse.json(
      { error: 'challenge_id, question_id, and answer_index are required' },
      { status: 422 }
    );
  }
  const answerIndex = Math.floor(answerIndexRaw);

  const db = createServiceSupabaseClient();
  const { data: challenge } = await db
    .from('talent_challenges')
    .select('id, domain, config, status')
    .eq('id', challengeId)
    .maybeSingle();
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('preferred_locale')
    .eq('id', user.id)
    .maybeSingle();
  const locale: Locale = profile?.preferred_locale === 'fr' ? 'fr' : 'en';

  const questions = questionsFromChallengeConfig(challenge.config, locale);
  const question = questions.find((q) => q.id === questionId);
  if (!question) {
    return NextResponse.json({ error: 'Question not found in challenge' }, { status: 404 });
  }

  const recorded = await recordPracticeAttempt({
    userId: user.id,
    challengeId: challenge.id,
    questionId: question.id,
    domain: challenge.domain,
    answerIndex,
    correctIndex: question.correct_index,
    source: 'practice',
  });

  return NextResponse.json({
    ok: true,
    was_correct: recorded.wasCorrect,
    correct_index: question.correct_index,
    explanation: question.explanation,
    interval_days: recorded.intervalDays,
    next_due_at: recorded.nextDueAt,
    consecutive_correct: recorded.consecutiveCorrect,
  });
}
