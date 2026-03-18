import { z } from 'zod';
import { callAiJson, isAiConfigured } from '@/lib/ai/client';
import {
  buildInterviewPrepFollowUpSystemPrompt,
  buildInterviewPrepSystemPrompt,
  buildInterviewPrepUserPrompt,
} from '@/lib/ai/policies';

export interface InterviewPrepQuestionInput {
  question: string;
  required?: boolean;
  answer?: string | null;
}

export interface InterviewPrepInterviewInput {
  scheduledAt: string;
  timezone?: string | null;
  mode?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface InterviewPrepInput {
  jobTitle: string;
  companyName?: string | null;
  jobDescription?: string | null;
  jobLocation?: string | null;
  workType?: string | null;
  candidateName?: string | null;
  candidateHeadline?: string | null;
  candidateLocation?: string | null;
  candidateSkills?: string[];
  careerGoals?: string[];
  profileSummary?: string | null;
  coverLetter?: string | null;
  hasResume?: boolean;
  screeningQuestions?: InterviewPrepQuestionInput[];
  nextInterview?: InterviewPrepInterviewInput | null;
}

export interface InterviewPrepQuestion {
  question: string;
  whyItMatters: string;
  talkingPoints: string[];
}

export interface InterviewPrepStory {
  theme: string;
  prompt: string;
  proofPoints: string[];
}

export interface InterviewPrepPack {
  summary: string;
  elevatorPitch: string;
  focusAreas: string[];
  likelyQuestions: InterviewPrepQuestion[];
  storiesToPrepare: InterviewPrepStory[];
  questionsToAsk: string[];
  risksToAddress: string[];
  checklist: string[];
  modelUsed?: string;
  tokensUsed?: number;
}

export interface InterviewPrepChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  feedback?: InterviewPrepAnswerFeedback | null;
}

export type InterviewPrepRubricArea =
  | 'relevance'
  | 'specificity'
  | 'structure'
  | 'confidence';

export interface InterviewPrepReadinessSummary {
  attemptCount: number;
  averageScore: number | null;
  latestScore: number | null;
  trend: 'improving' | 'steady' | 'needs_work' | null;
  weakestArea: InterviewPrepRubricArea | null;
  weakestAreaLabel: string | null;
  weakestAreaAverage: number | null;
  updatedAt: string | null;
}

export interface InterviewPrepAttempt {
  id: string;
  sessionId: string;
  applicationId: string;
  userId: string;
  question: string | null;
  userMessage: string;
  feedback: InterviewPrepAnswerFeedback;
  overallScore: number;
  modelUsed: string | null;
  tokensUsed: number;
  createdAt: string;
}

export interface InterviewPrepSessionSummary {
  id: string;
  title: string;
  applicationId: string;
  updatedAt: string;
  messageCount: number;
  jobTitle: string | null;
  companyName: string | null;
  readiness: InterviewPrepReadinessSummary | null;
}

export interface InterviewPrepSession {
  id: string;
  userId: string;
  applicationId: string;
  title: string;
  prep: InterviewPrepPack;
  contextSnapshot: Record<string, unknown>;
  messages: InterviewPrepChatMessage[];
  readiness: InterviewPrepReadinessSummary | null;
  recentAttempts: InterviewPrepAttempt[];
  createdAt: string;
  updatedAt: string;
}

export interface InterviewPrepFollowUpInput {
  jobTitle: string;
  companyName?: string | null;
  prepPack: InterviewPrepPack;
  messages: InterviewPrepChatMessage[];
  userMessage: string;
}

export interface InterviewPrepFeedbackMetric {
  score: number;
  note: string;
}

export interface InterviewPrepAnswerFeedback {
  summary: string;
  overallScore: number;
  rubric: {
    relevance: InterviewPrepFeedbackMetric;
    specificity: InterviewPrepFeedbackMetric;
    structure: InterviewPrepFeedbackMetric;
    confidence: InterviewPrepFeedbackMetric;
  };
  strengths: string[];
  improvements: string[];
  rewrittenAnswer: string | null;
  nextQuestion: string;
  coachingTip: string;
}

