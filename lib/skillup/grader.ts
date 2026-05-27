/**
 * Mixed-type quiz grader.
 *
 * Supports: mcq_single, true_false, numeric, matching, ordering. Backwards
 * compatible with the original MCQ-only shape used by the V1 leaderboard
 * publisher and the legacy submit path.
 *
 * Scoring is per-question (0 or 1) summed and normalised to /100. Per-question
 * weighting via an optional `points` field is supported but not required;
 * unspecified questions are weighted equally.
 */

export type QuestionType =
  | 'mcq_single'
  | 'true_false'
  | 'numeric'
  | 'matching'
  | 'ordering';

interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  explanation: string | null;
  time_limit_seconds: number | null;
  points: number;
}

export interface McqSingleQuestion extends BaseQuestion {
  type: 'mcq_single';
  options: string[];
  correct_index: number;
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'true_false';
  options: string[]; // always [true_label, false_label] for display
  correct_index: number; // 0 or 1
}

export interface NumericQuestion extends BaseQuestion {
  type: 'numeric';
  expected_value: number;
  tolerance: number;
  unit_hint: string | null;
  input_kind: 'integer' | 'decimal';
}

export interface MatchingQuestion extends BaseQuestion {
  type: 'matching';
  left_items: string[];
  right_items: string[];
  correct_pairs: Array<[number, number]>;
}

export interface OrderingQuestion extends BaseQuestion {
  type: 'ordering';
  items: string[];
  correct_order: number[];
}

export type ExtendedQuestion =
  | McqSingleQuestion
  | TrueFalseQuestion
  | NumericQuestion
  | MatchingQuestion
  | OrderingQuestion;

export type AnswerValue =
  | { type: 'mcq_single' | 'true_false'; selected_index: number | null }
  | { type: 'numeric'; value: number | null }
  | { type: 'matching'; pairs: Array<[number, number]> }
  | { type: 'ordering'; order: number[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isFinite(item));
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const n = asNumber(value);
  if (n === null || n <= 0) return fallback;
  return Math.floor(n);
}

function pickLocalized<T>(
  raw: Record<string, unknown>,
  base: string,
  locale: 'en' | 'fr'
): T | undefined {
  const frKey = `${base}_fr` as const;
  if (locale === 'fr' && raw[frKey] !== undefined && raw[frKey] !== null) {
    return raw[frKey] as T;
  }
  return raw[base] as T | undefined;
}

function fallbackId(index: number): string {
  return `q${index + 1}`;
}

