/**
 * High-level WhatsApp messaging helpers used by the rest of the app.
 *
 * These are thin wrappers around the lower-level Meta API client in
 * `lib/whatsapp.ts` that also persist every outbound message to the DB.
 */

import {
  sendText,
  sendTemplate,
  sendQuickReplyButtons,
  type WAQuickReplyButton,
  type WATemplateComponent,
} from '@/lib/whatsapp';
import { saveOutboundMessage } from '@/lib/whatsapp-db';

// ─── Send a plain-text message ────────────────────────────────────────────────

export async function sendWhatsappMessage(
  to: string,
  message: string,
  userId?: string | null
): Promise<void> {
  const result = await sendText(to, message);
  const waMessageId = result.messages?.[0]?.id ?? null;

  if (waMessageId) {
    await saveOutboundMessage({
      to,
      message,
      waMessageId,
      messageType: 'text',
      userId: userId ?? null,
    });
  }
}

// ─── Send an approved template message ───────────────────────────────────────

export async function sendWhatsappTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  components: WATemplateComponent[] = [],
  userId?: string | null
): Promise<void> {
  const result = await sendTemplate(to, templateName, languageCode, components);
  const waMessageId = result.messages?.[0]?.id ?? null;

  if (waMessageId) {
    await saveOutboundMessage({
      to,
      message: `[template: ${templateName}]`,
      waMessageId,
      messageType: 'template',
      templateName,
      userId: userId ?? null,
    });
  }
}

// â”€â”€â”€ Send quick reply buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function sendWhatsappQuickReplies(opts: {
  to: string;
  body: string;
  buttons: WAQuickReplyButton[];
  footer?: string;
  userId?: string | null;
}): Promise<void> {
  const result = await sendQuickReplyButtons(
    opts.to,
    opts.body,
    opts.buttons,
    opts.footer
  );
  const waMessageId = result.messages?.[0]?.id ?? null;

  if (waMessageId) {
    await saveOutboundMessage({
      to: opts.to,
      message: `[interactive_buttons] ${opts.body}`,
      waMessageId,
      messageType: 'interactive',
      userId: opts.userId ?? null,
    });
  }
}

// ─── Common templates ─────────────────────────────────────────────────────────

/**
 * Notify a job seeker that a new job matching their profile has been found.
 * Requires a Meta-approved template named `job_alert_v1`.
 *
 * Template body (example):
 *   "Hi {{1}}, a new {{2}} role at {{3}} is available in {{4}}. Apply here: {{5}}"
 */
export async function sendJobAlertWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  location: string;
  jobUrl: string;
  userId?: string | null;
}): Promise<void> {
  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.seekerName },
        { type: 'text', text: opts.jobTitle },
        { type: 'text', text: opts.company },
        { type: 'text', text: opts.location },
        { type: 'text', text: opts.jobUrl },
      ],
    },
  ];
  await sendWhatsappTemplate(
    opts.to,
    'job_alert_v1',
    'en',
    components,
    opts.userId
  );
}

/**
 * Notify a job seeker about an upcoming interview.
 * Requires a Meta-approved template named `interview_reminder_v1`.
 *
 * Template body (example):
 *   "Hi {{1}}, your interview for {{2}} at {{3}} is scheduled for {{4}}. Good luck!"
 */
export async function sendInterviewReminderWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  interviewTime: string;
  userId?: string | null;
}): Promise<void> {
  const templateName = process.env.WA_INTERVIEW_REMINDER_TEMPLATE || 'interview_reminder_v1';
  const languageCode = process.env.WA_INTERVIEW_REMINDER_TEMPLATE_LANG || 'en';
  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.seekerName },
        { type: 'text', text: opts.jobTitle },
        { type: 'text', text: opts.company },
        { type: 'text', text: opts.interviewTime },
      ],
    },
  ];
  await sendWhatsappTemplate(
    opts.to,
    templateName,
    languageCode,
    components,
    opts.userId
  );
}

