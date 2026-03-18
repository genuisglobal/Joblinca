import type {
  InterviewPrepAttempt,
  InterviewPrepChatMessage,
  InterviewPrepPack,
  InterviewPrepReadinessSummary,
  InterviewPrepSession,
  InterviewPrepSessionSummary,
} from '@/lib/ai/interviewPrep';
import { normalizeStoredInterviewPrepAnswerFeedback } from '@/lib/interview-prep/feedback';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function normalizeReadiness(value: unknown): InterviewPrepReadinessSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const attemptCount =
    typeof record.attemptCount === 'number' && Number.isFinite(record.attemptCount)
      ? Math.max(0, Math.round(record.attemptCount))
      : null;
  const averageScore =
    typeof record.averageScore === 'number' && Number.isFinite(record.averageScore)
      ? Math.max(0, Math.min(100, Math.round(record.averageScore)))
      : null;
  const latestScore =
    typeof record.latestScore === 'number' && Number.isFinite(record.latestScore)
      ? Math.max(0, Math.min(100, Math.round(record.latestScore)))
      : null;
  const trend =
    record.trend === 'improving' || record.trend === 'steady' || record.trend === 'needs_work'
      ? record.trend
      : null;
  const weakestArea =
    record.weakestArea === 'relevance' ||
    record.weakestArea === 'specificity' ||
    record.weakestArea === 'structure' ||
    record.weakestArea === 'confidence'
      ? record.weakestArea
      : null;
  const weakestAreaLabel =
    typeof record.weakestAreaLabel === 'string' && record.weakestAreaLabel.trim()
      ? record.weakestAreaLabel.trim()
      : null;
  const weakestAreaAverage =
    typeof record.weakestAreaAverage === 'number' &&
    Number.isFinite(record.weakestAreaAverage)
      ? Math.max(1, Math.min(5, Number(record.weakestAreaAverage.toFixed(1))))
      : null;
  const updatedAt =
    typeof record.updatedAt === 'string' && record.updatedAt.trim()
      ? record.updatedAt
      : null;

  if (attemptCount === null) {
    return null;
  }

  return {
    attemptCount,
    averageScore,
    latestScore,
    trend,
    weakestArea,
    weakestAreaLabel,
    weakestAreaAverage,
    updatedAt,
  };
}

function normalizeAttempt(value: unknown): InterviewPrepAttempt | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : '';
  const applicationId = typeof record.applicationId === 'string' ? record.applicationId : '';
  const userId = typeof record.userId === 'string' ? record.userId : '';
  const userMessage =
    typeof record.userMessage === 'string' ? record.userMessage.trim() : '';
  const feedback = normalizeStoredInterviewPrepAnswerFeedback(record.feedback);

  if (!id || !sessionId || !applicationId || !userId || !userMessage || !feedback) {
    return null;
  }

  return {
    id,
    sessionId,
    applicationId,
    userId,
    question: typeof record.question === 'string' && record.question.trim() ? record.question.trim() : null,
    userMessage,
    feedback,
    overallScore:
      typeof record.overallScore === 'number' && Number.isFinite(record.overallScore)
        ? Math.max(0, Math.min(100, Math.round(record.overallScore)))
        : feedback.overallScore,
    modelUsed:
      typeof record.modelUsed === 'string' && record.modelUsed.trim()
        ? record.modelUsed.trim()
        : null,
    tokensUsed:
      typeof record.tokensUsed === 'number' && Number.isFinite(record.tokensUsed)
        ? Math.max(0, Math.round(record.tokensUsed))
        : 0,
    createdAt:
      typeof record.createdAt === 'string' && record.createdAt.trim()
        ? record.createdAt
        : new Date().toISOString(),
  };
}

function normalizeMessages(value: unknown): InterviewPrepChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (record.role !== 'user' && record.role !== 'assistant') {
        return null;
      }

      const content = typeof record.content === 'string' ? record.content.trim() : '';
      const timestamp =
        typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString();

      if (!content) {
        return null;
      }

      return {
        role: record.role,
        content,
        timestamp,
        feedback: normalizeStoredInterviewPrepAnswerFeedback(record.feedback),
      } satisfies InterviewPrepChatMessage;
    })
    .filter(Boolean) as InterviewPrepChatMessage[];
}