const interviewPrepSchema = z.object({
  summary: z.string(),
  elevatorPitch: z.string(),
  focusAreas: z.array(z.string()).default([]),
  likelyQuestions: z
    .array(
      z.object({
        question: z.string(),
        whyItMatters: z.string(),
        talkingPoints: z.array(z.string()).default([]),
      })
    )
    .default([]),
  storiesToPrepare: z
    .array(
      z.object({
        theme: z.string(),
        prompt: z.string(),
        proofPoints: z.array(z.string()).default([]),
      })
    )
    .default([]),
  questionsToAsk: z.array(z.string()).default([]),
  risksToAddress: z.array(z.string()).default([]),
  checklist: z.array(z.string()).default([]),
});

const followUpFeedbackSchema = z.object({
  summary: z.string(),
  overallScore: z.number().int().min(0).max(100),
  rubric: z.object({
    relevance: z.object({
      score: z.number().int().min(1).max(5),
      note: z.string(),
    }),
    specificity: z.object({
      score: z.number().int().min(1).max(5),
      note: z.string(),
    }),
    structure: z.object({
      score: z.number().int().min(1).max(5),
      note: z.string(),
    }),
    confidence: z.object({
      score: z.number().int().min(1).max(5),
      note: z.string(),
    }),
  }),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  rewrittenAnswer: z.string().default(''),
  nextQuestion: z.string(),
  coachingTip: z.string(),
});

function normalizeStringList(value: string[] | undefined, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeQuestionInputs(
  value: InterviewPrepQuestionInput[] | undefined
): InterviewPrepQuestionInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      question: typeof item?.question === 'string' ? item.question.trim() : '',
      required: item?.required === true,
      answer: typeof item?.answer === 'string' ? item.answer.trim() : null,
    }))
    .filter((item) => item.question.length > 0)
    .slice(0, 6);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function dedupeList(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function clampScore(score: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, score));
}

function normalizeFeedbackMetric(value: {
  score: number;
  note: string;
}): InterviewPrepFeedbackMetric {
  return {
    score: clampScore(Math.round(value.score), 1, 5),
    note: value.note.trim(),
  };
}

function normalizeAnswerFeedback(parsed: {
  summary: string;
  overallScore: number;
  rubric: {
    relevance: { score: number; note: string };
    specificity: { score: number; note: string };
    structure: { score: number; note: string };
    confidence: { score: number; note: string };
  };
  strengths?: string[];
  improvements?: string[];
  rewrittenAnswer?: string;
  nextQuestion: string;
  coachingTip: string;
}): InterviewPrepAnswerFeedback {
  const rewrittenAnswer =
    typeof parsed.rewrittenAnswer === 'string' && parsed.rewrittenAnswer.trim()
      ? parsed.rewrittenAnswer.trim()
      : null;

  return {
    summary: parsed.summary.trim(),
    overallScore: clampScore(Math.round(parsed.overallScore), 0, 100),
    rubric: {
      relevance: normalizeFeedbackMetric(parsed.rubric.relevance),
      specificity: normalizeFeedbackMetric(parsed.rubric.specificity),
      structure: normalizeFeedbackMetric(parsed.rubric.structure),
      confidence: normalizeFeedbackMetric(parsed.rubric.confidence),
    },
    strengths: dedupeList(parsed.strengths || [], 3),
    improvements: dedupeList(parsed.improvements || [], 3),
    rewrittenAnswer,
    nextQuestion: parsed.nextQuestion.trim(),
    coachingTip: parsed.coachingTip.trim(),
  };
}

function buildFollowUpContent(feedback: InterviewPrepAnswerFeedback): string {
  return [
    `Feedback: ${feedback.summary}`,
    `Score: ${feedback.overallScore}/100`,
    `Next question: ${feedback.nextQuestion}`,
    `Coaching tip: ${feedback.coachingTip}`,
  ].join('\n\n');
}

function formatInterviewMoment(interview?: InterviewPrepInterviewInput | null): string | null {
  if (!interview?.scheduledAt) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: interview.timezone || 'UTC',
    }).format(new Date(interview.scheduledAt));
  } catch {
    return new Date(interview.scheduledAt).toISOString();
  }
}

