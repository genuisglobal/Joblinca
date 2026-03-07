import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  computeProjectAutoScore,
  extractChallengeQuizQuestions,
  gradeChallengeQuiz,
  hasRequiredProjectDeliverables,
  normalizeProjectSubmission,
  roundScore,
} from '@/lib/skillup/challenges';

async function fetchChallengeByIdOrSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  value: string
) {
  const byId = await supabase
    .from('talent_challenges')
    .select(
      'id, slug, title, challenge_type, status, starts_at, ends_at, max_ranked_attempts, config'
    )
    .eq('id', value)
    .maybeSingle();

  if (byId.error) return { data: null, error: byId.error };
  if (byId.data) return { data: byId.data, error: null };

  const bySlug = await supabase
    .from('talent_challenges')
    .select(
      'id, slug, title, challenge_type, status, starts_at, ends_at, max_ranked_attempts, config'
    )
    .eq('slug', value)
    .maybeSingle();

  return { data: bySlug.data, error: bySlug.error };
}

function sanitizeAnswers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry))
    .map((entry) => Math.floor(entry));
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const identifier = (params.id || '').trim();
  if (!identifier) {
    return NextResponse.json({ error: 'Challenge ID is required' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { data: challenge, error: challengeError } = await fetchChallengeByIdOrSlug(
    supabase,
    identifier
  );
  if (challengeError) {
    return NextResponse.json({ error: challengeError.message }, { status: 500 });
  }
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  if (!['active', 'published'].includes(challenge.status)) {
    return NextResponse.json(
      { error: 'Challenge is not accepting submissions right now' },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  if (challenge.starts_at && nowIso < challenge.starts_at) {
    return NextResponse.json(
      { error: 'Challenge has not started yet' },
      { status: 409 }
    );
  }
  if (challenge.ends_at && nowIso > challenge.ends_at) {
    return NextResponse.json({ error: 'Challenge is already closed' }, { status: 409 });
  }

  const { data: previousSubmissions, error: previousError } = await supabase
    .from('talent_challenge_submissions')
    .select('attempt_no')
    .eq('challenge_id', challenge.id)
    .eq('user_id', user.id)
    .order('attempt_no', { ascending: false });

  if (previousError) {
    return NextResponse.json({ error: previousError.message }, { status: 500 });
  }

  const attemptsUsed = (previousSubmissions || []).length;
  const nextAttempt = attemptsUsed + 1;
  if (nextAttempt > challenge.max_ranked_attempts) {
    return NextResponse.json(
      {
        error: `Maximum attempts reached (${challenge.max_ranked_attempts})`,
      },
      { status: 429 }
    );
  }

  if (challenge.challenge_type === 'quiz') {
    const questions = extractChallengeQuizQuestions(challenge.config || {});
    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'Quiz challenge is missing questions in config' },
        { status: 422 }
      );
    }

    const answers = sanitizeAnswers((body as Record<string, unknown>).answers);
    if (answers.length === 0) {
      return NextResponse.json(
        { error: 'answers array is required for quiz challenge' },
        { status: 422 }
      );
    }

    const grading = gradeChallengeQuiz(questions, answers);
    const completionSecondsRaw = Number(
      (body as Record<string, unknown>).completionSeconds
    );
    const completionSeconds = Number.isFinite(completionSecondsRaw)
      ? Math.max(0, Math.floor(completionSecondsRaw))
      : null;

    const { data: submission, error: submissionError } = await supabase
      .from('talent_challenge_submissions')
      .insert({
        challenge_id: challenge.id,
        user_id: user.id,
        attempt_no: nextAttempt,
        answers,
        auto_score: grading.score,
        final_score: grading.score,
        completion_seconds: completionSeconds,
        status: 'graded',
        metadata: {
          grading_mode: 'auto',
          correct_answers: grading.correct,
          total_questions: grading.total,
        },
      })
      .select(
        'id, challenge_id, attempt_no, status, auto_score, manual_score, final_score, completion_seconds, created_at, metadata'
      )
      .single();

    if (submissionError) {
      return NextResponse.json({ error: submissionError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      challenge_id: challenge.id,
      submission,
      score: grading.score,
      correct: grading.correct,
      total: grading.total,
      attempts_used: nextAttempt,
      attempts_left: Math.max(0, challenge.max_ranked_attempts - nextAttempt),
    });
  }

  const normalized = normalizeProjectSubmission(
    (body as Record<string, unknown>).project_submission
  );
  if (!hasRequiredProjectDeliverables(normalized)) {
    return NextResponse.json(
      {
        error:
          'Project submission requires all deliverables: summary_text, github_url, file_url',
      },
      { status: 422 }
    );
  }

  const autoScore = computeProjectAutoScore(normalized);
  const { data: submission, error: projectError } = await supabase
    .from('talent_challenge_submissions')
    .insert({
      challenge_id: challenge.id,
      user_id: user.id,
      attempt_no: nextAttempt,
      project_submission: {
        summary_text: normalized.summary_text,
        github_url: normalized.github_url,
        file_url: normalized.file_url,
        ...normalized.extra,
      },
      auto_score: autoScore,
      final_score: roundScore(autoScore),
      status: 'submitted',
      metadata: {
        grading_mode: 'manual_ai_blend_pending',
      },
    })
    .select(
      'id, challenge_id, attempt_no, status, auto_score, manual_score, final_score, completion_seconds, created_at, metadata'
    )
    .single();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    challenge_id: challenge.id,
    submission,
    auto_score: autoScore,
    message:
      'Project received. Final score will be updated after manual + AI blended grading.',
    attempts_used: nextAttempt,
    attempts_left: Math.max(0, challenge.max_ranked_attempts - nextAttempt),
  });
}
