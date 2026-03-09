import type { InterviewMode } from '@/lib/interview-scheduling/utils';

export const WEEKDAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export interface WeeklyAvailabilityWindow {
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export interface InterviewSlotTemplate {
  id: string;
  name: string;
  mode: InterviewMode;
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
}

export interface JobInterviewSelfScheduleSettings {
  timezone: string;
  minimumNoticeHours: number;
  slotIntervalMinutes: number;
  blackoutDates: string[];
  weeklyAvailability: Record<WeekdayKey, WeeklyAvailabilityWindow>;
  slotTemplates: InterviewSlotTemplate[];
}

export interface SelfScheduleAvailabilityCheck {
  allowed: boolean;
  reason: string | null;
}

export interface GeneratedSelfScheduleSlotDraft {
  date: string;
  weekday: WeekdayKey;
  scheduledAt: string;
  timezone: string;
}

export const MAX_SELF_SCHEDULE_GENERATION_DAYS = 60;
export const MAX_SELF_SCHEDULE_GENERATION_SLOTS = 45;

const DEFAULT_ENABLED_DAYS = new Set<WeekdayKey>([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
]);

function createDefaultWeeklyAvailability(): Record<WeekdayKey, WeeklyAvailabilityWindow> {
  return WEEKDAY_KEYS.reduce(
    (accumulator, day) => {
      accumulator[day] = {
        enabled: DEFAULT_ENABLED_DAYS.has(day),
        startTime: '09:00',
        endTime: '17:00',
      };
      return accumulator;
    },
    {} as Record<WeekdayKey, WeeklyAvailabilityWindow>
  );
}

export const DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS: JobInterviewSelfScheduleSettings = {
  timezone: 'UTC',
  minimumNoticeHours: 24,
  slotIntervalMinutes: 60,
  blackoutDates: [],
  weeklyAvailability: createDefaultWeeklyAvailability(),
  slotTemplates: [],
};

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidTimeValue(value: string | null): value is string {
  return Boolean(value && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value));
}

function normalizeInterviewModeValue(value: unknown): InterviewMode {
  switch (value) {
    case 'phone':
    case 'onsite':
    case 'other':
      return value;
    case 'video':
    default:
      return 'video';
  }
}

function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}

function parseDateInput(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function isValidDateInput(value: string | null): value is string {
  return Boolean(parseDateInput(value || ''));
}

function getWeekdayFromDateString(value: string): WeekdayKey {
  const parsed = parseDateInput(value);
  if (!parsed) {
    throw new Error('Date must use YYYY-MM-DD format');
  }

  const weekdayIndex = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)
  ).getUTCDay();

  return WEEKDAY_KEYS[(weekdayIndex + 6) % 7];
}

function getTimeZoneOffsetMinutes(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const timeZoneName =
    formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ||
    'GMT';

  if (timeZoneName === 'GMT' || timeZoneName === 'UTC') {
    return 0;
  }

  const match = timeZoneName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unsupported timezone offset format: ${timeZoneName}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] || '0');
  const minutes = Number(match[3] || '0');

  return sign * (hours * 60 + minutes);
}

function buildIsoForDateTimeInTimezone(
  date: string,
  time: string,
  timezone: string
): string {
  const parsedDate = parseDateInput(date);
  if (!parsedDate || !isValidTimeValue(time)) {
    throw new Error('Invalid date or time value');
  }

  const [hours, minutes] = time.split(':').map((part) => Number(part));
  const baseUtcMillis = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    hours,
    minutes,
    0
  );
  let utcMillis = baseUtcMillis;

  for (let index = 0; index < 2; index += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMillis), timezone);
    utcMillis = baseUtcMillis - offsetMinutes * 60 * 1000;
  }

  return new Date(utcMillis).toISOString();
}

function normalizeAvailabilityWindow(
  value: unknown,
  fallback: WeeklyAvailabilityWindow
): WeeklyAvailabilityWindow {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const startTime = sanitizeText(record.startTime);
  const endTime = sanitizeText(record.endTime);
  const normalizedStart = isValidTimeValue(startTime) ? startTime : fallback.startTime;
  const normalizedEnd = isValidTimeValue(endTime) ? endTime : fallback.endTime;
  const startMinutes = parseTimeToMinutes(normalizedStart);
  const endMinutes = parseTimeToMinutes(normalizedEnd);

  return {
    enabled:
      typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    startTime: startMinutes < endMinutes ? normalizedStart : fallback.startTime,
    endTime: startMinutes < endMinutes ? normalizedEnd : fallback.endTime,
  };
}

