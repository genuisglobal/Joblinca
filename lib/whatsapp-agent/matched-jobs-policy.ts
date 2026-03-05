export interface MatchedJobsEligibilityInput {
  subscribed: boolean;
  lastMatchedJobsSentAt: string | null;
  lastMatchedJobsWeekKey: string | null;
  now?: Date;
  subscriberFrequencyHours?: number;
}

export interface MatchedJobsEligibilityResult {
  eligible: boolean;
  reason: 'ok' | 'free_not_friday' | 'free_already_sent_week' | 'subscriber_too_soon';
  weekKey: string;
  dispatchKey: string;
  isFriday: boolean;
}

function gmtPlus1Date(now: Date): Date {
  return new Date(now.getTime() + 60 * 60 * 1000);
}

export function getGmtPlus1WeekKey(now: Date): string {
  const shifted = gmtPlus1Date(now);
  const temp = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`;
}

export function getDispatchBucketKey(
  now: Date,
  frequencyHours: number
): string {
  const freqMs = Math.max(1, frequencyHours) * 60 * 60 * 1000;
  const shiftedMs = gmtPlus1Date(now).getTime();
  return String(Math.floor(shiftedMs / freqMs));
}

export function isFridayInGmtPlus1(now: Date): boolean {
  const shifted = gmtPlus1Date(now);
  return shifted.getUTCDay() === 5;
}

export function computeMatchedJobsEligibility(
  leadId: string,
  input: MatchedJobsEligibilityInput
): MatchedJobsEligibilityResult {
  const now = input.now || new Date();
  const weekKey = getGmtPlus1WeekKey(now);
  const friday = isFridayInGmtPlus1(now);
  const frequencyHours = Math.max(1, input.subscriberFrequencyHours || 24);

  if (!input.subscribed) {
    const dispatchKey = `${leadId}:free:${weekKey}`;
    if (!friday) {
      return {
        eligible: false,
        reason: 'free_not_friday',
        weekKey,
        dispatchKey,
        isFriday: false,
      };
    }
    if (input.lastMatchedJobsWeekKey === weekKey) {
      return {
        eligible: false,
        reason: 'free_already_sent_week',
        weekKey,
        dispatchKey,
        isFriday: true,
      };
    }
    return {
      eligible: true,
      reason: 'ok',
      weekKey,
      dispatchKey,
      isFriday: true,
    };
  }

  const subscriberBucket = getDispatchBucketKey(now, frequencyHours);
  const dispatchKey = `${leadId}:sub:${subscriberBucket}`;
  if (input.lastMatchedJobsSentAt) {
    const lastMs = Date.parse(input.lastMatchedJobsSentAt);
    if (!Number.isNaN(lastMs)) {
      const minMs = frequencyHours * 60 * 60 * 1000;
      if (now.getTime() - lastMs < minMs) {
        return {
          eligible: false,
          reason: 'subscriber_too_soon',
          weekKey,
          dispatchKey,
          isFriday: friday,
        };
      }
    }
  }

  return {
    eligible: true,
    reason: 'ok',
    weekKey,
    dispatchKey,
    isFriday: friday,
  };
}