function normalizePrepPack(value: unknown): InterviewPrepPack {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const likelyQuestions = Array.isArray(record.likelyQuestions)
    ? record.likelyQuestions
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
          }

          const questionRecord = item as Record<string, unknown>;
          const question =
            typeof questionRecord.question === 'string' ? questionRecord.question.trim() : '';
          const whyItMatters =
            typeof questionRecord.whyItMatters === 'string'
              ? questionRecord.whyItMatters.trim()
              : '';

          if (!question || !whyItMatters) {
            return null;
          }

          return {
            question,
            whyItMatters,
            talkingPoints: normalizeStringArray(questionRecord.talkingPoints),
          };
        })
        .filter(
          (
            item
          ): item is {
            question: string;
            whyItMatters: string;
            talkingPoints: string[];
          } => item !== null
        )
    : [];

  const storiesToPrepare = Array.isArray(record.storiesToPrepare)
    ? record.storiesToPrepare
        .map((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return null;
          }

          const storyRecord = item as Record<string, unknown>;
          const theme =
            typeof storyRecord.theme === 'string' ? storyRecord.theme.trim() : '';
          const prompt =
            typeof storyRecord.prompt === 'string' ? storyRecord.prompt.trim() : '';

          if (!theme || !prompt) {
            return null;
          }

          return {
            theme,
            prompt,
            proofPoints: normalizeStringArray(storyRecord.proofPoints),
          };
        })
        .filter(
          (
            item
          ): item is {
            theme: string;
            prompt: string;
            proofPoints: string[];
          } => item !== null
        )
    : [];

  return {
    summary: typeof record.summary === 'string' ? record.summary.trim() : '',
    elevatorPitch:
      typeof record.elevatorPitch === 'string' ? record.elevatorPitch.trim() : '',
    focusAreas: normalizeStringArray(record.focusAreas),
    likelyQuestions,
    storiesToPrepare,
    questionsToAsk: normalizeStringArray(record.questionsToAsk),
    risksToAddress: normalizeStringArray(record.risksToAddress),
    checklist: normalizeStringArray(record.checklist),
    modelUsed: typeof record.modelUsed === 'string' ? record.modelUsed : undefined,
    tokensUsed:
      typeof record.tokensUsed === 'number' && Number.isFinite(record.tokensUsed)
        ? record.tokensUsed
        : undefined,
  };
}

export function buildInterviewPrepSessionTitle(
  jobTitle: string,
  companyName?: string | null
): string {
  return companyName ? `${jobTitle} - ${companyName}` : jobTitle;
}

export function normalizeInterviewPrepSessionRow(row: any): InterviewPrepSession {
  const contextSnapshot =
    row?.context_snapshot && typeof row.context_snapshot === 'object' && !Array.isArray(row.context_snapshot)
      ? (row.context_snapshot as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    userId: row.user_id,
    applicationId: row.application_id,
    title: row.title || 'Interview Prep Session',
    prep: normalizePrepPack(row.prep_pack),
    contextSnapshot,
    messages: normalizeMessages(row.messages),
    readiness: normalizeReadiness(row.readiness),
    recentAttempts: Array.isArray(row.recent_attempts)
      ? row.recent_attempts.map(normalizeAttempt).filter(Boolean) as InterviewPrepAttempt[]
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function summarizeInterviewPrepSessionRow(row: any): InterviewPrepSessionSummary {
  const session = normalizeInterviewPrepSessionRow(row);
  const jobTitle =
    typeof session.contextSnapshot.jobTitle === 'string'
      ? session.contextSnapshot.jobTitle
      : null;
  const companyName =
    typeof session.contextSnapshot.companyName === 'string'
      ? session.contextSnapshot.companyName
      : null;

  return {
    id: session.id,
    title: session.title,
    applicationId: session.applicationId,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
    jobTitle,
    companyName,
    readiness: session.readiness,
  };
}

export function withInterviewPrepSessionReadiness(
  session: InterviewPrepSession,
  readiness: InterviewPrepReadinessSummary | null,
  recentAttempts: InterviewPrepAttempt[]
): InterviewPrepSession {
  return {
    ...session,
    readiness,
    recentAttempts,
  };
}

export function withInterviewPrepSessionSummaryReadiness(
  summary: InterviewPrepSessionSummary,
  readiness: InterviewPrepReadinessSummary | null
): InterviewPrepSessionSummary {
  return {
    ...summary,
    readiness,
  };
}