function normalizeSlotTemplate(value: unknown): InterviewSlotTemplate | null {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  if (!record) {
    return null;
  }

  const name = sanitizeText(record.name);
  if (!name) {
    return null;
  }

  const id = sanitizeText(record.id) || `template-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return {
    id,
    name,
    mode: normalizeInterviewModeValue(record.mode),
    location: sanitizeText(record.location),
    meetingUrl: sanitizeText(record.meetingUrl),
    notes: sanitizeText(record.notes),
  };
}

function getDatePartsInTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value.toLowerCase();
  const year = Number(parts.find((part) => part.type === 'year')?.value || '0');
  const month = Number(parts.find((part) => part.type === 'month')?.value || '0');
  const day = Number(parts.find((part) => part.type === 'day')?.value || '0');
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');

  return {
    weekday: weekday as WeekdayKey | undefined,
    dateKey: `${year.toString().padStart(4, '0')}-${month
      .toString()
      .padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
    minutes: (hour === 24 ? 0 : hour) * 60 + minute,
  };
}

function normalizeBlackoutDates(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => sanitizeText(item))
        .filter((item): item is string => isValidDateInput(item))
        .sort()
    )
  );
}

export function normalizeInterviewSelfScheduleSettings(
  value: Record<string, unknown> | null | undefined
): JobInterviewSelfScheduleSettings {
  const record = value || {};
  const defaultAvailability = createDefaultWeeklyAvailability();
  const weeklyRecord =
    record.weeklyAvailability &&
    typeof record.weeklyAvailability === 'object' &&
    !Array.isArray(record.weeklyAvailability)
      ? (record.weeklyAvailability as Record<string, unknown>)
      : {};

  const minimumNoticeHoursValue =
    typeof record.minimumNoticeHours === 'number'
      ? record.minimumNoticeHours
      : Number(record.minimumNoticeHours);
  const slotIntervalMinutesValue =
    typeof record.slotIntervalMinutes === 'number'
      ? record.slotIntervalMinutes
      : Number(record.slotIntervalMinutes);

  return {
    timezone:
      sanitizeText(record.timezone) ||
      DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS.timezone,
    minimumNoticeHours:
      Number.isFinite(minimumNoticeHoursValue) && minimumNoticeHoursValue >= 0
        ? Math.min(168, Math.round(minimumNoticeHoursValue))
        : DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS.minimumNoticeHours,
    slotIntervalMinutes:
      Number.isFinite(slotIntervalMinutesValue) && slotIntervalMinutesValue >= 15
        ? Math.min(240, Math.round(slotIntervalMinutesValue))
        : DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS.slotIntervalMinutes,
    blackoutDates: normalizeBlackoutDates(record.blackoutDates),
    weeklyAvailability: WEEKDAY_KEYS.reduce(
      (accumulator, day) => {
        accumulator[day] = normalizeAvailabilityWindow(
          weeklyRecord[day],
          defaultAvailability[day]
        );
        return accumulator;
      },
      {} as Record<WeekdayKey, WeeklyAvailabilityWindow>
    ),
    slotTemplates: Array.isArray(record.slotTemplates)
      ? record.slotTemplates
          .map(normalizeSlotTemplate)
          .filter((template): template is InterviewSlotTemplate => Boolean(template))
      : [],
  };
}

export function findInterviewSlotTemplate(
  settings: JobInterviewSelfScheduleSettings,
  templateId: string | null | undefined
): InterviewSlotTemplate | null {
  if (!templateId) {
    return null;
  }

  return settings.slotTemplates.find((template) => template.id === templateId) || null;
}

export function formatWeeklyAvailabilitySummary(
  settings: JobInterviewSelfScheduleSettings
): string {
  const openDays = WEEKDAY_KEYS.filter(
    (day) => settings.weeklyAvailability[day].enabled
  );

  if (openDays.length === 0) {
    return 'No weekly self-schedule availability configured';
  }

  return openDays
    .map((day) => {
      const window = settings.weeklyAvailability[day];
      return `${day.slice(0, 3)} ${window.startTime}-${window.endTime}`;
    })
    .join(' | ');
}

export function formatBlackoutDateSummary(
  settings: JobInterviewSelfScheduleSettings
): string {
  if (settings.blackoutDates.length === 0) {
    return 'No blackout dates configured';
  }

  if (settings.blackoutDates.length <= 3) {
    return settings.blackoutDates.join(' | ');
  }

  return `${settings.blackoutDates.slice(0, 3).join(' | ')} | +${
    settings.blackoutDates.length - 3
  } more`;
}

