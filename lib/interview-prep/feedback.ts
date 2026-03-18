import type { InterviewPrepAnswerFeedback } from '@/lib/ai/interviewPrep';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function normalizeFeedbackMetric(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const score =
    typeof record.score === 'number' && Number.isFinite(record.score)
      ? Math.max(1, Math.min(5, Math.round(record.score)))
      : null;
  const note = typeof record.note === 'string' ? record.note.trim() : '';

  if (score === null || !note) {
    return null;
  }

  return {
    score,
    note,
  };
}

export function normalizeStoredInterviewPrepAnswerFeedback(
  value: unknown
): InterviewPrepAnswerFeedback | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
  const overallScore =
    typeof record.overallScore === 'number' && Number.isFinite(record.overallScore)
      ? Math.max(0, Math.min(100, Math.round(record.overallScore)))
      : null;
  const rubric =
    record.rubric && typeof record.rubric === 'object' && !Array.isArray(record.rubric)
      ? (record.rubric as Record<string, unknown>)
      : null;

  if (!summary || overallScore === null || !rubric) {
    return null;
  }

  const relevance = normalizeFeedbackMetric(rubric.relevance);
  const specificity = normalizeFeedbackMetric(rubric.specificity);
  const structure = normalizeFeedbackMetric(rubric.structure);
  const confidence = normalizeFeedbackMetric(rubric.confidence);

  if (!relevance || !specificity || !structure || !confidence) {
    return null;
  }

  const rewrittenAnswer =
    typeof record.rewrittenAnswer === 'string' && record.rewrittenAnswer.trim()
      ? record.rewrittenAnswer.trim()
      : null;
  const nextQuestion =
    typeof record.nextQuestion === 'string' ? record.nextQuestion.trim() : '';
  const coachingTip =
    typeof record.coachingTip === 'string' ? record.coachingTip.trim() : '';

  if (!nextQuestion || !coachingTip) {
    return null;
  }

  return {
    summary,
    overallScore,
    rubric: {
      relevance,
      specificity,
      structure,
      confidence,
    },
    strengths: normalizeStringArray(record.strengths).slice(0, 3),
    improvements: normalizeStringArray(record.improvements).slice(0, 3),
    rewrittenAnswer,
    nextQuestion,
    coachingTip,
  };
}
