export const JOB_LIFECYCLE_STATUSES = [
  'on_hold',
  'live',
  'closed_reviewing',
  'filled',
  'archived',
  'removed',
] as const;

export type JobLifecycleStatus = (typeof JOB_LIFECYCLE_STATUSES)[number];

export interface JobLifecycleFields {
  published?: boolean | null;
  approval_status?: string | null;
  lifecycle_status?: string | null;
  closes_at?: string | null;
  closed_at?: string | null;
  archived_at?: string | null;
  filled_at?: string | null;
  removed_at?: string | null;
  removal_reason?: string | null;
  reopen_count?: number | null;
  last_reopened_at?: string | null;
  target_hire_date?: string | null;
  retention_expires_at?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isFiniteDate(input: Date): boolean {
  return !Number.isNaN(input.getTime());
}

function parseDate(input: string | null | undefined): Date | null {
  if (!input) {
    return null;
  }

  const parsed = new Date(input);
  return isFiniteDate(parsed) ? parsed : null;
}

export function normalizeJobLifecycleStatus(
  value: unknown
): JobLifecycleStatus | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return JOB_LIFECYCLE_STATUSES.includes(normalized as JobLifecycleStatus)
    ? (normalized as JobLifecycleStatus)
    : null;
}

export function isJobClosedByDeadline(
  closesAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  const deadline = parseDate(closesAt);
  return Boolean(deadline && deadline.getTime() <= now.getTime());
}

export function isJobModerationApproved(job: JobLifecycleFields): boolean {
  return !job.approval_status || job.approval_status === 'approved';
}

export function isJobRemoved(job: JobLifecycleFields): boolean {
  return Boolean(job.removed_at) || normalizeJobLifecycleStatus(job.lifecycle_status) === 'removed';
}

export function isJobPubliclyVisible(
  job: JobLifecycleFields,
  now: Date = new Date()
): boolean {
  if (!job.published || !isJobModerationApproved(job) || isJobRemoved(job)) {
    return false;
  }

  const lifecycleStatus = normalizeJobLifecycleStatus(job.lifecycle_status);
  if (lifecycleStatus === 'archived' || lifecycleStatus === 'filled' || lifecycleStatus === 'on_hold') {
    return false;
  }

  if (lifecycleStatus === 'closed_reviewing') {
    return true;
  }

  if (lifecycleStatus === 'live') {
    return true;
  }

  // Backward-compatibility while rows are migrating.
  return !isJobClosedByDeadline(job.closes_at, now);
}

export function isJobPubliclyListable(
  job: JobLifecycleFields,
  now: Date = new Date()
): boolean {
  if (!job.published || !isJobModerationApproved(job) || isJobRemoved(job)) {
    return false;
  }

  const lifecycleStatus = normalizeJobLifecycleStatus(job.lifecycle_status);
  if (lifecycleStatus) {
    return lifecycleStatus === 'live' && !isJobClosedByDeadline(job.closes_at, now);
  }

  return !isJobClosedByDeadline(job.closes_at, now);
}

export function isJobAcceptingApplications(
  job: JobLifecycleFields,
  now: Date = new Date()
): boolean {
  return isJobPubliclyListable(job, now);
}

export function canJobBeReopened(job: JobLifecycleFields): boolean {
  if (!isJobModerationApproved(job) || isJobRemoved(job)) {
    return false;
  }

  const lifecycleStatus = normalizeJobLifecycleStatus(job.lifecycle_status);
  return lifecycleStatus === 'closed_reviewing' || lifecycleStatus === 'on_hold';
}

export function getJobManagementStatus(
  job: Pick<JobLifecycleFields, 'published' | 'approval_status' | 'lifecycle_status'>
): string {
  if (job.approval_status === 'rejected') {
    return 'rejected';
  }

  if (job.approval_status === 'pending') {
    return 'pending';
  }

  const lifecycleStatus = normalizeJobLifecycleStatus(job.lifecycle_status);
  if (lifecycleStatus) {
    return lifecycleStatus;
  }

  return job.published ? 'published' : 'draft';
}

export function shouldArchiveFilledJob(
  job: Pick<JobLifecycleFields, 'filled_at' | 'retention_expires_at' | 'archived_at'>,
  now: Date = new Date()
): boolean {
  if (job.archived_at) {
    return false;
  }

  if (!job.filled_at) {
    return false;
  }

  const retentionExpiresAt = parseDate(job.retention_expires_at);
  return Boolean(retentionExpiresAt && retentionExpiresAt.getTime() <= now.getTime());
}

export function shouldArchiveClosedJob(
  job: Pick<
    JobLifecycleFields,
    'closed_at' | 'archived_at' | 'filled_at' | 'lifecycle_status' | 'target_hire_date' | 'retention_expires_at'
  >,
  now: Date = new Date(),
  reviewWindowDays = 45,
  targetHireRetentionDays = 30
): boolean {
  if (job.archived_at || job.filled_at) {
    return false;
  }

  const lifecycleStatus = normalizeJobLifecycleStatus(job.lifecycle_status);
  if (lifecycleStatus !== 'closed_reviewing') {
    return false;
  }

  const retentionExpiresAt = parseDate(job.retention_expires_at);
  if (retentionExpiresAt) {
    return retentionExpiresAt.getTime() <= now.getTime();
  }

  const targetHireDate = parseDate(job.target_hire_date);
  if (targetHireDate) {
    const retentionThreshold = targetHireDate.getTime() + targetHireRetentionDays * DAY_MS;
    return retentionThreshold <= now.getTime();
  }

  const closedAt = parseDate(job.closed_at);
  if (!closedAt) {
    return false;
  }

  const archiveThreshold = closedAt.getTime() + reviewWindowDays * DAY_MS;
  return archiveThreshold <= now.getTime();
}
