interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
}

interface CalendarLinkOptions {
  googleCalendarUrl?: string | null;
  outlookCalendarUrl?: string | null;
}

const DEFAULT_MATCHING_FROM = 'alerts@joblinca.com';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCalendarLinksText(opts: CalendarLinkOptions): string[] {
  return [
    opts.googleCalendarUrl ? `Add to Google Calendar: ${opts.googleCalendarUrl}` : null,
    opts.outlookCalendarUrl ? `Add to Outlook Calendar: ${opts.outlookCalendarUrl}` : null,
  ].filter((line): line is string => Boolean(line));
}

function buildCalendarLinksHtml(opts: CalendarLinkOptions): string {
  const safeGoogleUrl = escapeHtml(opts.googleCalendarUrl || '');
  const safeOutlookUrl = escapeHtml(opts.outlookCalendarUrl || '');
  const links = [
    safeGoogleUrl
      ? `<a href="${safeGoogleUrl}" style="background:#2563eb;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block;margin-right:8px;">Add to Google Calendar</a>`
      : '',
    safeOutlookUrl
      ? `<a href="${safeOutlookUrl}" style="background:#111827;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block;">Add to Outlook</a>`
      : '',
  ].filter(Boolean);

  if (links.length === 0) {
    return '';
  }

  return `<p style="margin:16px 0 0;">${links.join('')}</p>`;
}

export function isMatchingEmailConfigured(): boolean {
  return Boolean((process.env.RESEND_API_KEY || '').trim());
}

export function isEmailDeliveryConfigured(): boolean {
  return isMatchingEmailConfigured();
}

async function sendEmailViaResend(input: SendEmailInput): Promise<void> {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.MATCHING_EMAIL_FROM || DEFAULT_MATCHING_FROM).trim();

  if (!apiKey) {
    throw new Error('Email delivery is not configured. Set RESEND_API_KEY.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: input.replyTo || undefined,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email send failed (${response.status}): ${body}`);
  }
}

export async function sendMatchedJobAlertEmail(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  location: string;
  jobType: 'job' | 'internship';
  jobPublicId: string | null;
  jobUrl: string;
  score: number;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeTitle = escapeHtml(opts.jobTitle || 'New opportunity');
  const safeCompany = escapeHtml(opts.companyName || 'a company');
  const safeLocation = escapeHtml(opts.location || 'N/A');
  const safeType = opts.jobType === 'internship' ? 'internship' : 'job';
  const safePublicId = escapeHtml(opts.jobPublicId || 'N/A');
  const safeUrl = escapeHtml(opts.jobUrl);

  const subjectPrefix = opts.jobType === 'internship' ? 'Internship match' : 'Job match';
  const subject = `${subjectPrefix}: ${opts.jobTitle || 'New opportunity'}`;

  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    `We found a ${safeType} match for you.`,
    `${opts.jobTitle || 'New opportunity'} at ${opts.companyName || 'a company'}`,
    `Location: ${opts.location || 'N/A'}`,
    `Job ID: ${opts.jobPublicId || 'N/A'}`,
    `Match score: ${opts.score}/100`,
    '',
    `View and apply: ${opts.jobUrl}`,
    '',
    'You are receiving this because you have an active Joblinca subscription.',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">New ${safeType} match</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">
        We found a new <strong>${safeType}</strong> opportunity for you.
      </p>
      <p style="margin:0 0 8px;"><strong>${safeTitle}</strong></p>
      <p style="margin:0 0 4px;">Company: ${safeCompany}</p>
      <p style="margin:0 0 4px;">Location: ${safeLocation}</p>
      <p style="margin:0 0 4px;">Job ID: ${safePublicId}</p>
      <p style="margin:0 0 16px;">Match score: ${opts.score}/100</p>
      <p style="margin:0 0 16px;">
        <a href="${safeUrl}" style="background:#2563eb;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block;">
          View Opportunity
        </a>
      </p>
      <p style="margin:0;color:#6b7280;font-size:12px;">
        You are receiving this because you have an active Joblinca subscription.
      </p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}