function buildElevatorPitch(input: InterviewPrepInput): string {
  const skills = normalizeStringList(input.candidateSkills, 3);
  const goals = normalizeStringList(input.careerGoals, 2);
  const companyLabel = input.companyName || 'your team';
  const roleLabel = input.jobTitle;

  const introParts = [
    input.candidateHeadline || input.profileSummary || null,
    skills.length > 0 ? `My strongest practical skills are ${skills.join(', ')}.` : null,
    goals.length > 0 ? `I am looking for opportunities that align with ${goals.join(' and ')}.` : null,
    `I am interested in the ${roleLabel} role at ${companyLabel} because it matches the experience and strengths I highlighted in my application.`,
  ].filter(Boolean) as string[];

  return introParts.join(' ');
}

function buildGenericLikelyQuestions(input: InterviewPrepInput): InterviewPrepQuestion[] {
  const jobLabel = input.jobTitle;
  const companyLabel = input.companyName || 'this company';
  const skills = normalizeStringList(input.candidateSkills, 3);
  const skillLine =
    skills.length > 0
      ? `Tie your answer back to ${skills.join(', ')} where it is truthful and relevant.`
      : 'Use one concrete example from your background.';

  return [
    {
      question: 'Tell me about yourself.',
      whyItMatters: 'This is usually the opening test of structure, relevance, and confidence.',
      talkingPoints: [
        `Keep it under one minute and connect your background directly to the ${jobLabel} role.`,
        skillLine,
        `Finish with why ${companyLabel} is the next logical step for you.`,
      ],
    },
    {
      question: `Why do you want this ${jobLabel} role?`,
      whyItMatters: 'Recruiters want to hear role-specific motivation, not a generic job-search answer.',
      talkingPoints: [
        'Reference the work itself, not only the need for a job.',
        'Use details from the job description and your application to explain fit.',
        'Keep the answer practical and realistic.',
      ],
    },
    {
      question: 'Describe a time you handled a challenge, conflict, or setback.',
      whyItMatters: 'Behavioral questions test how you think, communicate, and recover under pressure.',
      talkingPoints: [
        'Use a STAR structure: situation, task, action, result.',
        'Choose an example that matches the responsibilities of the role.',
        'Emphasize what you learned and what changed after your action.',
      ],
    },
    {
      question: 'What would make you successful in your first months here?',
      whyItMatters: 'This checks whether you understand the role and can translate your skills into outcomes.',
      talkingPoints: [
        'Talk about learning the workflow quickly, aligning with expectations, and delivering reliable work.',
        'Mention how you would ask clarifying questions early.',
        'Avoid overpromising results you cannot support.',
      ],
    },
  ];
}

function buildStories(input: InterviewPrepInput): InterviewPrepStory[] {
  const answeredQuestions = normalizeQuestionInputs(input.screeningQuestions).filter(
    (item) => Boolean(item.answer)
  );
  const jobLabel = input.jobTitle;
  const stories: InterviewPrepStory[] = [
    {
      theme: 'Relevant experience',
      prompt: `Prepare one story that shows why your background is relevant to the ${jobLabel} role.`,
      proofPoints: dedupeList(
        [
          input.coverLetter
            ? `Reuse the strongest proof from your cover letter: ${truncateText(input.coverLetter, 110)}`
            : '',
          input.profileSummary
            ? `Use one concrete detail from your profile summary: ${truncateText(input.profileSummary, 110)}`
            : '',
          normalizeStringList(input.candidateSkills, 3).length > 0
            ? `Connect the example to ${normalizeStringList(input.candidateSkills, 3).join(', ')}.`
            : 'Describe the tools, responsibilities, or outcomes involved.',
        ],
        3
      ),
    },
    {
      theme: 'Motivation and fit',
      prompt: `Prepare a short explanation for why you want this role${input.companyName ? ` at ${input.companyName}` : ''} right now.`,
      proofPoints: dedupeList(
        [
          'Explain what interests you about the scope, team, or growth path.',
          input.jobDescription
            ? `Point to one part of the job description that genuinely matches your strengths.`
            : 'Acknowledge when some role details are still unclear and show curiosity.',
          'Keep the answer grounded and specific, not overly flattering.',
        ],
        3
      ),
    },
  ];

  if (answeredQuestions.length > 0) {
    stories.push({
      theme: 'Application follow-up',
      prompt: 'Prepare to expand on the strongest point you already submitted in your application.',
      proofPoints: dedupeList(
        answeredQuestions.slice(0, 3).map((item) => {
          return `Be ready to elaborate on "${item.question}" with a fuller example.`;
        }),
        3
      ),
    });
  }

  return stories.slice(0, 4);
}

