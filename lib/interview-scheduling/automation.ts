export interface JobInterviewAutomationSettings {
  autoSendRescheduleNotice: boolean;
  autoSendCancellationNotice: boolean;
  autoSendCompletionFollowup: boolean;
  autoSendNoShowFollowup: boolean;
  completionFollowupMessage: string | null;
  noShowFollowupMessage: string | null;
}

export interface InterviewOutcomeMessage {
  subject: string;
  emailIntro: string;
  detail: string;
  whatsappText: string;
}

export const DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS: JobInterviewAutomationSettings = {
  autoSendRescheduleNotice: true,
  autoSendCancellationNotice: true,
  autoSendCompletionFollowup: false,
  autoSendNoShowFollowup: true,
  completionFollowupMessage: null,
  noShowFollowupMessage: null,
};

function sanitizeMessage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeInterviewAutomationSettings(
  value: Record<string, unknown> | null | undefined
): JobInterviewAutomationSettings {
  const record = value || {};

  return {
    autoSendRescheduleNotice:
      typeof record.autoSendRescheduleNotice === 'boolean'
        ? record.autoSendRescheduleNotice
        : DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS.autoSendRescheduleNotice,
    autoSendCancellationNotice:
      typeof record.autoSendCancellationNotice === 'boolean'
        ? record.autoSendCancellationNotice
        : DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS.autoSendCancellationNotice,
    autoSendCompletionFollowup:
      typeof record.autoSendCompletionFollowup === 'boolean'
        ? record.autoSendCompletionFollowup
        : DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS.autoSendCompletionFollowup,
    autoSendNoShowFollowup:
      typeof record.autoSendNoShowFollowup === 'boolean'
        ? record.autoSendNoShowFollowup
        : DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS.autoSendNoShowFollowup,
    completionFollowupMessage:
      sanitizeMessage(record.completionFollowupMessage) ??
      DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS.completionFollowupMessage,
    noShowFollowupMessage:
      sanitizeMessage(record.noShowFollowupMessage) ??
      DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS.noShowFollowupMessage,
  };
}

export function buildInterviewOutcomeMessage(params: {
  type: 'completion' | 'no_show';
  jobTitle: string;
  companyName: string;
  interviewTime: string;
  customMessage?: string | null;
}): InterviewOutcomeMessage {
  const jobTitle = params.jobTitle || 'your application';
  const companyName = params.companyName || 'the recruiter';
  const interviewTime = params.interviewTime || 'the scheduled interview';
  const customMessage = sanitizeMessage(params.customMessage);

  if (params.type === 'completion') {
    const detail =
      customMessage ||
      `Thank you for attending your interview for ${jobTitle}. ${companyName} is reviewing the conversation and will share next steps soon.`;

    return {
      subject: `Interview follow-up: ${jobTitle}`,
      emailIntro: `Your interview for ${jobTitle} at ${companyName} has been marked as completed.`,
      detail,
      whatsappText: [
        `Interview follow-up: ${jobTitle}`,
        `Company: ${companyName}`,
        `Interview: ${interviewTime}`,
        detail,
      ].join('\n'),
    };
  }

  const detail =
    customMessage ||
    `We marked your interview for ${jobTitle} as missed. If you had a valid reason, reply so the recruiter can decide whether to offer another slot.`;

  return {
    subject: `Interview follow-up: ${jobTitle}`,
    emailIntro: `Your interview for ${jobTitle} at ${companyName} was marked as a no-show.`,
    detail,
    whatsappText: [
      `Interview follow-up: ${jobTitle}`,
      `Company: ${companyName}`,
      `Interview: ${interviewTime}`,
      detail,
    ].join('\n'),
  };
}