export function buildSelfScheduleSlotDrafts(params: {
  startDate: string;
  endDate: string;
  settings: JobInterviewSelfScheduleSettings;
}): GeneratedSelfScheduleSlotDraft[] {
  const start = parseDateInput(params.startDate);
  const end = parseDateInput(params.endDate);

  if (!start || !end) {
    throw new Error('startDate and endDate must use YYYY-MM-DD format');
  }

  const startUtc = Date.UTC(start.year, start.month - 1, start.day, 12, 0, 0);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day, 12, 0, 0);

  if (endUtc < startUtc) {
    throw new Error('endDate must be on or after startDate');
  }

  const dayCount = Math.floor((endUtc - startUtc) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > MAX_SELF_SCHEDULE_GENERATION_DAYS) {
    throw new Error(
      `Self-schedule generation is limited to ${MAX_SELF_SCHEDULE_GENERATION_DAYS} days`
    );
  }

  const drafts: GeneratedSelfScheduleSlotDraft[] = [];

  for (let dayOffset = 0; dayOffset < dayCount; dayOffset += 1) {
    const cursor = new Date(startUtc + dayOffset * 24 * 60 * 60 * 1000);
    const date = cursor.toISOString().slice(0, 10);
    if (params.settings.blackoutDates.includes(date)) {
      continue;
    }
    const weekday = getWeekdayFromDateString(date);
    const window = params.settings.weeklyAvailability[weekday];

    if (!window.enabled) {
      continue;
    }

    const startMinutes = parseTimeToMinutes(window.startTime);
    const endMinutes = parseTimeToMinutes(window.endTime);

    for (
      let slotMinutes = startMinutes;
      slotMinutes < endMinutes;
      slotMinutes += params.settings.slotIntervalMinutes
    ) {
      const hours = Math.floor(slotMinutes / 60)
        .toString()
        .padStart(2, '0');
      const minutes = (slotMinutes % 60).toString().padStart(2, '0');

      drafts.push({
        date,
        weekday,
        timezone: params.settings.timezone,
        scheduledAt: buildIsoForDateTimeInTimezone(
          date,
          `${hours}:${minutes}`,
          params.settings.timezone
        ),
      });
    }
  }

  if (drafts.length > MAX_SELF_SCHEDULE_GENERATION_SLOTS) {
    throw new Error(
      `Self-schedule generation is limited to ${MAX_SELF_SCHEDULE_GENERATION_SLOTS} slots`
    );
  }

  return drafts;
}

export function checkSelfScheduleAvailability(params: {
  scheduledAt: string;
  timezone?: string | null;
  settings: JobInterviewSelfScheduleSettings;
  now?: Date;
}): SelfScheduleAvailabilityCheck {
  const scheduledDate = new Date(params.scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    return {
      allowed: false,
      reason: 'scheduledAt must be a valid ISO datetime',
    };
  }

  const now = params.now || new Date();
  const minimumAllowedTime =
    now.getTime() + params.settings.minimumNoticeHours * 60 * 60 * 1000;

  if (scheduledDate.getTime() < minimumAllowedTime) {
    return {
      allowed: false,
      reason: `Self-schedule slots must respect the ${params.settings.minimumNoticeHours}-hour minimum notice`,
    };
  }

  const timezone = sanitizeText(params.timezone) || params.settings.timezone;
  let parts: ReturnType<typeof getDatePartsInTimezone>;

  try {
    parts = getDatePartsInTimezone(scheduledDate, timezone);
  } catch {
    return {
      allowed: false,
      reason: 'Invalid timezone for self-schedule availability',
    };
  }

  if (!parts.weekday) {
    return {
      allowed: false,
      reason: 'Unable to resolve self-schedule weekday',
    };
  }

  if (params.settings.blackoutDates.includes(parts.dateKey)) {
    return {
      allowed: false,
      reason: `Self-scheduling is closed on ${parts.dateKey}`,
    };
  }

  const window = params.settings.weeklyAvailability[parts.weekday];

  if (!window.enabled) {
    return {
      allowed: false,
      reason: `Self-scheduling is closed on ${parts.weekday}`,
    };
  }

  const startMinutes = parseTimeToMinutes(window.startTime);
  const endMinutes = parseTimeToMinutes(window.endTime);

  if (parts.minutes < startMinutes || parts.minutes >= endMinutes) {
    return {
      allowed: false,
      reason: `Self-schedule slots must fall within ${window.startTime}-${window.endTime} (${timezone})`,
    };
  }

  return {
    allowed: true,
    reason: null,
  };
}
