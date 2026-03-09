export const HIRING_STAGE_TYPES = [
  'applied',
  'screening',
  'review',
  'interview',
  'offer',
  'hire',
  'rejected',
] as const;

export const LEGACY_APPLICATION_STATUSES = [
  'submitted',
  'shortlisted',
  'interviewed',
  'hired',
  'rejected',
] as const;

export type HiringStageType = (typeof HIRING_STAGE_TYPES)[number];
export type LegacyApplicationStatus = (typeof LEGACY_APPLICATION_STATUSES)[number];

const LEGACY_STATUS_BY_STAGE_TYPE: Record<HiringStageType, LegacyApplicationStatus> = {
  applied: 'submitted',
  screening: 'submitted',
  review: 'shortlisted',
  interview: 'interviewed',
  offer: 'shortlisted',
  hire: 'hired',
  rejected: 'rejected',
};

const DEFAULT_STAGE_KEYS_BY_LEGACY_STATUS: Record<LegacyApplicationStatus, string[]> = {
  submitted: ['applied', 'phone_screen'],
  shortlisted: ['recruiter_review', 'hiring_manager_review', 'final_review', 'offer'],
  interviewed: ['interview'],
  hired: ['hired'],
  rejected: ['rejected'],
};

export function isHiringStageType(value: string | null | undefined): value is HiringStageType {
  if (!value) return false;
  return (HIRING_STAGE_TYPES as readonly string[]).includes(value);
}

export function isLegacyApplicationStatus(
  value: string | null | undefined
): value is LegacyApplicationStatus {
  if (!value) return false;
  return (LEGACY_APPLICATION_STATUSES as readonly string[]).includes(value);
}

export function mapStageTypeToLegacyStatus(
  stageType: string | null | undefined
): LegacyApplicationStatus {
  if (!isHiringStageType(stageType)) {
    return 'submitted';
  }

  return LEGACY_STATUS_BY_STAGE_TYPE[stageType];
}

export function defaultStageKeysForLegacyStatus(
  status: string | null | undefined
): string[] {
  if (!isLegacyApplicationStatus(status)) {
    return DEFAULT_STAGE_KEYS_BY_LEGACY_STATUS.submitted;
  }

  return DEFAULT_STAGE_KEYS_BY_LEGACY_STATUS[status];
}
