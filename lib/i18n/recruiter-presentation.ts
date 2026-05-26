import type { JobInterviewSelfScheduleSettings } from '@/lib/interview-scheduling/self-schedule';
import { WEEKDAY_KEYS } from '@/lib/interview-scheduling/self-schedule';
import type { Locale } from '@/lib/i18n/locale';
import {
  formatLocalizedDate,
  translateInterviewMode,
  type TranslateFn,
} from '@/lib/i18n/application-presentation';
import type {
  InterviewMode,
  InterviewSlotStatus,
} from '@/lib/interview-scheduling/utils';

const RANKING_SUMMARY_KEYS: Record<string, string> = {
  'High priority': 'ranking.priority.high',
  'Mixed priority': 'ranking.priority.mixed',
  'Lower priority': 'ranking.priority.low',
};

const RANKING_SIGNAL_KEYS: Record<string, string> = {
  'Hired decision recorded': 'ranking.signal.decisionHired',
  'Rejected decision recorded': 'ranking.signal.decisionRejected',
  'Candidate withdrew': 'ranking.signal.candidateWithdrawn',
  'Eligibility confirmed': 'ranking.signal.eligibilityConfirmed',
  'Eligibility needs review': 'ranking.signal.eligibilityNeedsReview',
  'Eligibility blocked': 'ranking.signal.eligibilityBlocked',
  'Strong reviewer recommendation': 'ranking.signal.feedbackStrongRecommendation',
  'Positive reviewer recommendation': 'ranking.signal.feedbackPositiveRecommendation',
  'Strong reviewer concern': 'ranking.signal.feedbackStrongConcern',
  'Reviewer concern logged': 'ranking.signal.feedbackConcern',
  'Strong stage feedback': 'ranking.signal.stageStrong',
  'Solid stage feedback': 'ranking.signal.stageSolid',
  'High recruiter rating': 'ranking.signal.ratingHigh',
  'Recruiter rating recorded': 'ranking.signal.ratingRecorded',
  'Strong AI match': 'ranking.signal.aiStrong',
  'AI alignment detected': 'ranking.signal.aiAlignment',
  'Weak AI alignment': 'ranking.signal.aiWeak',
  'Complete application pack': 'ranking.signal.completenessComplete',
  'Profile detail provided': 'ranking.signal.completenessProvided',
  'Thin application pack': 'ranking.signal.completenessThin',
  'Recent applicant': 'ranking.signal.recencyRecent',
  'Advanced pipeline progress': 'ranking.signal.stageProgressAdvanced',
  'Still early in pipeline': 'ranking.signal.stageEarly',
};

const MATCH_SCORE_LABEL_KEYS: Record<string, string> = {
  'High match': 'matchInsights.label.high',
  'Moderate match': 'matchInsights.label.moderate',
  'Low match': 'matchInsights.label.low',
};

const INTERVIEW_SLOT_STATUS_KEYS: Record<InterviewSlotStatus, string> = {
  available: 'interviewSlotStatus.available',
  booked: 'interviewSlotStatus.booked',
  cancelled: 'interviewSlotStatus.cancelled',
};

const ELIGIBLE_ROLE_SUMMARY_KEYS: Record<string, string> = {
  'Talent profiles': 'common.talentProfiles',
  'Job seeker profiles': 'common.jobSeekerProfiles',
  'Job seeker and talent profiles': 'common.jobSeekerAndTalentProfiles',
};

export function translateRankingSummaryLabel(t: TranslateFn, label: string) {
  const key = RANKING_SUMMARY_KEYS[label];
  return key ? t(key) : label;
}

export function translateRankingSignalLabel(t: TranslateFn, label: string) {
  const key = RANKING_SIGNAL_KEYS[label];
  return key ? t(key) : label;
}

export function translateMatchScoreLabel(t: TranslateFn, label: string) {
  const key = MATCH_SCORE_LABEL_KEYS[label];
  return key ? t(key) : label;
}

export function translateInterviewSlotStatus(
  t: TranslateFn,
  status: InterviewSlotStatus
) {
  return t(INTERVIEW_SLOT_STATUS_KEYS[status]);
}

export function translateEligibleRoleSummary(t: TranslateFn, summary: string) {
  const key = ELIGIBLE_ROLE_SUMMARY_KEYS[summary];
  return key ? t(key) : summary;
}

export function formatWeeklyAvailabilitySummaryLocalized(
  t: TranslateFn,
  settings: JobInterviewSelfScheduleSettings
) {
  const openDays = WEEKDAY_KEYS.filter((day) => settings.weeklyAvailability[day].enabled);

  if (openDays.length === 0) {
    return t('selfSchedule.summary.noAvailability');
  }

  return openDays
    .map((day) => {
      const window = settings.weeklyAvailability[day];
      return `${t(`weekday.short.${day}`)} ${window.startTime}-${window.endTime}`;
    })
    .join(' | ');
}

export function formatBlackoutDateSummaryLocalized(
  t: TranslateFn,
  locale: Locale,
  settings: JobInterviewSelfScheduleSettings
) {
  if (settings.blackoutDates.length === 0) {
    return t('selfSchedule.summary.noBlackoutDates');
  }

  const labels = settings.blackoutDates
    .slice(0, 3)
    .map((value) => formatLocalizedDate(value, locale) || value);

  if (settings.blackoutDates.length <= 3) {
    return labels.join(' | ');
  }

  return `${labels.join(' | ')} | ${t('selfSchedule.summary.moreDates', {
    count: settings.blackoutDates.length - 3,
  })}`;
}

export function translateInterviewModeOption(
  t: TranslateFn,
  mode: InterviewMode
) {
  return translateInterviewMode(t, mode);
}
