export type InterviewMode = 'video' | 'phone' | 'onsite' | 'other';
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';
export type InterviewResponseStatus = 'pending' | 'confirmed' | 'declined';
export type InterviewSlotStatus = 'available' | 'booked' | 'cancelled';

const VALID_INTERVIEW_MODES: InterviewMode[] = ['video', 'phone', 'onsite', 'other'];
const VALID_INTERVIEW_STATUSES: InterviewStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
  'no_show',
];
const VALID_INTERVIEW_RESPONSE_STATUSES: InterviewResponseStatus[] = [
  'pending',
  'confirmed',
  'declined',
];
const VALID_INTERVIEW_SLOT_STATUSES: InterviewSlotStatus[] = [
  'available',
  'booked',
  'cancelled',
];

export function normalizeInterviewMode(value: unknown): InterviewMode {
  if (typeof value === 'string' && VALID_INTERVIEW_MODES.includes(value as InterviewMode)) {
    return value as InterviewMode;
  }

  return 'video';
}

export function normalizeInterviewStatus(value: unknown): InterviewStatus {
  if (
    typeof value === 'string' &&
    VALID_INTERVIEW_STATUSES.includes(value as InterviewStatus)
  ) {
    return value as InterviewStatus;
  }

  return 'scheduled';
}

export function normalizeInterviewResponseStatus(value: unknown): InterviewResponseStatus {
  if (
    typeof value === 'string' &&
    VALID_INTERVIEW_RESPONSE_STATUSES.includes(value as InterviewResponseStatus)
  ) {
    return value as InterviewResponseStatus;
  }

  return 'pending';
}

export function normalizeInterviewSlotStatus(value: unknown): InterviewSlotStatus {
  if (
    typeof value === 'string' &&
    VALID_INTERVIEW_SLOT_STATUSES.includes(value as InterviewSlotStatus)
  ) {
    return value as InterviewSlotStatus;
  }

  return 'available';
}

export function getInterviewModeLabel(mode: InterviewMode): string {
  switch (mode) {
    case 'video':
      return 'Video call';
    case 'phone':
      return 'Phone call';
    case 'onsite':
      return 'On-site';
    default:
      return 'Interview';
  }
}

export function getInterviewStatusLabel(status: InterviewStatus): string {
  switch (status) {
    case 'scheduled':
      return 'Scheduled';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'No show';
  }
}

export function getInterviewResponseStatusLabel(status: InterviewResponseStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'declined':
      return 'Declined';
    default:
      return 'Pending reply';
  }
}

export function getInterviewSlotStatusLabel(status: InterviewSlotStatus): string {
  switch (status) {
    case 'booked':
      return 'Booked';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Available';
  }
}

export function formatInterviewDateTimeLabel(
  scheduledAt: string,
  timezone: string | null | undefined
): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return scheduledAt;
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}

export function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const compact = phone.replace(/\s+/g, '').trim();
  if (!compact) return null;

  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digits = compact.replace(/\D/g, '');
  return digits.length >= 8 ? `+${digits}` : null;
}

export interface InterviewStageLike {
  id: string;
  stageType: string;
  orderIndex: number;
}

export function pickInterviewStageId(
  stages: InterviewStageLike[],
  currentStageId?: string | null
): string | null {
  const interviewStages = stages
    .filter((stage) => stage.stageType === 'interview')
    .sort((left, right) => left.orderIndex - right.orderIndex);

  if (interviewStages.length === 0) {
    return null;
  }

  if (currentStageId && interviewStages.some((stage) => stage.id === currentStageId)) {
    return currentStageId;
  }

  return interviewStages[0].id;
}
