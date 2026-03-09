export interface InterviewCalendarEventInput {
  interviewId: string;
  scheduledAt: string;
  jobTitle?: string | null;
  companyName?: string | null;
  modeLabel?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  manageUrl?: string | null;
  durationMinutes?: number | null;
}

export interface InterviewCalendarEvent {
  title: string;
  description: string;
  location: string | null;
  startUtc: string;
  endUtc: string;
  googleCalendarUrl: string;
  outlookCalendarUrl: string;
  filename: string;
  icsContent: string;
}

const DEFAULT_INTERVIEW_DURATION_MINUTES = 60;

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatUtcCompact(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldIcsLine(line: string): string {
  if (line.length <= 73) {
    return line;
  }

  const segments: string[] = [];
  for (let index = 0; index < line.length; index += 73) {
    const chunk = line.slice(index, index + 73);
    segments.push(index === 0 ? chunk : ` ${chunk}`);
  }

  return segments.join('\r\n');
}

function buildCalendarTitle(input: InterviewCalendarEventInput): string {
  const jobTitle = sanitizeText(input.jobTitle) || 'Interview';
  const companyName = sanitizeText(input.companyName);

  return companyName ? `Interview: ${jobTitle} - ${companyName}` : `Interview: ${jobTitle}`;
}

function buildCalendarDescription(input: InterviewCalendarEventInput): string {
  const lines = [
    sanitizeText(input.jobTitle) ? `Job: ${sanitizeText(input.jobTitle)}` : null,
    sanitizeText(input.companyName) ? `Company: ${sanitizeText(input.companyName)}` : null,
    sanitizeText(input.modeLabel) ? `Mode: ${sanitizeText(input.modeLabel)}` : null,
    sanitizeText(input.location) ? `Location: ${sanitizeText(input.location)}` : null,
    sanitizeText(input.meetingUrl) ? `Meeting link: ${sanitizeText(input.meetingUrl)}` : null,
    sanitizeText(input.notes) ? `Notes: ${sanitizeText(input.notes)}` : null,
    sanitizeText(input.manageUrl) ? `Manage in Joblinca: ${sanitizeText(input.manageUrl)}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

function slugifyFilePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildInterviewCalendarEvent(
  input: InterviewCalendarEventInput
): InterviewCalendarEvent {
  const start = new Date(input.scheduledAt);
  if (Number.isNaN(start.getTime())) {
    throw new Error('scheduledAt must be a valid ISO datetime');
  }

  const durationMinutes =
    typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)
      ? Math.max(15, Math.round(input.durationMinutes))
      : DEFAULT_INTERVIEW_DURATION_MINUTES;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const title = buildCalendarTitle(input);
  const description = buildCalendarDescription(input);
  const location = sanitizeText(input.location) || sanitizeText(input.meetingUrl);
  const startUtc = formatUtcCompact(start);
  const endUtc = formatUtcCompact(end);

  const googleUrl = new URL('https://calendar.google.com/calendar/render');
  googleUrl.searchParams.set('action', 'TEMPLATE');
  googleUrl.searchParams.set('text', title);
  googleUrl.searchParams.set('dates', `${startUtc}/${endUtc}`);
  if (description) {
    googleUrl.searchParams.set('details', description);
  }
  if (location) {
    googleUrl.searchParams.set('location', location);
  }

  const outlookUrl = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  outlookUrl.searchParams.set('path', '/calendar/action/compose');
  outlookUrl.searchParams.set('rru', 'addevent');
  outlookUrl.searchParams.set('subject', title);
  outlookUrl.searchParams.set('startdt', start.toISOString());
  outlookUrl.searchParams.set('enddt', end.toISOString());
  if (description) {
    outlookUrl.searchParams.set('body', description);
  }
  if (location) {
    outlookUrl.searchParams.set('location', location);
  }

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Joblinca//Interview Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:interview-${input.interviewId}@joblinca.com`,
    `DTSTAMP:${formatUtcCompact(new Date())}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${escapeIcsText(title)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    sanitizeText(input.meetingUrl)
      ? `URL:${escapeIcsText(sanitizeText(input.meetingUrl) || '')}`
      : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => Boolean(line));

  const filenameBase =
    slugifyFilePart(sanitizeText(input.jobTitle) || 'interview') || 'interview';

  return {
    title,
    description,
    location,
    startUtc,
    endUtc,
    googleCalendarUrl: googleUrl.toString(),
    outlookCalendarUrl: outlookUrl.toString(),
    filename: `${filenameBase}-${start.toISOString().slice(0, 10)}.ics`,
    icsContent: icsLines.map(foldIcsLine).join('\r\n'),
  };
}