export async function sendInterviewScheduledEmail(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  interviewTime: string;
  modeLabel: string;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  googleCalendarUrl?: string | null;
  outlookCalendarUrl?: string | null;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeTitle = escapeHtml(opts.jobTitle || 'Interview');
  const safeCompany = escapeHtml(opts.companyName || 'Joblinca');
  const safeTime = escapeHtml(opts.interviewTime || 'Scheduled soon');
  const safeMode = escapeHtml(opts.modeLabel || 'Interview');
  const safeLocation = escapeHtml(opts.location || '');
  const safeMeetingUrl = escapeHtml(opts.meetingUrl || '');
  const safeNotes = escapeHtml(opts.notes || '');

  const subject = `Interview scheduled: ${opts.jobTitle || 'Interview'}`;
  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    `Your ${opts.modeLabel || 'interview'} for ${opts.jobTitle || 'this role'} at ${opts.companyName || 'Joblinca'} has been scheduled.`,
    `Time: ${opts.interviewTime || 'Scheduled soon'}`,
    opts.location ? `Location: ${opts.location}` : null,
    opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
    opts.notes ? `Notes: ${opts.notes}` : null,
    ...buildCalendarLinksText(opts),
    '',
    'Please be ready a few minutes early.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">Interview scheduled</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">
        Your <strong>${safeMode}</strong> for <strong>${safeTitle}</strong> at <strong>${safeCompany}</strong> has been scheduled.
      </p>
      <p style="margin:0 0 6px;">Time: ${safeTime}</p>
      ${safeLocation ? `<p style="margin:0 0 6px;">Location: ${safeLocation}</p>` : ''}
      ${
        safeMeetingUrl
          ? `<p style="margin:0 0 12px;">Meeting link: <a href="${safeMeetingUrl}">${safeMeetingUrl}</a></p>`
          : ''
      }
      ${safeNotes ? `<p style="margin:0 0 12px;">Notes: ${safeNotes}</p>` : ''}
      ${buildCalendarLinksHtml(opts)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        Please be ready a few minutes early.
      </p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}

export async function sendInterviewReminderEmail(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  interviewTime: string;
  modeLabel: string;
  location?: string | null;
  meetingUrl?: string | null;
  googleCalendarUrl?: string | null;
  outlookCalendarUrl?: string | null;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeTitle = escapeHtml(opts.jobTitle || 'Interview');
  const safeCompany = escapeHtml(opts.companyName || 'Joblinca');
  const safeTime = escapeHtml(opts.interviewTime || 'Scheduled soon');
  const safeMode = escapeHtml(opts.modeLabel || 'Interview');
  const safeLocation = escapeHtml(opts.location || '');
  const safeMeetingUrl = escapeHtml(opts.meetingUrl || '');

  const subject = `Interview reminder: ${opts.jobTitle || 'Interview'}`;
  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    `Reminder: your ${opts.modeLabel || 'interview'} for ${opts.jobTitle || 'this role'} at ${opts.companyName || 'Joblinca'} is coming up.`,
    `Time: ${opts.interviewTime || 'Scheduled soon'}`,
    opts.location ? `Location: ${opts.location}` : null,
    opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
    ...buildCalendarLinksText(opts),
    '',
    'Good luck.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">Interview reminder</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">
        Reminder: your <strong>${safeMode}</strong> for <strong>${safeTitle}</strong> at <strong>${safeCompany}</strong> is coming up.
      </p>
      <p style="margin:0 0 6px;">Time: ${safeTime}</p>
      ${safeLocation ? `<p style="margin:0 0 6px;">Location: ${safeLocation}</p>` : ''}
      ${
        safeMeetingUrl
          ? `<p style="margin:0 0 12px;">Meeting link: <a href="${safeMeetingUrl}">${safeMeetingUrl}</a></p>`
          : ''
      }
      ${buildCalendarLinksHtml(opts)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">Good luck.</p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}

export async function sendInterviewRescheduledEmail(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  interviewTime: string;
  modeLabel: string;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  googleCalendarUrl?: string | null;
  outlookCalendarUrl?: string | null;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeTitle = escapeHtml(opts.jobTitle || 'Interview');
  const safeCompany = escapeHtml(opts.companyName || 'Joblinca');
  const safeTime = escapeHtml(opts.interviewTime || 'Scheduled soon');
  const safeMode = escapeHtml(opts.modeLabel || 'Interview');
  const safeLocation = escapeHtml(opts.location || '');
  const safeMeetingUrl = escapeHtml(opts.meetingUrl || '');
  const safeNotes = escapeHtml(opts.notes || '');

  const subject = `Interview rescheduled: ${opts.jobTitle || 'Interview'}`;
  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    `Your ${opts.modeLabel || 'interview'} for ${opts.jobTitle || 'this role'} at ${opts.companyName || 'Joblinca'} has been rescheduled.`,
    `New time: ${opts.interviewTime || 'Scheduled soon'}`,
    opts.location ? `Location: ${opts.location}` : null,
    opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
    opts.notes ? `Notes: ${opts.notes}` : null,
    ...buildCalendarLinksText(opts),
    '',
    'Please confirm whether you can still attend.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">Interview rescheduled</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">
        Your <strong>${safeMode}</strong> for <strong>${safeTitle}</strong> at <strong>${safeCompany}</strong> has been rescheduled.
      </p>
      <p style="margin:0 0 6px;">New time: ${safeTime}</p>
      ${safeLocation ? `<p style="margin:0 0 6px;">Location: ${safeLocation}</p>` : ''}
      ${
        safeMeetingUrl
          ? `<p style="margin:0 0 12px;">Meeting link: <a href="${safeMeetingUrl}">${safeMeetingUrl}</a></p>`
          : ''
      }
      ${safeNotes ? `<p style="margin:0 0 12px;">Notes: ${safeNotes}</p>` : ''}
      ${buildCalendarLinksHtml(opts)}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        Please confirm whether you can still attend.
      </p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}

export async function sendInterviewCancelledEmail(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  interviewTime: string;
  modeLabel: string;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeTitle = escapeHtml(opts.jobTitle || 'Interview');
  const safeCompany = escapeHtml(opts.companyName || 'Joblinca');
  const safeTime = escapeHtml(opts.interviewTime || 'Scheduled soon');
  const safeMode = escapeHtml(opts.modeLabel || 'Interview');
  const safeLocation = escapeHtml(opts.location || '');
  const safeMeetingUrl = escapeHtml(opts.meetingUrl || '');
  const safeNotes = escapeHtml(opts.notes || '');

  const subject = `Interview cancelled: ${opts.jobTitle || 'Interview'}`;
  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    `Your ${opts.modeLabel || 'interview'} for ${opts.jobTitle || 'this role'} at ${opts.companyName || 'Joblinca'} has been cancelled.`,
    `Cancelled slot: ${opts.interviewTime || 'Scheduled soon'}`,
    opts.location ? `Location: ${opts.location}` : null,
    opts.meetingUrl ? `Meeting link: ${opts.meetingUrl}` : null,
    opts.notes ? `Notes: ${opts.notes}` : null,
    '',
    'If the recruiter wants to continue, they will send a new interview slot.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">Interview cancelled</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">
        Your <strong>${safeMode}</strong> for <strong>${safeTitle}</strong> at <strong>${safeCompany}</strong> has been cancelled.
      </p>
      <p style="margin:0 0 6px;">Cancelled slot: ${safeTime}</p>
      ${safeLocation ? `<p style="margin:0 0 6px;">Location: ${safeLocation}</p>` : ''}
      ${
        safeMeetingUrl
          ? `<p style="margin:0 0 12px;">Meeting link: <a href="${safeMeetingUrl}">${safeMeetingUrl}</a></p>`
          : ''
      }
      ${safeNotes ? `<p style="margin:0 0 12px;">Notes: ${safeNotes}</p>` : ''}
      <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
        If the recruiter wants to continue, they will send a new interview slot.
      </p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}

export async function sendInterviewOutcomeFollowupEmail(opts: {
  to: string;
  userName: string;
  subject: string;
  intro: string;
  detail: string;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeSubject = escapeHtml(opts.subject || 'Interview follow-up');
  const safeIntro = escapeHtml(opts.intro || 'Interview update');
  const safeDetail = escapeHtml(opts.detail || 'The recruiter shared an update.');

  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    opts.intro,
    opts.detail,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">${safeSubject}</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">${safeIntro}</p>
      <p style="margin:0;">${safeDetail}</p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject: opts.subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}

export async function sendInterviewSelfScheduleInviteEmail(opts: {
  to: string;
  userName: string;
  jobTitle: string;
  companyName: string;
  inviteUrl: string;
  modeLabel: string;
  notes?: string | null;
}): Promise<void> {
  const safeName = escapeHtml(opts.userName || 'there');
  const safeTitle = escapeHtml(opts.jobTitle || 'Interview');
  const safeCompany = escapeHtml(opts.companyName || 'Joblinca');
  const safeUrl = escapeHtml(opts.inviteUrl || '');
  const safeMode = escapeHtml(opts.modeLabel || 'Interview');
  const safeNotes = escapeHtml(opts.notes || '');

  const subject = `Choose your interview time: ${opts.jobTitle || 'Interview'}`;
  const text = [
    `Hi ${opts.userName || 'there'},`,
    '',
    `${opts.companyName || 'Joblinca'} has opened interview slots for ${opts.jobTitle || 'this role'}.`,
    `Mode: ${opts.modeLabel || 'Interview'}`,
    opts.notes ? `Notes: ${opts.notes}` : null,
    '',
    `Choose your time: ${opts.inviteUrl}`,
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
      <h2 style="margin:0 0 12px;">Choose your interview time</h2>
      <p style="margin:0 0 12px;">Hi ${safeName},</p>
      <p style="margin:0 0 12px;">
        <strong>${safeCompany}</strong> has opened interview slots for <strong>${safeTitle}</strong>.
      </p>
      <p style="margin:0 0 6px;">Mode: ${safeMode}</p>
      ${safeNotes ? `<p style="margin:0 0 12px;">Notes: ${safeNotes}</p>` : ''}
      <p style="margin:16px 0 0;">
        <a href="${safeUrl}" style="background:#2563eb;color:#ffffff;padding:10px 14px;border-radius:6px;text-decoration:none;display:inline-block;">
          Choose Interview Time
        </a>
      </p>
    </div>
  `;

  await sendEmailViaResend({
    to: opts.to,
    subject,
    text,
    html,
    replyTo: process.env.MATCHING_EMAIL_REPLY_TO || null,
  });
}
