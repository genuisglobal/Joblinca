/**
 * Spaced-repetition helpers for talent_practice_attempts.
 *
 * Algorithm: simple doubling intervals. We deliberately avoid SM-2 / Anki
 * variants for the MVP — most talents won't accumulate enough history for
 * the curve to matter, and the simpler model is easier to reason about
 * across in-app practice + WhatsApp drill reply.
 *
 *   correct, current streak n   → next due in   INTERVALS[min(n, INTERVALS.length-1)]
 *   incorrect                   → reset streak to 0, next due in 1 day
 */
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const PRACTICE_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];

export type PracticeSource = 'practice' | 'daily_drill';

export interface PracticeQuestion {
  challenge_id: string;
  challenge_title: string;
  domain: string | null;
  question_id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

interface RawConfigQuestion {
  id?: unknown;
  question?: unknown;
  question_fr?: unknown;
  options?: unknown;
  options_fr?: unknown;
  correct_index?: unknown;
  explanation?: unknown;
  explanation_fr?: unknown;
}

function pickLocalizedString(en: unknown, fr: unknown, locale: 'en' | 'fr'): string | null {
  if (locale === 'fr' && typeof fr === 'string' && fr.trim().length > 0) {
    return fr;
  }
  if (typeof en === 'string' && en.trim().length > 0) {
    return en;
  }
  return null;
}

function pickLocalizedOptions(en: unknown, fr: unknown, locale: 'en' | 'fr'): string[] {
  const enArr = Array.isArray(en) ? en.filter((o): o is string => typeof o === 'string') : [];
  const frArr = Array.isArray(fr) ? fr.filter((o): o is string => typeof o === 'string') : [];
  if (locale === 'fr' && frArr.length > 0 && frArr.length === enArr.length) {
    return frArr;
  }
  return enArr;
}

export function questionsFromChallengeConfig(
  config: unknown,
  locale: 'en' | 'fr'
): Array<{
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}> {
  if (typeof config !== 'object' || config === null) return [];
  const record = config as Record<string, unknown>;
  let raw: unknown = record.questions;
  if (!Array.isArray(raw) && Array.isArray(record.quiz_questions)) {
    raw = record.quiz_questions;
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      if (typeof item !== 'object' || item === null) return null;
      const q = item as RawConfigQuestion;
      const prompt = pickLocalizedString(q.question, q.question_fr, locale);
      if (!prompt) return null;
      const options = pickLocalizedOptions(q.options, q.options_fr, locale);
      if (options.length < 2) return null;
      const correct = Number(q.correct_index);
      if (!Number.isFinite(correct) || correct < 0 || correct >= options.length) {
        return null;
      }
      const explanation = pickLocalizedString(q.explanation, q.explanation_fr, locale);
      const id =
        typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${index + 1}`;
      return {
        id,
        prompt,
        options,
        correct_index: Math.floor(correct),
        explanation,
      };
    })
    .filter(
      (
        q
      ): q is {
        id: string;
        prompt: string;
        options: string[];
        correct_index: number;
        explanation: string | null;
      } => q !== null
    );
}

export function nextIntervalDays(currentStreak: number, wasCorrect: boolean): number {
  if (!wasCorrect) {
    return PRACTICE_INTERVALS_DAYS[0];
  }
  const idx = Math.min(currentStreak, PRACTICE_INTERVALS_DAYS.length - 1);
  return PRACTICE_INTERVALS_DAYS[idx];
}

export function nextDueAtFrom(intervalDays: number, from: Date = new Date()): string {
  const next = new Date(from.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

/**
 * Pick the next practice question for the user. Priority:
 *   1. The user's overdue or due attempt (next_due_at <= now), oldest-first.
 *   2. A question the user has never attempted from active challenges in the
 *      requested domain.
 *   3. Null if neither path produces anything.
 *
 * Domain filter is optional. The caller passes the talent's preferred locale.
 */
export async function pickNextPracticeQuestion(opts: {
  userId: string;
  domain?: string | null;
  locale: 'en' | 'fr';
}): Promise<PracticeQuestion | null> {
  const db = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();

  // Step 1 — due/overdue attempts.
  let dueQuery = db
    .from('talent_practice_attempts')
    .select('challenge_id, question_id, domain, next_due_at')
    .eq('user_id', opts.userId)
    .lte('next_due_at', nowIso)
    .order('next_due_at', { ascending: true })
    .limit(20);
  if (opts.domain) {
    dueQuery = dueQuery.eq('domain', opts.domain);
  }
  const { data: dueAttempts } = await dueQuery;

  if (Array.isArray(dueAttempts) && dueAttempts.length > 0) {
    // Group by question to take the most recent attempt per (challenge, question).
    const seen = new Set<string>();
    const ordered: Array<{ challenge_id: string; question_id: string }> = [];
    for (const row of dueAttempts as Array<{
      challenge_id: string;
      question_id: string;
    }>) {
      const key = `${row.challenge_id}::${row.question_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push({ challenge_id: row.challenge_id, question_id: row.question_id });
    }

    for (const candidate of ordered) {
      const resolved = await resolvePracticeQuestion(
        candidate.challenge_id,
        candidate.question_id,
        opts.locale
      );
      if (resolved) return resolved;
    }
  }

  // Step 2 — never-attempted question from active challenges in domain.
  let challengeQuery = db
    .from('talent_challenges')
    .select('id, title, title_fr, domain, config')
    .in('status', ['active', 'published'])
    .order('starts_at', { ascending: false })
    .limit(20);
  if (opts.domain) {
    challengeQuery = challengeQuery.eq('domain', opts.domain);
  }
  const { data: challengeRows } = await challengeQuery;

  type ChallengeRow = {
    id: string;
    title: string;
    title_fr: string | null;
    domain: string | null;
    config: unknown;
  };

  const challenges = ((challengeRows || []) as ChallengeRow[]).filter(
    (row) => row.config
  );
  if (challenges.length === 0) return null;

  const { data: priorAttempts } = await db
    .from('talent_practice_attempts')
    .select('challenge_id, question_id')
    .eq('user_id', opts.userId)
    .in(
      'challenge_id',
      challenges.map((c) => c.id)
    );

  const attempted = new Set<string>(
    ((priorAttempts || []) as Array<{ challenge_id: string; question_id: string }>).map(
      (row) => `${row.challenge_id}::${row.question_id}`
    )
  );

  for (const challenge of challenges) {
    const questions = questionsFromChallengeConfig(challenge.config, opts.locale);
    for (const question of questions) {
      const key = `${challenge.id}::${question.id}`;
      if (attempted.has(key)) continue;
      return {
        challenge_id: challenge.id,
        challenge_title:
          opts.locale === 'fr' && challenge.title_fr ? challenge.title_fr : challenge.title,
        domain: challenge.domain,
        question_id: question.id,
        prompt: question.prompt,
        options: question.options,
        correct_index: question.correct_index,
        explanation: question.explanation,
      };
    }
  }

  return null;
}

async function resolvePracticeQuestion(
  challengeId: string,
  questionId: string,
  locale: 'en' | 'fr'
): Promise<PracticeQuestion | null> {
  const db = createServiceSupabaseClient();
  const { data: challenge } = await db
    .from('talent_challenges')
    .select('id, title, title_fr, domain, config')
    .eq('id', challengeId)
    .maybeSingle();
  if (!challenge) return null;
  const questions = questionsFromChallengeConfig(challenge.config, locale);
  const question = questions.find((q) => q.id === questionId);
  if (!question) return null;
  return {
    challenge_id: challenge.id,
    challenge_title:
      locale === 'fr' && challenge.title_fr ? challenge.title_fr : challenge.title,
    domain: challenge.domain,
    question_id: question.id,
    prompt: question.prompt,
    options: question.options,
    correct_index: question.correct_index,
    explanation: question.explanation,
  };
}

/**
 * Records a practice attempt. Computes interval/next_due_at from the
 * user's current streak on this question.
 */
export async function recordPracticeAttempt(opts: {
  userId: string;
  challengeId: string;
  questionId: string;
  domain: string | null;
  answerIndex: number;
  correctIndex: number;
  source: PracticeSource;
}): Promise<{
  attemptId: string;
  wasCorrect: boolean;
  intervalDays: number;
  nextDueAt: string;
  consecutiveCorrect: number;
}> {
  const db = createServiceSupabaseClient();
  const wasCorrect = opts.answerIndex === opts.correctIndex;

  const { data: prior } = await db
    .from('talent_practice_attempts')
    .select('consecutive_correct')
    .eq('user_id', opts.userId)
    .eq('challenge_id', opts.challengeId)
    .eq('question_id', opts.questionId)
    .order('attempted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const priorStreak = typeof prior?.consecutive_correct === 'number'
    ? prior.consecutive_correct
    : 0;
  const consecutiveCorrect = wasCorrect ? priorStreak + 1 : 0;
  const intervalDays = nextIntervalDays(consecutiveCorrect - (wasCorrect ? 1 : 0), wasCorrect);
  const nextDueAt = nextDueAtFrom(intervalDays);

  const { data: inserted, error } = await db
    .from('talent_practice_attempts')
    .insert({
      user_id: opts.userId,
      challenge_id: opts.challengeId,
      question_id: opts.questionId,
      domain: opts.domain,
      was_correct: wasCorrect,
      source: opts.source,
      answer_index: opts.answerIndex,
      correct_index: opts.correctIndex,
      consecutive_correct: consecutiveCorrect,
      interval_days: intervalDays,
      next_due_at: nextDueAt,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(
      `Failed to record practice attempt: ${error?.message ?? 'no insert result'}`
    );
  }

  return {
    attemptId: inserted.id,
    wasCorrect,
    intervalDays,
    nextDueAt,
    consecutiveCorrect,
  };
}
