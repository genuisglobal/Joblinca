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
    'interview_reminder_v1',
    'en',
    components,
    opts.userId
  );
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