function buildChecklist(input: InterviewPrepInput): string[] {
  const interviewMoment = formatInterviewMoment(input.nextInterview);
  const mode = (input.nextInterview?.mode || '').toLowerCase();

  return dedupeList(
    [
      `Re-read the ${input.jobTitle} job description and identify the top three skills or duties you should mention.`,
      'Practice your opening introduction out loud until it feels natural and concise.',
      interviewMoment
        ? `Confirm the interview time and timezone: ${interviewMoment}.`
        : 'Keep a short version of this prep pack ready for an unexpected screening call.',
      mode === 'video'
        ? 'Test your camera, microphone, internet connection, and interview link before the meeting.'
        : '',
      mode === 'phone'
        ? 'Charge your phone, confirm network quality, and keep your notes nearby.'
        : '',
      mode === 'onsite'
        ? 'Plan your route, arrival time, dress, and any documents you may need to bring.'
        : '',
      input.nextInterview?.notes
        ? `Review the recruiter notes and prepare around them: ${truncateText(input.nextInterview.notes, 100)}`
        : '',
      'Prepare two or three thoughtful questions to ask the interviewer at the end.',
    ],
    6
  );
}

function countUserTurns(messages: InterviewPrepChatMessage[]): number {
  return messages.filter((message) => message.role === 'user').length;
}

function pickNextLikelyQuestion(
  prepPack: InterviewPrepPack,
  messages: InterviewPrepChatMessage[]
): InterviewPrepQuestion | null {
  if (!Array.isArray(prepPack.likelyQuestions) || prepPack.likelyQuestions.length === 0) {
    return null;
  }

  const index = countUserTurns(messages) % prepPack.likelyQuestions.length;
  return prepPack.likelyQuestions[index] || prepPack.likelyQuestions[0] || null;
}

function buildRuleBasedInterviewPrep(
  input: InterviewPrepInput,
  unavailableReason: string
): InterviewPrepPack {
  const screeningQuestions = normalizeQuestionInputs(input.screeningQuestions);
  const candidateSkills = normalizeStringList(input.candidateSkills, 4);
  const jobLabel = input.jobTitle;
  const companyLabel = input.companyName || 'the company';
  const focusAreas = dedupeList(
    [
      `Explain clearly why your background fits the ${jobLabel} role.`,
      candidateSkills.length > 0
        ? `Prepare examples that show ${candidateSkills.join(', ')} in action.`
        : 'Prepare two concrete examples that show relevant skills and judgment.',
      screeningQuestions.length > 0
        ? 'Be ready to expand on the answers you already submitted in your application.'
        : 'Expect the recruiter to probe motivation, availability, and role fit because little application evidence is saved.',
      input.nextInterview?.notes
        ? `Review the recruiter notes and prepare direct responses to them.`
        : '',
      input.jobDescription
        ? 'Translate the job description into three priorities you can speak to with evidence.'
        : 'Prepare clarifying questions because the role description is still thin.',
    ],
    5
  );

  const likelyQuestionsFromApplication = screeningQuestions.slice(0, 2).map((item) => ({
    question: item.question,
    whyItMatters: item.answer
      ? 'You already answered this in writing, so the interviewer may test depth, consistency, and examples.'
      : 'This appears to be an important screening topic for the role.',
    talkingPoints: dedupeList(
      [
        item.answer
          ? `Start from your saved answer and add one concrete example: ${truncateText(item.answer, 120)}`
          : `Give a direct answer tied to the ${jobLabel} role.`,
        candidateSkills.length > 0
          ? `Connect your answer to ${candidateSkills.slice(0, 2).join(' and ')} when truthful.`
          : 'Focus on one relevant example instead of general claims.',
        item.required ? 'Treat this as a must-answer point and keep your response unambiguous.' : '',
      ],
      3
    ),
  }));

  const likelyQuestions = dedupeQuestions(
    [...likelyQuestionsFromApplication, ...buildGenericLikelyQuestions(input)],
    5
  );

  const risksToAddress = dedupeList(
    [
      !input.coverLetter
        ? 'Your application has limited role-specific motivation on file, so expect questions about why you want this job.'
        : '',
      !input.hasResume
        ? 'If no resume is attached, recruiters may rely heavily on verbal evidence of experience and skills.'
        : '',
      screeningQuestions.filter((item) => Boolean(item.answer)).length === 0
        ? 'There are no saved screening answers, so be ready for broader first-round screening questions.'
        : '',
      !input.jobDescription || input.jobDescription.trim().length < 120
        ? 'The job description is brief, so ask clarifying questions rather than assuming scope or responsibilities.'
        : '',
    ],
    4
  );

  return {
    summary: `${unavailableReason} Focus on explaining why your background fits the ${jobLabel} role at ${companyLabel}, using concrete examples from your application and being ready to clarify any thin evidence.`,
    elevatorPitch: buildElevatorPitch(input),
    focusAreas,
    likelyQuestions,
    storiesToPrepare: buildStories(input),
    questionsToAsk: dedupeList(
      [
        'What would success look like in the first 30 to 90 days?',
        'Which skills or responsibilities matter most for this role right now?',
        `How does this role work with the rest of the team at ${companyLabel}?`,
        'What are the next steps in the interview process?',
      ],
      5
    ),
    risksToAddress,
    checklist: buildChecklist(input),
    modelUsed: 'rule_based_v1',
    tokensUsed: 0,
  };
}