export function parseExtendedQuestion(
  raw: unknown,
  index: number,
  locale: 'en' | 'fr' = 'en'
): ExtendedQuestion | null {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : fallbackId(index);
  const promptCandidate = pickLocalized<string>(raw, 'question', locale);
  const prompt = typeof promptCandidate === 'string' ? promptCandidate.trim() : '';
  if (!prompt) return null;

  const rawType = typeof raw.type === 'string' ? raw.type : 'mcq_single';
  const explanationCandidate = pickLocalized<string>(raw, 'explanation', locale);
  const explanation =
    typeof explanationCandidate === 'string' && explanationCandidate.trim()
      ? explanationCandidate.trim()
      : null;
  const timeLimit =
    typeof raw.time_limit_seconds === 'number' && raw.time_limit_seconds > 0
      ? Math.floor(raw.time_limit_seconds)
      : null;
  const points = Math.max(1, asPositiveInt(raw.points, 1));

  const base: BaseQuestion = {
    id,
    type: 'mcq_single',
    prompt,
    explanation,
    time_limit_seconds: timeLimit,
    points,
  };

  if (rawType === 'mcq_single' || rawType === 'true_false') {
    const options =
      (pickLocalized<unknown>(raw, 'options', locale) as unknown[] | undefined) ?? [];
    if (!isStringArray(options) || options.length < 2) return null;
    const correctIndex = asNumber(raw.correct_index);
    if (correctIndex === null || correctIndex < 0 || correctIndex >= options.length) {
      return null;
    }
    return {
      ...base,
      type: rawType,
      options,
      correct_index: Math.floor(correctIndex),
    } as McqSingleQuestion | TrueFalseQuestion;
  }

  if (rawType === 'numeric') {
    const expected = asNumber(raw.expected_value);
    if (expected === null) return null;
    const tolerance = asNumber(raw.tolerance);
    const unitHint = typeof raw.unit_hint === 'string' ? raw.unit_hint : null;
    const inputKind = raw.input_kind === 'decimal' ? 'decimal' : 'integer';
    return {
      ...base,
      type: 'numeric',
      expected_value: expected,
      tolerance: tolerance ?? 0,
      unit_hint: unitHint,
      input_kind: inputKind,
    };
  }

  if (rawType === 'matching') {
    const left = pickLocalized<unknown>(raw, 'left_items', locale);
    const right = pickLocalized<unknown>(raw, 'right_items', locale);
    if (!isStringArray(left) || !isStringArray(right)) return null;
    if (left.length === 0 || right.length === 0) return null;
    const pairsRaw = raw.correct_pairs;
    if (!Array.isArray(pairsRaw)) return null;
    const pairs: Array<[number, number]> = [];
    for (const pair of pairsRaw) {
      if (!Array.isArray(pair) || pair.length !== 2) return null;
      const li = asNumber(pair[0]);
      const ri = asNumber(pair[1]);
      if (li === null || ri === null) return null;
      if (li < 0 || li >= left.length || ri < 0 || ri >= right.length) return null;
      pairs.push([Math.floor(li), Math.floor(ri)]);
    }
    if (pairs.length === 0) return null;
    return {
      ...base,
      type: 'matching',
      left_items: left,
      right_items: right,
      correct_pairs: pairs,
    };
  }

  if (rawType === 'ordering') {
    const items = pickLocalized<unknown>(raw, 'items', locale);
    if (!isStringArray(items) || items.length < 2) return null;
    const order = raw.correct_order;
    if (!isNumberArray(order) || order.length !== items.length) return null;
    const seen = new Set<number>();
    for (const idx of order) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) return null;
      seen.add(idx);
    }
    if (seen.size !== items.length) return null;
    return {
      ...base,
      type: 'ordering',
      items,
      correct_order: order.map((n) => Math.floor(n)),
    };
  }

  return null;
}

export function extractExtendedQuestions(
  config: unknown,
  locale: 'en' | 'fr' = 'en'
): ExtendedQuestion[] {
  if (!isRecord(config)) return [];
  let raw: unknown = config.questions;
  if (!Array.isArray(raw) && Array.isArray(config.quiz_questions)) {
    raw = config.quiz_questions;
  }
  if (!Array.isArray(raw)) return [];

  const parsed: ExtendedQuestion[] = [];
  raw.forEach((entry, index) => {
    const question = parseExtendedQuestion(entry, index, locale);
    if (question) parsed.push(question);
  });
  return parsed;
}

function gradeMcqLike(
  question: McqSingleQuestion | TrueFalseQuestion,
  answer: AnswerValue | undefined
): boolean {
  if (!answer || (answer.type !== 'mcq_single' && answer.type !== 'true_false')) {
    return false;
  }
  return answer.selected_index === question.correct_index;
}

function gradeNumeric(
  question: NumericQuestion,
  answer: AnswerValue | undefined
): boolean {
  if (!answer || answer.type !== 'numeric' || answer.value === null) return false;
  const diff = Math.abs(answer.value - question.expected_value);
  return diff <= question.tolerance;
}

function gradeMatching(
  question: MatchingQuestion,
  answer: AnswerValue | undefined
): boolean {
  if (!answer || answer.type !== 'matching') return false;
  if (answer.pairs.length !== question.correct_pairs.length) return false;
  const correctSet = new Set(question.correct_pairs.map(([l, r]) => `${l}:${r}`));
  for (const [l, r] of answer.pairs) {
    if (!correctSet.has(`${l}:${r}`)) return false;
  }
  return true;
}

