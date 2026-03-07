export type ChallengeType = 'quiz' | 'project';
export type ChallengeStatus = 'draft' | 'active' | 'closed' | 'published';
export type SubmissionStatus = 'draft' | 'submitted' | 'graded' | 'disqualified';

const DOUALA_OFFSET_MS = 60 * 60 * 1000; // GMT+1
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DoualaWeekWindow {
  weekKey: string;
  weekStartDate: string;
  weekEndDate: string;
  windowStartUtc: Date;
  windowEndUtc: Date;
}

export interface ChallengeQuizQuestion {
  question?: string;
  options?: string[];
  correct_index: number;
}

export interface NormalizedProjectSubmission {
  summary_text: string;
  github_url: string;
  file_url: string;
  extra: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseNumberish(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDoualaShift(date: Date): Date {
  return new Date(date.getTime() + DOUALA_OFFSET_MS);
}

function fromDoualaShift(shiftedDate: Date): Date {
  return new Date(shiftedDate.getTime() - DOUALA_OFFSET_MS);
}

function isoWeekFromShiftedDate(shiftedDate: Date): { year: number; week: number } {
  const temp = new Date(
    Date.UTC(
      shiftedDate.getUTCFullYear(),
      shiftedDate.getUTCMonth(),
      shiftedDate.getUTCDate()
    )
  );
  const day = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((temp.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return { year: temp.getUTCFullYear(), week };
}

function formatWeekKey(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function buildWeekWindowFromShiftedStart(shiftedStart: Date): DoualaWeekWindow {
  const shiftedWeekStart = new Date(
    Date.UTC(
      shiftedStart.getUTCFullYear(),
      shiftedStart.getUTCMonth(),
      shiftedStart.getUTCDate()
    )
  );
  const shiftedWeekEndDate = new Date(shiftedWeekStart.getTime());
  shiftedWeekEndDate.setUTCDate(shiftedWeekEndDate.getUTCDate() + 6);

  const shiftedWeekEnd = new Date(shiftedWeekEndDate.getTime());
  shiftedWeekEnd.setUTCHours(23, 59, 59, 999);

  const { year, week } = isoWeekFromShiftedDate(shiftedWeekStart);

  return {
    weekKey: formatWeekKey(year, week),
    weekStartDate: shiftedWeekStart.toISOString().slice(0, 10),
    weekEndDate: shiftedWeekEndDate.toISOString().slice(0, 10),
    windowStartUtc: fromDoualaShift(shiftedWeekStart),
    windowEndUtc: fromDoualaShift(shiftedWeekEnd),
  };
}

export function getCurrentDoualaWeekWindow(now: Date = new Date()): DoualaWeekWindow {
  const shiftedNow = toDoualaShift(now);
  const shiftedDayStart = new Date(
    Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate()
    )
  );

  const day = shiftedDayStart.getUTCDay(); // 0=Sun ... 6=Sat
  const daysFromMonday = (day + 6) % 7;
  const shiftedWeekStart = new Date(shiftedDayStart.getTime());
  shiftedWeekStart.setUTCDate(shiftedWeekStart.getUTCDate() - daysFromMonday);

  return buildWeekWindowFromShiftedStart(shiftedWeekStart);
}

export function getDoualaWeekWindowFromKey(inputWeekKey: string): DoualaWeekWindow | null {
  const raw = inputWeekKey.trim();
  const match = raw.match(/^(\d{4})-?W?(\d{2})$/i);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }

  // ISO week 1 always contains Jan 4.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const shiftedWeek1Monday = new Date(jan4.getTime());
  shiftedWeek1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);

  const shiftedWeekStart = new Date(shiftedWeek1Monday.getTime());
  shiftedWeekStart.setUTCDate(shiftedWeek1Monday.getUTCDate() + (week - 1) * 7);

  return buildWeekWindowFromShiftedStart(shiftedWeekStart);
}

export function extractChallengeQuizQuestions(config: unknown): ChallengeQuizQuestion[] {
  if (!isRecord(config)) return [];

  let rawQuestions: unknown = config.questions;
  if (!Array.isArray(rawQuestions) && Array.isArray(config.quiz_questions)) {
    rawQuestions = config.quiz_questions;
  }
  if (!Array.isArray(rawQuestions) && isRecord(config.quiz) && Array.isArray(config.quiz.questions)) {
    rawQuestions = config.quiz.questions;
  }
  if (!Array.isArray(rawQuestions)) return [];

  const questions: ChallengeQuizQuestion[] = [];
  for (const item of rawQuestions) {
    if (!isRecord(item)) continue;
    const correct = parseNumberish(item.correct_index);
    if (correct === null || correct < 0) continue;
    questions.push({
      question: typeof item.question === 'string' ? item.question : undefined,
      options: Array.isArray(item.options)
        ? item.options.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
      correct_index: Math.floor(correct),
    });
  }
  return questions;
}

export function gradeChallengeQuiz(
  questions: ChallengeQuizQuestion[],
  answers: number[]
): { correct: number; total: number; score: number } {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { correct: 0, total: 0, score: 0 };
  }

  let correct = 0;
  for (let i = 0; i < questions.length; i += 1) {
    if (answers[i] === questions[i].correct_index) {
      correct += 1;
    }
  }

  const score = roundScore((correct / questions.length) * 100);
  return { correct, total: questions.length, score };
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizeProjectSubmission(input: unknown): NormalizedProjectSubmission {
  const payload = isRecord(input) ? input : {};
  const summary_text = cleanText(payload.summary_text ?? payload.summary ?? payload.text);
  const github_url = cleanText(payload.github_url ?? payload.githubUrl ?? payload.github);
  const file_url = cleanText(payload.file_url ?? payload.fileUrl ?? payload.document_url);

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!['summary_text', 'summary', 'text', 'github_url', 'githubUrl', 'github', 'file_url', 'fileUrl', 'document_url'].includes(key)) {
      extra[key] = value;
    }
  }

