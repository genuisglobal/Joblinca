import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  computeProjectAutoScore,
  hasRequiredProjectDeliverables,
  normalizeProjectSubmission,
  roundScore,
} from '@/lib/skillup/challenges';
import {
  extractExtendedQuestions,
  gradeMixedQuiz,
  questionsOverTime,
  sanitizeMixedAnswers,
  type AnswerValue,
} from '@/lib/skillup/grader';
import { getUserSubscription } from '@/lib/subscriptions';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin-types';
import type { Locale } from '@/lib/i18n/locale';

const TIME_LIMIT_GRACE_SECONDS = 30;

interface RawConfigQuestion {
  id?: unknown;
  correct_index?: unknown;
}

function extractQuestionIds(config: unknown): string[] {
  if (typeof config !== 'object' || config === null) return [];
  const record = config as Record<string, unknown>;
  let raw: unknown = record.questions;
  if (!Array.isArray(raw) && Array.isArray(record.quiz_questions)) {
    raw = record.quiz_questions;
  }
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (item && typeof item === 'object' && typeof (item as RawConfigQuestion).id === 'string') {
      const id = ((item as RawConfigQuestion).id as string).trim();
      if (id) return id;
    }
    return `q${index + 1}`;
  });
}

interface RefRow {
  id: string;
  question_id: string;
  target_course_id: string | null;
  target_module_id: string | null;
  external_provider: string | null;
  external_url: string | null;
  external_url_fr: string | null;
  rationale: string | null;
  display_order: number;
}

interface RefCourseRow {
  id: string;
  title: string;
  title_fr: string | null;
  external_provider: string | null;
  external_url: string | null;
  external_url_fr: string | null;
  is_free: boolean | null;
  partner_name: string | null;
}

function chooseLocalizedUrl(
  external_url: string | null,
  external_url_fr: string | null,
  locale: Locale
): string | null {
  if (locale === 'fr' && external_url_fr && external_url_fr.trim()) {
    return external_url_fr;
  }
  return external_url && external_url.trim() ? external_url : null;
}

async function fetchChallengeByIdOrSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  value: string
) {
  const columns =
    'id, slug, title, challenge_type, status, starts_at, ends_at, max_ranked_attempts, config, access_tier';

  const byId = await supabase
    .from('talent_challenges')
    .select(columns)
    .eq('id', value)
    .maybeSingle();

  if (byId.error) return { data: null, error: byId.error };
  if (byId.data) return { data: byId.data, error: null };

  const bySlug = await supabase
    .from('talent_challenges')
    .select(columns)
    .eq('slug', value)
    .maybeSingle();

  return { data: bySlug.data, error: bySlug.error };
}