function dedupeQuestions(
  questions: Array<{
    question: string;
    whyItMatters: string;
    talkingPoints?: string[];
  }>,
  limit: number
): InterviewPrepQuestion[] {
  const seen = new Set<string>();
  const result: InterviewPrepQuestion[] = [];

  for (const item of questions) {
    const question = item.question.trim();
    if (!question) {
      continue;
    }

    const key = question.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      question,
      whyItMatters: item.whyItMatters.trim(),
      talkingPoints: dedupeList(item.talkingPoints || [], 3),
    });

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function normalizeAiPack(
  parsed: {
    summary: string;
    elevatorPitch: string;
    focusAreas?: string[];
    likelyQuestions?: Array<{
      question: string;
      whyItMatters: string;
      talkingPoints?: string[];
    }>;
    storiesToPrepare?: Array<{
      theme: string;
      prompt: string;
      proofPoints?: string[];
    }>;
    questionsToAsk?: string[];
    risksToAddress?: string[];
    checklist?: string[];
  },
  model: string,
  tokensUsed: number
) {
  return {
    summary: parsed.summary.trim(),
    elevatorPitch: parsed.elevatorPitch.trim(),
    focusAreas: dedupeList(parsed.focusAreas || [], 5),
    likelyQuestions: dedupeQuestions(parsed.likelyQuestions || [], 5),
    storiesToPrepare: (parsed.storiesToPrepare || [])
      .map((item) => ({
        theme: item.theme.trim(),
        prompt: item.prompt.trim(),
        proofPoints: dedupeList(item.proofPoints || [], 3),
      }))
      .filter((item) => item.theme && item.prompt)
      .slice(0, 4),
    questionsToAsk: dedupeList(parsed.questionsToAsk || [], 5),
    risksToAddress: dedupeList(parsed.risksToAddress || [], 4),
    checklist: dedupeList(parsed.checklist || [], 6),
    modelUsed: model,
    tokensUsed,
  } satisfies InterviewPrepPack;
}

async function performAiInterviewPrep(input: InterviewPrepInput): Promise<InterviewPrepPack> {
  const { parsed, model, tokensUsed } = await callAiJson({
    schema: interviewPrepSchema,
    temperature: 0.3,
    timeoutMs: 15000,
    messages: [
      {
        role: 'system',
        content: buildInterviewPrepSystemPrompt(),
      },
      {
        role: 'user',
        content: buildInterviewPrepUserPrompt(input),
      },
    ],
  });

  return normalizeAiPack(parsed, model, tokensUsed);
}

