import type {
  InterviewPrepAttempt,
  InterviewPrepReadinessSummary,
  InterviewPrepRubricArea,
} from '@/lib/ai/interviewPrep';
import { normalizeStoredInterviewPrepAnswerFeedback } from '@/lib/interview-prep/feedback';

const RUBRIC_LABELS: Record<InterviewPrepRubricArea, string> = {
  relevance: 'Relevance',
  specificity: 'Specificity',
  structure: 'Structure',
  confidence: 'Confidence',
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeInterviewPrepAttemptRow(row: any): InterviewPrepAttempt | null {
  const feedback = normalizeStoredInterviewPrepAnswerFeedback(row?.feedback_json);
  if (!row?.id || !row?.session_id || !row?.application_id || !row?.user_id || !feedback) {
    return null;
  }

  const userMessage = typeof row.user_message === 'string' ? row.user_message.trim() : '';
  if (!userMessage) {
    return null;
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    applicationId: row.application_id,
    userId: row.user_id,
    question:
      typeof row.question === 'string' && row.question.trim() ? row.question.trim() : null,
    userMessage,
    feedback,
    overallScore:
      typeof row.overall_score === 'number' && Number.isFinite(row.overall_score)
        ? Math.max(0, Math.min(100, Math.round(row.overall_score)))
        : feedback.overallScore,
    modelUsed:
      typeof row.model_used === 'string' && row.model_used.trim()
        ? row.model_used.trim()
        : null,
    tokensUsed:
      typeof row.tokens_used === 'number' && Number.isFinite(row.tokens_used)
        ? Math.max(0, Math.round(row.tokens_used))
        : 0,
    createdAt:
      typeof row.created_at === 'string' && row.created_at.trim()
        ? row.created_at
        : new Date().toISOString(),
  };
}

export function buildInterviewPrepReadinessSummary(
  attempts: InterviewPrepAttempt[]
): InterviewPrepReadinessSummary | null {
  if (!attempts.length) {
    return null;
  }

  const sorted = [...attempts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
  const latest = sorted[0];
  const previous = sorted[1] || null;
  const averageScore = Math.round(
    sorted.reduce((total, attempt) => total + attempt.overallScore, 0) / sorted.length
  );

  let trend: InterviewPrepReadinessSummary['trend'] = null;
  if (previous) {
    const diff = latest.overallScore - previous.overallScore;
    if (diff >= 5) {
      trend = 'improving';
    } else if (diff <= -5) {
      trend = 'needs_work';
    } else {
      trend = 'steady';
    }
  }

  const rubricAreas: InterviewPrepRubricArea[] = [
    'relevance',
    'specificity',
    'structure',
    'confidence',
  ];
  let weakestArea: InterviewPrepRubricArea | null = null;
  let weakestAreaAverage: number | null = null;

  for (const area of rubricAreas) {
    const average =
      sorted.reduce((total, attempt) => total + attempt.feedback.rubric[area].score, 0) /
      sorted.length;
    if (weakestAreaAverage === null || average < weakestAreaAverage) {
      weakestArea = area;
      weakestAreaAverage = average;
    }
  }

  return {
    attemptCount: sorted.length,
    averageScore,
    latestScore: latest.overallScore,
    trend,
    weakestArea,
    weakestAreaLabel: weakestArea ? RUBRIC_LABELS[weakestArea] : null,
    weakestAreaAverage:
      weakestAreaAverage === null ? null : roundToOneDecimal(weakestAreaAverage),
    updatedAt: latest.createdAt,
  };
}

export function groupInterviewPrepAttemptsBySession(
  attempts: InterviewPrepAttempt[]
): Map<string, InterviewPrepAttempt[]> {
  const grouped = new Map<string, InterviewPrepAttempt[]>();

  for (const attempt of attempts) {
    const current = grouped.get(attempt.sessionId) || [];
    current.push(attempt);
    grouped.set(attempt.sessionId, current);
  }

  return grouped;
}

export function groupInterviewPrepAttemptsByApplication(
  attempts: InterviewPrepAttempt[]
): Map<string, InterviewPrepAttempt[]> {
  const grouped = new Map<string, InterviewPrepAttempt[]>();

  for (const attempt of attempts) {
    const current = grouped.get(attempt.applicationId) || [];
    current.push(attempt);
    grouped.set(attempt.applicationId, current);
  }

  return grouped;
}

export function buildInterviewPrepReadinessBySession(
  attempts: InterviewPrepAttempt[]
): Map<string, InterviewPrepReadinessSummary> {
  const grouped = groupInterviewPrepAttemptsBySession(attempts);
  const readinessBySession = new Map<string, InterviewPrepReadinessSummary>();

  for (const [sessionId, sessionAttempts] of grouped.entries()) {
    const readiness = buildInterviewPrepReadinessSummary(sessionAttempts);
    if (readiness) {
      readinessBySession.set(sessionId, readiness);
    }
  }

  return readinessBySession;
}

export function buildInterviewPrepReadinessByApplication(
  attempts: InterviewPrepAttempt[]
): Map<string, InterviewPrepReadinessSummary> {
  const grouped = groupInterviewPrepAttemptsByApplication(attempts);
  const readinessByApplication = new Map<string, InterviewPrepReadinessSummary>();

  for (const [applicationId, applicationAttempts] of grouped.entries()) {
    const readiness = buildInterviewPrepReadinessSummary(applicationAttempts);
    if (readiness) {
      readinessByApplication.set(applicationId, readiness);
    }
  }

  return readinessByApplication;
}

export function isInterviewPrepAttemptsTableMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = typeof record.message === 'string' ? record.message.toLowerCase() : '';

  return (
    code === '42P01' ||
    (message.includes('interview_prep_attempts') &&
      (message.includes('does not exist') || message.includes('not found')))
  );
}
