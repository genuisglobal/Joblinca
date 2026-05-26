import type { CandidateApplicationRecord } from '@/lib/applications/dashboard';
import type { Locale } from '@/lib/i18n/locale';
import type {
  InterviewMode,
  InterviewResponseStatus,
  InterviewStatus,
} from '@/lib/interview-scheduling/utils';

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

function getIntlLocale(locale: Locale) {
  return locale === 'fr' ? 'fr-FR' : 'en-US';
}

export function formatLocalizedDate(
  value: string | null | undefined,
  locale: Locale
) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: 'medium',
  }).format(date);
}

export function formatLocalizedDateTime(
  value: string,
  locale: Locale,
  timezone?: string | null
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone || 'UTC',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(getIntlLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}

export function translateOpportunityLabel(
  t: TranslateFn,
  jobType: string | null | undefined,
  internshipTrack: string | null | undefined
) {
  if (jobType === 'internship' && internshipTrack === 'education') {
    return t('common.opportunity.internshipEducation');
  }

  if (jobType === 'internship' && internshipTrack === 'professional') {
    return t('common.opportunity.internshipProfessional');
  }

  if (jobType === 'internship') {
    return t('common.opportunity.internship');
  }

  if (jobType === 'gig') {
    return t('common.opportunity.gig');
  }

  return t('common.opportunity.job');
}

export function translateInterviewMode(
  t: TranslateFn,
  mode: InterviewMode
) {
  switch (mode) {
    case 'video':
      return t('interview.mode.video');
    case 'phone':
      return t('interview.mode.phone');
    case 'onsite':
      return t('interview.mode.onsite');
    default:
      return t('interview.mode.other');
  }
}

export function translateInterviewStatus(
  t: TranslateFn,
  status: InterviewStatus
) {
  switch (status) {
    case 'completed':
      return t('interview.status.completed');
    case 'cancelled':
      return t('interview.status.cancelled');
    case 'no_show':
      return t('interview.status.noShow');
    default:
      return t('interview.status.scheduled');
  }
}

export function translateInterviewResponseStatus(
  t: TranslateFn,
  status: InterviewResponseStatus
) {
  switch (status) {
    case 'confirmed':
      return t('interview.response.confirmed');
    case 'declined':
      return t('interview.response.declined');
    default:
      return t('interview.response.pending');
  }
}

export function translateDecisionStatus(
  t: TranslateFn,
  decisionStatus: string | null | undefined
) {
  switch (decisionStatus) {
    case 'hired':
      return t('status.hired');
    case 'rejected':
      return t('status.rejected');
    case 'withdrawn':
      return t('status.withdrawn');
    default:
      return t('status.active');
  }
}

export function translateReadinessTrend(
  t: TranslateFn,
  value: 'improving' | 'steady' | 'needs_work' | null
) {
  if (value === 'improving') {
    return t('applicationCard.readiness.trend.improving');
  }

  if (value === 'needs_work') {
    return t('applicationCard.readiness.trend.needsWork');
  }

  if (value === 'steady') {
    return t('applicationCard.readiness.trend.steady');
  }

  return null;
}

export function buildApplicationProgressSummary(
  t: TranslateFn,
  locale: Locale,
  application: CandidateApplicationRecord
) {
  if (application.isDraft) {
    return t('applicationCard.summary.draftSaved');
  }

  if (application.nextInterview) {
    const dateLabel = formatLocalizedDateTime(
      application.nextInterview.scheduledAt,
      locale,
      application.nextInterview.timezone
    );

    if (application.nextInterview.candidateResponseStatus === 'confirmed') {
      return t('applicationCard.summary.confirmed', { date: dateLabel });
    }

    if (application.nextInterview.candidateResponseStatus === 'declined') {
      return t('applicationCard.summary.declined', { date: dateLabel });
    }

    return t('applicationCard.summary.pendingInterview', { date: dateLabel });
  }

  if (application.nextAvailableInterviewSlot) {
    return t('applicationCard.summary.availableSlots', {
      date: formatLocalizedDateTime(
        application.nextAvailableInterviewSlot.scheduledAt,
        locale,
        application.nextAvailableInterviewSlot.timezone
      ),
    });
  }

  if (application.currentStage?.label) {
    return t('applicationCard.summary.currentStage', {
      stage: application.currentStage.label,
    });
  }

  if (application.decisionStatus === 'hired') {
    return t('applicationCard.summary.hired');
  }

  if (application.decisionStatus === 'rejected') {
    return t('applicationCard.summary.rejected');
  }

  return t('applicationCard.summary.waitingReview');
}