  return {
    summary_text,
    github_url,
    file_url,
    extra,
  };
}

export function hasRequiredProjectDeliverables(
  submission: NormalizedProjectSubmission
): boolean {
  return Boolean(
    submission.summary_text &&
      submission.github_url &&
      submission.file_url
  );
}

export function computeProjectAutoScore(
  submission: NormalizedProjectSubmission
): number {
  let score = 0;
  if (submission.summary_text) score += 30;
  if (submission.github_url) score += 30;
  if (submission.file_url) score += 30;

  const summaryLen = submission.summary_text.length;
  if (summaryLen >= 600) {
    score += 10;
  } else if (summaryLen >= 300) {
    score += 7;
  } else if (summaryLen >= 150) {
    score += 4;
  } else if (summaryLen >= 60) {
    score += 2;
  }

  return Math.max(0, Math.min(100, roundScore(score)));
}

function resolveProjectWeights(config: unknown): { manual: number; auto: number } {
  const fallback = { manual: 0.6, auto: 0.4 };
  if (!isRecord(config)) return fallback;

  const weightsSource = isRecord(config.project_scoring)
    ? config.project_scoring
    : isRecord(config.weights)
      ? config.weights
      : config;

  let manual =
    parseNumberish(weightsSource.manual_weight ?? weightsSource.manualWeight) ??
    parseNumberish(weightsSource.manual);
  let auto =
    parseNumberish(weightsSource.auto_weight ?? weightsSource.autoWeight) ??
    parseNumberish(weightsSource.auto);

  if (manual === null && auto === null) return fallback;
  if (manual === null && auto !== null) manual = 1 - auto;
  if (auto === null && manual !== null) auto = 1 - manual;
  if (manual === null || auto === null) return fallback;

  if (manual > 1 || auto > 1) {
    manual /= 100;
    auto /= 100;
  }

  if (manual < 0 || auto < 0) return fallback;

  const total = manual + auto;
  if (total <= 0) return fallback;

  return {
    manual: manual / total,
    auto: auto / total,
  };
}

export function computeBlendedProjectScore(
  autoScore: number,
  manualScore: number,
  challengeConfig: unknown
): number {
  const weights = resolveProjectWeights(challengeConfig);
  const boundedAuto = Math.max(0, Math.min(100, autoScore));
  const boundedManual = Math.max(0, Math.min(100, manualScore));

  return roundScore(boundedAuto * weights.auto + boundedManual * weights.manual);
}

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isChallengeType(value: unknown): value is ChallengeType {
  return value === 'quiz' || value === 'project';
}

export function isChallengeStatus(value: unknown): value is ChallengeStatus {
  return (
    value === 'draft' ||
    value === 'active' ||
    value === 'closed' ||
    value === 'published'
  );
}
