export type ScreeningState =
  | 'idle'
  | 'awaiting_language'
  | 'awaiting_job_reference'
  | 'awaiting_consent'
  | 'awaiting_question'
  | 'completed'
  | 'quota_blocked'
  | 'cancelled';

export type SupportedLanguage = 'en' | 'fr';

export type QuestionType = 'yesno' | 'number' | 'text' | 'choice';

export interface ScreeningQuestion {
  id: string;
  type: QuestionType;
  required: boolean;
  mustHave: boolean;
  weight: number;
  promptEn: string;
  promptFr: string;
  options?: string[];
}

export interface AnswerEvaluation {
  accepted: boolean;
  normalizedAnswer: unknown;
  scoreDelta: number;
  mustHavePassed: boolean | null;
  validationMessageEn?: string;
  validationMessageFr?: string;
}

export interface ScoringResult {
  mustHavePassed: boolean;
  weightedScore: number;
  resultLabel: 'qualified' | 'review' | 'reject';
  mustHaveFailReasons: string[];
  scoreBreakdown: Record<string, number>;
}

export interface ParsedIntent {
  isApplyIntent: boolean;
  jobId: string | null;
  entrySource: 'reply' | 'apply_command' | 'shortlink' | 'unknown';
}

export const TERMINAL_STATES: ReadonlySet<ScreeningState> = new Set([
  'completed',
  'quota_blocked',
  'cancelled',
]);

const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function parseLanguageSelection(input: string): SupportedLanguage | null {
  const value = normalizeText(input);
  if (value === '1' || value === 'en' || value === 'english') {
    return 'en';
  }
  if (
    value === '2' ||
    value === 'fr' ||
    value === 'french' ||
    value === 'francais' ||
    value === 'français'
  ) {
    return 'fr';
  }
  return null;
}

export function parseYesNo(input: string): boolean | null {
  const value = normalizeText(input);
  if (['yes', 'y', 'oui', 'o', '1'].includes(value)) {
    return true;
  }
  if (['no', 'n', 'non', '0'].includes(value)) {
    return false;
  }
  return null;
}

function parseJobIdFromText(input: string): string | null {
  const match = input.match(UUID_REGEX);
  return match ? match[0].toLowerCase() : null;
}

export function parseApplyIntent(
  inputText: string,
  referralUrl?: string | null,
  hasContextReply = false
): ParsedIntent {
  const value = normalizeText(inputText);
  const jobIdFromText = parseJobIdFromText(inputText);
  const jobIdFromReferral = referralUrl ? parseJobIdFromText(referralUrl) : null;
  const jobId = jobIdFromText ?? jobIdFromReferral;

  const isApplyKeyword =
    value.startsWith('apply') ||
    value.startsWith('postuler') ||
    value.includes('/apply') ||
    value.includes('/jobs/');

  if (hasContextReply && value === 'apply') {
    return {
      isApplyIntent: true,
      jobId,
      entrySource: 'reply',
    };
  }

  if (jobId && (isApplyKeyword || value.includes(jobId))) {
    return {
      isApplyIntent: true,
      jobId,
      entrySource: jobIdFromReferral ? 'shortlink' : 'apply_command',
    };
  }

  if (isApplyKeyword) {
    return {
      isApplyIntent: true,
      jobId,
      entrySource: 'apply_command',
    };
  }

  return {
    isApplyIntent: false,
    jobId: null,
    entrySource: 'unknown',
  };
}

export function isCancelIntent(inputText: string): boolean {
  const value = normalizeText(inputText);
  return ['stop', 'unsubscribe', 'cancel', 'quit', 'exit', 'non'].includes(value);
}

export function buildHybridQuestionCatalog(_jobTitle: string): ScreeningQuestion[] {
  return [
    {
      id: 'availability_full_time',
      type: 'yesno',
      required: true,
      mustHave: true,
      weight: 0,
      promptEn: 'Are you available to work full-time for this role? (yes/no)',
      promptFr: 'Etes-vous disponible a temps plein pour ce poste ? (oui/non)',
    },
    {
      id: 'work_authorization',
      type: 'yesno',
      required: true,
      mustHave: true,
      weight: 0,
      promptEn: 'Are you legally authorized to work in Cameroon? (yes/no)',
      promptFr: 'Avez-vous l autorisation legale de travailler au Cameroun ? (oui/non)',
    },
    {
      id: 'years_experience',
      type: 'number',
      required: true,
      mustHave: false,
      weight: 35,
      promptEn: 'How many years of relevant experience do you have?',
      promptFr: 'Combien d annees d experience pertinente avez-vous ?',
    },
    {
      id: 'role_confidence',
      type: 'choice',
      required: true,
      mustHave: false,
      weight: 25,
      promptEn: 'How would you rate your confidence for this role? (beginner/intermediate/advanced)',
      promptFr: 'Comment evaluez-vous votre niveau pour ce poste ? (debutant/intermediaire/avance)',
      options: ['beginner', 'intermediate', 'advanced'],
    },
    {
      id: 'skills_summary',
      type: 'text',
      required: true,
      mustHave: false,
      weight: 20,
      promptEn: 'List your most relevant skills for this job in one short message.',
      promptFr: 'Listez vos competences les plus pertinentes pour ce poste en un court message.',
    },
    {
      id: 'communication_level',
      type: 'choice',
      required: true,
      mustHave: false,
      weight: 20,
      promptEn: 'Communication level for work context? (basic/good/excellent)',
      promptFr: 'Niveau de communication en contexte pro ? (basic/good/excellent)',
      options: ['basic', 'good', 'excellent'],
    },
  ];
}