export async function generateInterviewPrepPack(
  input: InterviewPrepInput
): Promise<InterviewPrepPack> {
  const fallbackReason =
    'AI interview prep unavailable. Showing a deterministic prep pack only.';

  if (isAiConfigured()) {
    try {
      return await performAiInterviewPrep(input);
    } catch (error) {
      console.error('Interview prep AI error:', error);
      return buildRuleBasedInterviewPrep(input, fallbackReason);
    }
  }

  return buildRuleBasedInterviewPrep(input, fallbackReason);
}

export function createInitialInterviewPrepMessage(
  prepPack: InterviewPrepPack
): InterviewPrepChatMessage {
  const openingQuestion =
    prepPack.likelyQuestions[0]?.question || 'Tell me about yourself.';
  const openingTip =
    prepPack.focusAreas[0] || 'Keep your answer concise and use one concrete example.';

  return {
    role: 'assistant',
    content: `Prep pack ready. Start with this mock question: ${openingQuestion}\n\nCoaching tip: ${openingTip}`,
    timestamp: new Date().toISOString(),
  };
}

function buildRuleBasedFollowUpFeedback(
  input: InterviewPrepFollowUpInput
): InterviewPrepAnswerFeedback {
  const trimmedMessage = input.userMessage.trim();
  const nextQuestion =
    pickNextLikelyQuestion(input.prepPack, [
      ...input.messages,
      {
        role: 'user',
        content: trimmedMessage,
        timestamp: new Date().toISOString(),
      },
    ])?.question ||
    'What would success look like for you in this role?';
  const coachingTip =
    input.prepPack.focusAreas[
      countUserTurns(input.messages) % Math.max(input.prepPack.focusAreas.length, 1)
    ] || 'Use one concrete example and explain your result clearly.';

  const hasResultLanguage = /\bresult\b|\bimproved\b|\bincreased\b|\breduced\b|\bsaved\b|\bgrew\b/i.test(
    trimmedMessage
  );
  const hasStructureLanguage = /\bfirst\b|\bthen\b|\bafter\b|\bbecause\b|\bso that\b/i.test(
    trimmedMessage
  );
  const hasConfidencePenalty = /\bmaybe\b|\bi think\b|\bkind of\b|\bsort of\b|\btry\b/i.test(
    trimmedMessage
  );
  const hasSpecificEvidence =
    /\b\d+\b/.test(trimmedMessage) ||
    /\bfor example\b|\bfor instance\b|\bspecifically\b/i.test(trimmedMessage);

  let relevanceScore = 3;
  let specificityScore = 3;
  let structureScore = 3;
  let confidenceScore = 3;

  if (trimmedMessage.length < 60) {
    relevanceScore -= 1;
    specificityScore -= 1;
    structureScore -= 1;
  } else if (trimmedMessage.length > 150) {
    relevanceScore += 1;
  }

  if (hasSpecificEvidence) {
    specificityScore += 1;
  }

  if (hasResultLanguage) {
    specificityScore += 1;
    relevanceScore += 1;
  }

  if (hasStructureLanguage || trimmedMessage.split(/[.!?]/).length > 2) {
    structureScore += 1;
  }

  if (hasConfidencePenalty) {
    confidenceScore -= 1;
  } else {
    confidenceScore += 1;
  }

  relevanceScore = clampScore(relevanceScore, 1, 5);
  specificityScore = clampScore(specificityScore, 1, 5);
  structureScore = clampScore(structureScore, 1, 5);
  confidenceScore = clampScore(confidenceScore, 1, 5);

  const overallScore = clampScore(
    Math.round(
      ((relevanceScore + specificityScore + structureScore + confidenceScore) / 20) * 100
    ),
    0,
    100
  );

  let summary =
    'Add more precision about your exact actions and the outcome you created.';

  if (trimmedMessage.length < 80) {
    summary =
      'Your answer is still short. Add the situation, what you did personally, and what changed after your action.';
  } else if (hasConfidencePenalty) {
    summary =
      'The content is usable, but the wording sounds hesitant. State your contribution more directly and own the result.';
  } else if (hasResultLanguage && hasSpecificEvidence) {
    summary =
      'This is moving in the right direction. The answer shows action and impact, but it still needs a tighter structure.';
  }

  const strengths = dedupeList(
    [
      hasResultLanguage ? 'You referenced an outcome instead of stopping at the task.' : '',
      hasSpecificEvidence ? 'You included concrete evidence rather than only broad claims.' : '',
      trimmedMessage.length >= 80 ? 'You gave enough detail to coach into a stronger answer.' : '',
      !hasConfidencePenalty ? 'Your tone is reasonably direct.' : '',
    ],
    3
  );

  const improvements = dedupeList(
    [
      trimmedMessage.length < 80
        ? 'Extend the answer with the situation, your action, and the final result.'
        : '',
      !hasSpecificEvidence ? 'Add one concrete fact, example, or measurable outcome.' : '',
      !hasStructureLanguage
        ? 'Use a cleaner STAR sequence so the interviewer can follow your story quickly.'
        : '',
      hasConfidencePenalty ? 'Remove hesitant phrases and use direct language.' : '',
    ],
    3
  );

  const rewrittenAnswer = trimmedMessage
    ? [
        'Stronger version:',
        'In that situation, I took ownership of the problem, focused on the actions I personally handled, and followed through until there was a clear result.',
        hasSpecificEvidence || hasResultLanguage
          ? `I would present it like this: "${truncateText(trimmedMessage, 180)}" and then add the final impact in one clear sentence.`
          : 'I would present it with one clear example, the steps I took, and the outcome it created for the team or customer.',
      ].join(' ')
    : null;

  return {
    summary,
    overallScore,
    rubric: {
      relevance: {
        score: relevanceScore,
        note:
          relevanceScore >= 4
            ? 'The answer stays reasonably close to the role and question.'
            : 'Make the answer more directly tied to the interviewer’s question.',
      },
      specificity: {
        score: specificityScore,
        note:
          specificityScore >= 4
            ? 'There is some concrete evidence or outcome to build from.'
            : 'Add a concrete example, fact, or result so the answer feels real.',
      },
      structure: {
        score: structureScore,
        note:
          structureScore >= 4
            ? 'The answer has a usable flow.'
            : 'Use a clearer beginning, action, and result sequence.',
      },
      confidence: {
        score: confidenceScore,
        note:
          confidenceScore >= 4
            ? 'The tone is direct enough for interview delivery.'
            : 'Reduce hedging and describe your actions with more ownership.',
      },
    },
    strengths,
    improvements,
    rewrittenAnswer,
    nextQuestion,
    coachingTip,
  };
}