function gradeOrdering(
  question: OrderingQuestion,
  answer: AnswerValue | undefined
): boolean {
  if (!answer || answer.type !== 'ordering') return false;
  if (answer.order.length !== question.correct_order.length) return false;
  for (let i = 0; i < question.correct_order.length; i += 1) {
    if (answer.order[i] !== question.correct_order[i]) return false;
  }
  return true;
}

export interface PerQuestionResult {
  id: string;
  type: QuestionType;
  is_correct: boolean;
  points_earned: number;
  points_possible: number;
}

export interface MixedQuizGradingResult {
  correct: number;
  total: number;
  score: number; // 0..100
  per_question: PerQuestionResult[];
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function gradeMixedQuiz(
  questions: ExtendedQuestion[],
  answers: Array<AnswerValue | undefined>
): MixedQuizGradingResult {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { correct: 0, total: 0, score: 0, per_question: [] };
  }

  let correct = 0;
  let pointsPossible = 0;
  let pointsEarned = 0;
  const perQuestion: PerQuestionResult[] = [];

  for (let i = 0; i < questions.length; i += 1) {
    const question = questions[i];
    const answer = answers[i];
    let isCorrect = false;
    switch (question.type) {
      case 'mcq_single':
      case 'true_false':
        isCorrect = gradeMcqLike(question, answer);
        break;
      case 'numeric':
        isCorrect = gradeNumeric(question, answer);
        break;
      case 'matching':
        isCorrect = gradeMatching(question, answer);
        break;
      case 'ordering':
        isCorrect = gradeOrdering(question, answer);
        break;
    }
    const earned = isCorrect ? question.points : 0;
    pointsPossible += question.points;
    pointsEarned += earned;
    if (isCorrect) correct += 1;
    perQuestion.push({
      id: question.id,
      type: question.type,
      is_correct: isCorrect,
      points_earned: earned,
      points_possible: question.points,
    });
  }

  const score = pointsPossible > 0 ? roundTo((pointsEarned / pointsPossible) * 100, 2) : 0;
  return { correct, total: questions.length, score, per_question: perQuestion };
}

/**
 * Validates the client-provided per-question durations against each
 * question's time_limit_seconds. Returns the list of question ids that
 * exceeded their per-question time budget plus a 5-second grace.
 */
export function questionsOverTime(
  questions: ExtendedQuestion[],
  durationsSeconds: Array<number | null | undefined>,
  graceSeconds = 5
): string[] {
  const out: string[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const question = questions[i];
    if (question.time_limit_seconds === null) continue;
    const duration = durationsSeconds[i];
    if (typeof duration !== 'number' || !Number.isFinite(duration)) continue;
    if (duration > question.time_limit_seconds + graceSeconds) {
      out.push(question.id);
    }
  }
  return out;
}

export function sanitizeMixedAnswers(raw: unknown): Array<AnswerValue | undefined> {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry): AnswerValue | undefined => {
    if (!isRecord(entry)) return undefined;
    const type = entry.type;
    if (type === 'mcq_single' || type === 'true_false') {
      const idx = asNumber(entry.selected_index);
      return {
        type,
        selected_index: idx !== null && idx >= 0 ? Math.floor(idx) : null,
      };
    }
    if (type === 'numeric') {
      const value = asNumber(entry.value);
      return { type: 'numeric', value };
    }
    if (type === 'matching') {
      const pairsRaw = entry.pairs;
      if (!Array.isArray(pairsRaw)) return { type: 'matching', pairs: [] };
      const pairs: Array<[number, number]> = [];
      for (const p of pairsRaw) {
        if (!Array.isArray(p) || p.length !== 2) continue;
        const li = asNumber(p[0]);
        const ri = asNumber(p[1]);
        if (li === null || ri === null) continue;
        pairs.push([Math.floor(li), Math.floor(ri)]);
      }
      return { type: 'matching', pairs };
    }
    if (type === 'ordering') {
      const orderRaw = entry.order;
      if (!Array.isArray(orderRaw)) return { type: 'ordering', order: [] };
      const order: number[] = [];
      for (const v of orderRaw) {
        const n = asNumber(v);
        if (n === null) continue;
        order.push(Math.floor(n));
      }
      return { type: 'ordering', order };
    }
    return undefined;
  });
}