function scoreYearsOfExperience(value: number): number {
  if (value >= 5) return 35;
  if (value >= 3) return 28;
  if (value >= 1) return 18;
  return 8;
}

function scoreRoleConfidence(value: string): number {
  if (value === 'advanced' || value === 'avance') return 25;
  if (value === 'intermediate' || value === 'intermediaire') return 18;
  return 8;
}

function scoreCommunication(value: string): number {
  if (value === 'excellent') return 20;
  if (value === 'good' || value === 'bon') return 14;
  return 8;
}

export function evaluateAnswer(
  question: ScreeningQuestion,
  rawAnswer: string
): AnswerEvaluation {
  const trimmed = rawAnswer.trim();
  const lower = normalizeText(rawAnswer);

  if (!trimmed && question.required) {
    return {
      accepted: false,
      normalizedAnswer: null,
      scoreDelta: 0,
      mustHavePassed: question.mustHave ? false : null,
      validationMessageEn: 'Please provide an answer to continue.',
      validationMessageFr: 'Veuillez fournir une reponse pour continuer.',
    };
  }

  if (question.type === 'yesno') {
    const yesNo = parseYesNo(trimmed);
    if (yesNo === null) {
      return {
        accepted: false,
        normalizedAnswer: null,
        scoreDelta: 0,
        mustHavePassed: question.mustHave ? false : null,
        validationMessageEn: 'Please answer with yes or no.',
        validationMessageFr: 'Veuillez repondre par oui ou non.',
      };
    }
    return {
      accepted: true,
      normalizedAnswer: yesNo,
      scoreDelta: 0,
      mustHavePassed: question.mustHave ? yesNo : null,
    };
  }

  if (question.type === 'number') {
    const parsed = Number(trimmed);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 60) {
      return {
        accepted: false,
        normalizedAnswer: null,
        scoreDelta: 0,
        mustHavePassed: null,
        validationMessageEn: 'Please send a valid number (for example: 3).',
        validationMessageFr: 'Veuillez envoyer un nombre valide (exemple : 3).',
      };
    }
    return {
      accepted: true,
      normalizedAnswer: parsed,
      scoreDelta: scoreYearsOfExperience(parsed),
      mustHavePassed: null,
    };
  }

  if (question.type === 'choice') {
    if (!question.options || question.options.length === 0) {
      return {
        accepted: true,
        normalizedAnswer: lower,
        scoreDelta: 0,
        mustHavePassed: null,
      };
    }

    const matched = question.options.find((option) => option === lower);
    if (!matched) {
      return {
        accepted: false,
        normalizedAnswer: null,
        scoreDelta: 0,
        mustHavePassed: null,
        validationMessageEn: `Please choose one of: ${question.options.join('/')}.`,
        validationMessageFr: `Veuillez choisir une option parmi : ${question.options.join('/')}.`,
      };
    }

    const scoreDelta =
      question.id === 'role_confidence'
        ? scoreRoleConfidence(matched)
        : question.id === 'communication_level'
          ? scoreCommunication(matched)
          : 0;

    return {
      accepted: true,
      normalizedAnswer: matched,
      scoreDelta,
      mustHavePassed: null,
    };
  }

  const scoreDelta = trimmed.length >= 40 ? 20 : trimmed.length >= 15 ? 12 : 6;
  return {
    accepted: true,
    normalizedAnswer: trimmed,
    scoreDelta,
    mustHavePassed: null,
  };
}

export function computeFinalScoring(
  questions: ScreeningQuestion[],
  evaluations: Array<{ questionId: string; evaluation: AnswerEvaluation }>
): ScoringResult {
  const evalMap = new Map<string, AnswerEvaluation>(
    evaluations.map((item) => [item.questionId, item.evaluation])
  );

  let weightedScore = 0;
  let mustHavePassed = true;
  const mustHaveFailReasons: string[] = [];
  const scoreBreakdown: Record<string, number> = {};

  for (const question of questions) {
    const evaluation = evalMap.get(question.id);
    if (!evaluation) {
      if (question.mustHave) {
        mustHavePassed = false;
        mustHaveFailReasons.push(question.id);
      }
      scoreBreakdown[question.id] = 0;
      continue;
    }

    if (question.mustHave) {
      if (evaluation.mustHavePassed !== true) {
        mustHavePassed = false;
        mustHaveFailReasons.push(question.id);
      }
      scoreBreakdown[question.id] = 0;
      continue;
    }

    if (question.weight <= 0) {
      scoreBreakdown[question.id] = 0;
      continue;
    }

    weightedScore += evaluation.scoreDelta;
    scoreBreakdown[question.id] = evaluation.scoreDelta;
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(weightedScore)));
  const resultLabel: 'qualified' | 'review' | 'reject' = !mustHavePassed
    ? 'reject'
    : boundedScore >= 70
      ? 'qualified'
      : 'review';

  return {
    mustHavePassed,
    weightedScore: boundedScore,
    resultLabel,
    mustHaveFailReasons,
    scoreBreakdown,
  };
}