export async function sendInterviewScheduledWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  interviewTime: string;
  modeLabel: string;
  meetingUrl?: string | null;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  const templateName = process.env.WA_INTERVIEW_SCHEDULED_TEMPLATE || 'interview_scheduled_v1';
  const languageCode = process.env.WA_INTERVIEW_SCHEDULED_TEMPLATE_LANG || 'en';
  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.seekerName },
        { type: 'text', text: opts.jobTitle },
        { type: 'text', text: opts.company },
        { type: 'text', text: opts.interviewTime },
      ],
    },
  ];

  try {
    await sendWhatsappTemplate(
      opts.to,
      templateName,
      languageCode,
      components,
      opts.userId
    );
    return 'template';
  } catch (templateError) {
    const fallback = [
      `Interview scheduled: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      `Mode: ${opts.modeLabel}`,
      `Time: ${opts.interviewTime}`,
      opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await sendWhatsappMessage(opts.to, fallback, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Interview scheduled send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}

export async function sendInterviewReminderAlertWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  interviewTime: string;
  modeLabel: string;
  meetingUrl?: string | null;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  try {
    await sendInterviewReminderWhatsapp({
      to: opts.to,
      seekerName: opts.seekerName,
      jobTitle: opts.jobTitle,
      company: opts.company,
      interviewTime: opts.interviewTime,
      userId: opts.userId,
    });
    return 'template';
  } catch (templateError) {
    const fallback = [
      `Interview reminder: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      `Mode: ${opts.modeLabel}`,
      `Time: ${opts.interviewTime}`,
      opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await sendWhatsappMessage(opts.to, fallback, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Interview reminder send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}

export async function sendInterviewRescheduledWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  interviewTime: string;
  modeLabel: string;
  meetingUrl?: string | null;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  const templateName =
    process.env.WA_INTERVIEW_RESCHEDULED_TEMPLATE || 'interview_rescheduled_v1';
  const languageCode = process.env.WA_INTERVIEW_RESCHEDULED_TEMPLATE_LANG || 'en';
  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.seekerName },
        { type: 'text', text: opts.jobTitle },
        { type: 'text', text: opts.company },
        { type: 'text', text: opts.interviewTime },
      ],
    },
  ];

  try {
    await sendWhatsappTemplate(
      opts.to,
      templateName,
      languageCode,
      components,
      opts.userId
    );
    return 'template';
  } catch (templateError) {
    const fallback = [
      `Interview rescheduled: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      `Mode: ${opts.modeLabel}`,
      `New time: ${opts.interviewTime}`,
      opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
      'Please confirm whether you can still attend.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await sendWhatsappMessage(opts.to, fallback, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Interview reschedule send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}

export async function sendInterviewCancelledWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  interviewTime: string;
  modeLabel: string;
  meetingUrl?: string | null;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  const templateName =
    process.env.WA_INTERVIEW_CANCELLED_TEMPLATE || 'interview_cancelled_v1';
  const languageCode = process.env.WA_INTERVIEW_CANCELLED_TEMPLATE_LANG || 'en';
  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.seekerName },
        { type: 'text', text: opts.jobTitle },
        { type: 'text', text: opts.company },
        { type: 'text', text: opts.interviewTime },
      ],
    },
  ];

  try {
    await sendWhatsappTemplate(
      opts.to,
      templateName,
      languageCode,
      components,
      opts.userId
    );
    return 'template';
  } catch (templateError) {
    const fallback = [
      `Interview cancelled: ${opts.jobTitle}`,
      `Company: ${opts.company}`,
      `Mode: ${opts.modeLabel}`,
      `Cancelled slot: ${opts.interviewTime}`,
      opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
      'The recruiter will contact you again if they want to reschedule.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await sendWhatsappMessage(opts.to, fallback, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Interview cancellation send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}

export async function sendInterviewOutcomeFollowupWhatsapp(opts: {
  to: string;
  text: string;
  userId?: string | null;
}): Promise<'text'> {
  await sendWhatsappMessage(opts.to, opts.text, opts.userId);
  return 'text';
}

export async function sendInterviewSelfScheduleInviteWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  inviteUrl: string;
  modeLabel: string;
  userId?: string | null;
}): Promise<'text'> {
  const text = [
    `Interview slots available: ${opts.jobTitle}`,
    `Company: ${opts.company}`,
    `Mode: ${opts.modeLabel}`,
    `Choose your time: ${opts.inviteUrl}`,
  ].join('\n');

  await sendWhatsappMessage(opts.to, text, opts.userId);
  return 'text';
}

function buildApplicationStatusFallbackText(opts: {
  jobTitle: string;
  company: string;
  stageLabel: string;
  stageType: string;
  applicationsUrl: string;
}) {
  const jobTitle = opts.jobTitle || 'your application';
  const company = opts.company || 'the hiring team';

  switch (opts.stageType) {
    case 'interview':
      return [
        `Update on ${jobTitle}: you have moved to the interview stage.`,
        `Company: ${company}`,
        'The hiring team will share interview details soon.',
        `Track your status: ${opts.applicationsUrl}`,
      ].join('\n');
    case 'offer':
      return [
        `Good news for ${jobTitle}: you have moved to the offer stage.`,
        `Company: ${company}`,
        `Track your status: ${opts.applicationsUrl}`,
      ].join('\n');
    case 'hire':
      return [
        `Congratulations. You have been selected for ${jobTitle}.`,
        `Company: ${company}`,
        `Track your status: ${opts.applicationsUrl}`,
      ].join('\n');
    case 'rejected':
      return [
        `Update on ${jobTitle}: the hiring team is not moving forward at this time.`,
        `Company: ${company}`,
        `Track your status: ${opts.applicationsUrl}`,
      ].join('\n');
    case 'review':
    default:
      return [
        `Update on ${jobTitle}: your application moved to ${opts.stageLabel}.`,
        `Company: ${company}`,
        `Track your status: ${opts.applicationsUrl}`,
      ].join('\n');
  }
}

export async function sendApplicationStatusAlertWhatsapp(opts: {
  to: string;
  seekerName: string;
  jobTitle: string;
  company: string;
  stageLabel: string;
  stageType: string;
  applicationsUrl: string;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  const templateName =
    process.env.WA_APPLICATION_STATUS_TEMPLATE || 'application_status_update_v1';
  const languageCode = process.env.WA_APPLICATION_STATUS_TEMPLATE_LANG || 'en';
  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.seekerName || 'there' },
        { type: 'text', text: opts.jobTitle || 'your application' },
        { type: 'text', text: opts.company || 'Joblinca' },
        { type: 'text', text: opts.stageLabel || 'under review' },
        { type: 'text', text: opts.applicationsUrl },
      ],
    },
  ];

  try {
    await sendWhatsappTemplate(
      opts.to,
      templateName,
      languageCode,
      components,
      opts.userId
    );
    return 'template';
  } catch (templateError) {
    const fallback = buildApplicationStatusFallbackText({
      jobTitle: opts.jobTitle,
      company: opts.company,
      stageLabel: opts.stageLabel,
      stageType: opts.stageType,
      applicationsUrl: opts.applicationsUrl,
    });

    try {
      await sendWhatsappMessage(opts.to, fallback, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Application status send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}

export async function sendMatchedJobsDigestWhatsapp(opts: {
  to: string;
  subscribed: boolean;
  roleKeywords: string;
  location: string;
  jobsCount: number;
  fallbackText: string;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
  const jobsUrl = `${appUrl}/jobs`;
  const templateName = process.env.WA_MATCHED_JOBS_TEMPLATE || 'matched_jobs_digest_v1';
  const languageCode = process.env.WA_MATCHED_JOBS_TEMPLATE_LANG || 'en';

  const components: WATemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: opts.subscribed ? 'Premium' : 'Free' },
        { type: 'text', text: opts.roleKeywords.slice(0, 120) || 'jobs' },
        { type: 'text', text: opts.location.slice(0, 80) || 'your town' },
        { type: 'text', text: String(Math.max(1, opts.jobsCount)) },
        { type: 'text', text: jobsUrl },
      ],
    },
  ];

  try {
    await sendWhatsappTemplate(
      opts.to,
      templateName,
      languageCode,
      components,
      opts.userId
    );
    return 'template';
  } catch (templateError) {
    try {
      await sendWhatsappMessage(opts.to, opts.fallbackText, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Matched jobs send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}

export async function sendMatchedJobAlertWhatsapp(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  company: string;
  location: string;
  jobPublicId: string | null;
  jobUrl: string;
  userId?: string | null;
}): Promise<'template' | 'text'> {
  try {
    await sendJobAlertWhatsapp({
      to: opts.to,
      seekerName: opts.userName || 'there',
      jobTitle: opts.jobTitle || 'New opportunity',
      company: opts.company || 'Joblinca',
      location: opts.location || 'N/A',
      jobUrl: opts.jobUrl,
      userId: opts.userId,
    });
    return 'template';
  } catch (templateError) {
    const fallback = [
      `New job match for you: ${opts.jobTitle || 'New opportunity'}`,
      `Company: ${opts.company || 'Joblinca'}`,
      `Location: ${opts.location || 'N/A'}`,
      `Job ID: ${opts.jobPublicId || 'N/A'}`,
      `Apply: ${opts.jobUrl}`,
    ].join('\n');

    try {
      await sendWhatsappMessage(opts.to, fallback, opts.userId);
      return 'text';
    } catch (fallbackError) {
      const templateMsg =
        templateError instanceof Error ? templateError.message : 'unknown_template_error';
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : 'unknown_fallback_error';
      throw new Error(
        `Matched job alert send failed. template=${templateMsg}; fallback=${fallbackMsg}`
      );
    }
  }
}