export async function generateInterviewPrepFollowUp(
  input: InterviewPrepFollowUpInput
): Promise<{
  message: InterviewPrepChatMessage;
  feedback: InterviewPrepAnswerFeedback;
  modelUsed: string;
  tokensUsed: number;
}> {
  const fallbackFeedback = buildRuleBasedFollowUpFeedback(input);
  const fallbackContent = buildFollowUpContent(fallbackFeedback);

  if (isAiConfigured()) {
    try {
      const { parsed, model, tokensUsed } = await callAiJson({
        schema: followUpFeedbackSchema,
        temperature: 0.4,
        maxTokens: 500,
        timeoutMs: 15000,
        messages: [
          {
            role: 'system',
            content: buildInterviewPrepFollowUpSystemPrompt({
              jobTitle: input.jobTitle,
              companyName: input.companyName || null,
              prepSummary: input.prepPack.summary,
              focusAreas: input.prepPack.focusAreas || [],
              likelyQuestions: (input.prepPack.likelyQuestions || []).map(
                (item) => item.question
              ),
            }),
          },
          ...input.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: 'user',
            content: input.userMessage.trim(),
          },
        ],
      });

      const feedback = normalizeAnswerFeedback(parsed);

      return {
        message: {
          role: 'assistant',
          content: buildFollowUpContent(feedback) || fallbackContent,
          timestamp: new Date().toISOString(),
          feedback,
        },
        feedback,
        modelUsed: model,
        tokensUsed,
      };
    } catch (error) {
      console.error('Interview prep follow-up AI error:', error);
    }
  }

  return {
    message: {
      role: 'assistant',
      content: fallbackContent,
      timestamp: new Date().toISOString(),
      feedback: fallbackFeedback,
    },
    feedback: fallbackFeedback,
    modelUsed: 'rule_based_v1',
    tokensUsed: 0,
  };
}