function extractTimeLimitSeconds(config: unknown): number | null {
  if (typeof config !== 'object' || config === null) return null;
  const raw = (config as Record<string, unknown>).time_limit_seconds;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function coerceLegacyAnswers(value: unknown): Array<AnswerValue | undefined> | null {
  if (!Array.isArray(value)) return null;
  // Detect legacy scalar shape: array of numbers.
  if (value.length > 0 && value.every((v) => typeof v === 'number' || v === null)) {
    return value.map((entry): AnswerValue | undefined => {
      const num = typeof entry === 'number' && Number.isFinite(entry) ? Math.floor(entry) : null;
      return { type: 'mcq_single', selected_index: num !== null && num >= 0 ? num : null };
    });
  }
  return null;
}

function sanitizeDurations(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const n = Number(entry);
    return Number.isFinite(n) && n >= 0 ? n : null;
  });
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

  if (challenge.access_tier === 'paid') {
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('admin_type')
      .eq('id', user.id)
      .maybeSingle();

    const isAdminBypass = Boolean(
      callerProfile?.admin_type &&
        ACTIVE_ADMIN_TYPES.includes(callerProfile.admin_type)
    );

    if (!isAdminBypass) {
      const subscription = await getUserSubscription(user.id);
      if (!subscription.isActive) {
        return NextResponse.json(
          {
            error: 'This challenge requires an active subscription.',
            access_tier: 'paid',
          },
          { status: 402 }
        );
      }
    }
  }

  const { data: previousSubmissions, error: previousError } = await supabase
    .from('talent_challenge_submissions')
    .select('attempt_no, status')
    .eq('challenge_id', challenge.id)
    .eq('user_id', user.id)
    .order('attempt_no', { ascending: false });

  if (previousError) {
    return NextResponse.json({ error: previousError.message }, { status: 500 });
  }

  // Disqualified attempts still count toward the cap — prevents intentional
  // disqualification followed by a re-attempt.
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
    const { data: callerProfileForLocale } = await supabase
      .from('profiles')
      .select('preferred_locale')
      .eq('id', user.id)
      .maybeSingle();
    const submitLocale: Locale = callerProfileForLocale?.preferred_locale === 'fr' ? 'fr' : 'en';

    const questions = extractExtendedQuestions(challenge.config || {}, submitLocale);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'Quiz challenge is missing questions in config' },
        { status: 422 }
      );
    }

    const rawAnswers = (body as Record<string, unknown>).answers;
    let answers: Array<AnswerValue | undefined>;
    const legacyShape = coerceLegacyAnswers(rawAnswers);
    if (legacyShape) {
      answers = legacyShape;
    } else {
      answers = sanitizeMixedAnswers(rawAnswers);
    }
    if (answers.length === 0) {
      return NextResponse.json(
        { error: 'answers array is required for quiz challenge' },
        { status: 422 }
      );
    }

    const durations = sanitizeDurations(
      (body as Record<string, unknown>).question_durations
    );

    const grading = gradeMixedQuiz(questions, answers);
    const completionSecondsRaw = Number(
      (body as Record<string, unknown>).completionSeconds
    );
    const completionSeconds = Number.isFinite(completionSecondsRaw)
      ? Math.max(0, Math.floor(completionSecondsRaw))
      : null;

    const timeLimit = extractTimeLimitSeconds(challenge.config);
    const overallExceeded =
      timeLimit !== null &&
      completionSeconds !== null &&
      completionSeconds > timeLimit + TIME_LIMIT_GRACE_SECONDS;
    const perQuestionOver = questionsOverTime(questions, durations);
    const timeLimitExceeded = overallExceeded || perQuestionOver.length > 0;
    const disqualificationReason = overallExceeded
      ? 'time_limit_exceeded'
      : perQuestionOver.length > 0
      ? 'per_question_time_exceeded'
      : null;

    const submissionStatus = timeLimitExceeded ? 'disqualified' : 'graded';
    const finalScore = timeLimitExceeded ? 0 : grading.score;

    const { data: submission, error: submissionError } = await supabase
      .from('talent_challenge_submissions')
      .insert({
        challenge_id: challenge.id,
        user_id: user.id,
        attempt_no: nextAttempt,
        answers,
        auto_score: grading.score,
        final_score: finalScore,
        completion_seconds: completionSeconds,
        status: submissionStatus,
        metadata: {
          grading_mode: 'auto',
          correct_answers: grading.correct,
          total_questions: grading.total,
          per_question: grading.per_question,
          time_limit_seconds: timeLimit,
          time_limit_exceeded: timeLimitExceeded,
          per_question_overruns: perQuestionOver,
          disqualification_reason: disqualificationReason,
        },
      })
      .select(
        'id, challenge_id, attempt_no, status, auto_score, manual_score, final_score, completion_seconds, created_at, metadata'
      )
      .single();

    if (submissionError) {
      return NextResponse.json({ error: submissionError.message }, { status: 500 });
    }

    // Build wrong-answer recommendations from approved study refs.
    const missedIds: string[] = grading.per_question
      .filter((row) => !row.is_correct)
      .map((row) => row.id);

    let recommendations: Array<{
      question_id: string;
      refs: Array<{
        id: string;
        external_provider: string | null;
        external_url: string | null;
        rationale: string | null;
        course: {
          id: string;
          title: string;
          is_free: boolean;
          partner_name: string | null;
          external_url: string | null;
        } | null;
      }>;
    }> = [];

    if (missedIds.length > 0) {
      const locale: Locale = submitLocale;

      const { data: refRows } = await supabase
        .from('talent_challenge_question_refs')
        .select(
          'id, question_id, target_course_id, target_module_id, external_provider, external_url, external_url_fr, rationale, display_order'
        )
        .eq('challenge_id', challenge.id)
        .eq('status', 'approved')
        .in('question_id', missedIds)
        .order('display_order', { ascending: true });

      const refs = (refRows || []) as RefRow[];

      const courseIds = Array.from(
        new Set(refs.map((r) => r.target_course_id).filter((id): id is string => !!id))
      );
      let courseById = new Map<string, RefCourseRow>();
      if (courseIds.length > 0) {
        const { data: courseRows } = await supabase
          .from('learning_courses')
          .select(
            'id, title, title_fr, external_provider, external_url, external_url_fr, is_free, partner_name'
          )
          .in('id', courseIds);
        for (const row of (courseRows || []) as RefCourseRow[]) {
          courseById.set(row.id, row);
        }
      }

      const grouped = new Map<string, typeof recommendations[number]['refs']>();
      for (const ref of refs) {
        const list = grouped.get(ref.question_id) || [];
        const course = ref.target_course_id ? courseById.get(ref.target_course_id) : null;
        list.push({
          id: ref.id,
          external_provider: ref.external_provider,
          external_url: chooseLocalizedUrl(ref.external_url, ref.external_url_fr, locale),
          rationale: ref.rationale,
          course: course
            ? {
                id: course.id,
                title: locale === 'fr' && course.title_fr ? course.title_fr : course.title,
                is_free: Boolean(course.is_free),
                partner_name: course.partner_name,
                external_url: chooseLocalizedUrl(
                  course.external_url,
                  course.external_url_fr,
                  locale
                ),
              }
            : null,
        });
        grouped.set(ref.question_id, list);
      }

      // Surface free options first within each question's ref list.
      for (const [qid, list] of grouped.entries()) {
        list.sort((a, b) => {
          const aFree = a.course?.is_free ? 0 : 1;
          const bFree = b.course?.is_free ? 0 : 1;
          return aFree - bFree;
        });
        grouped.set(qid, list);
      }

      recommendations = missedIds
        .filter((id) => grouped.has(id))
        .map((id) => ({ question_id: id, refs: grouped.get(id) || [] }));
    }

    return NextResponse.json({
      ok: true,
      challenge_id: challenge.id,
      submission,
      score: finalScore,
      raw_score: grading.score,
      correct: grading.correct,
      total: grading.total,
      per_question: grading.per_question,
      disqualified: timeLimitExceeded,
      disqualification_reason: disqualificationReason,
      time_limit_seconds: timeLimit,
      per_question_overruns: perQuestionOver,
      attempts_used: nextAttempt,
      attempts_left: Math.max(0, challenge.max_ranked_attempts - nextAttempt),
      recommendations,
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
