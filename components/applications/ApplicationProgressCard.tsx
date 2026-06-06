'use client';

import Link from 'next/link';
import InterviewSlotBookingPanel from '@/components/applications/InterviewSlotBookingPanel';
import InterviewCalendarActions from '@/components/interview-scheduling/InterviewCalendarActions';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import StatusBadge from '@/app/dashboard/components/StatusBadge';
import { getDecisionTone } from '@/lib/hiring-pipeline/presentation';
import type {
  CandidateInterviewRecord,
  CandidateInterviewSlotRecord,
  CandidateApplicationRecord,
} from '@/lib/applications/dashboard';
import { useTranslation } from '@/lib/i18n/context';
import { addLocalePrefix } from '@/lib/i18n/locale';
import {
  buildApplicationProgressSummary,
  formatLocalizedDate,
  formatLocalizedDateTime,
  translateDecisionStatus,
  translateInterviewMode,
  translateInterviewResponseStatus,
  translateInterviewStatus,
  translateOpportunityLabel,
  translateReadinessTrend,
} from '@/lib/i18n/application-presentation';

interface ApplicationProgressCardProps {
  application: CandidateApplicationRecord;
  compact?: boolean;
  onInterviewBooked?: (params: {
    slot: CandidateInterviewSlotRecord;
    interview: CandidateInterviewRecord;
  }) => void;
}

function getReadinessTone(score: number | null) {
  if (score === null) {
    return 'border-gray-700 bg-gray-900/60 text-gray-300';
  }

  if (score >= 80) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100';
  }

  if (score >= 60) {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-100';
  }

  return 'border-red-500/20 bg-red-500/10 text-red-100';
}

export default function ApplicationProgressCard({
  application,
  compact = false,
  onInterviewBooked,
}: ApplicationProgressCardProps) {
  const { t, locale } = useTranslation();
  const localize = (href: string) => addLocalePrefix(href, locale);
  const opportunityLabel = translateOpportunityLabel(
    t,
    application.job?.jobType || null,
    application.job?.internshipTrack || null
  );
  const displayStatus =
    application.isDraft
      ? 'draft'
      : application.decisionStatus === 'hired' ||
          application.decisionStatus === 'rejected' ||
          application.decisionStatus === 'withdrawn'
        ? application.decisionStatus
        : application.status;
  const decisionTone = getDecisionTone(application.decisionStatus || 'active');
  const primaryHref =
    application.isDraft && application.job?.id
      ? localize(`/jobs/${application.job.id}/apply`)
      : application.job?.id
        ? localize(`/jobs/${application.job.id}`)
        : '#';
  const interviewPrepHref = localize(
    `/dashboard/job-seeker/interview-prep?application=${application.id}${
      application.nextInterview ? '&suggest=scheduled_interview' : '&suggest=application'
    }`
  );
  const progressSummary = buildApplicationProgressSummary(t, locale, application);
  const appliedDate =
    formatLocalizedDate(application.createdAt, locale) ||
    t('applicationCard.dateUnavailable');
  const stageUpdatedDate =
    formatLocalizedDate(application.stageEnteredAt, locale) ||
    t('applicationCard.dateUnavailable');

  return (
    <div
      className={`rounded-xl border border-gray-700 bg-gray-800 ${
        compact ? 'p-4' : 'p-6'
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-gray-600 bg-gray-700/50 px-3 py-1 text-xs font-medium text-gray-200">
              {opportunityLabel}
            </span>
            {application.currentStage && !application.isDraft && (
              <StageBadge
                label={application.currentStage.label}
                stageType={application.currentStage.stageType}
              />
            )}
            {!application.isDraft && application.decisionStatus && (
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${decisionTone.bg} ${decisionTone.text} ${decisionTone.border}`}
              >
                {translateDecisionStatus(t, application.decisionStatus)}
              </span>
            )}
            <StatusBadge status={displayStatus} />
          </div>

          <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-white`}>
            {application.job?.title || t('applicationCard.opportunityFallback')}
          </h3>
          <p className="text-gray-400">
            {application.job?.companyName || t('applicationCard.organizationFallback')}
          </p>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
            {application.job?.location && <span>{application.job.location}</span>}
            {application.job?.workType && (
              <span className="capitalize">{application.job.workType}</span>
            )}
            <span>{t('applicationCard.appliedOn', { date: appliedDate })}</span>
            {!application.isDraft && application.stageEnteredAt && (
              <span>{t('applicationCard.stageUpdated', { date: stageUpdatedDate })}</span>
            )}
          </div>

          <p className="mt-4 text-sm text-gray-300">{progressSummary}</p>

          {!application.isDraft && (
            <div
              className={`mt-4 rounded-xl border ${compact ? 'p-3' : 'p-4'} ${getReadinessTone(
                application.interviewPrepReadiness?.latestScore || null
              )}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                    {t('applicationCard.readiness.title')}
                  </p>
                  {application.interviewPrepReadiness ? (
                    <p className={`mt-2 ${compact ? 'text-xs' : 'text-sm'}`}>
                      {t('applicationCard.readiness.latestScore', {
                        score:
                          application.interviewPrepReadiness.latestScore ??
                          t('applicationCard.dateUnavailable'),
                        count: application.interviewPrepReadiness.attemptCount,
                        label:
                          application.interviewPrepReadiness.attemptCount === 1
                            ? t('applicationCard.readiness.answerSingular')
                            : t('applicationCard.readiness.answerPlural'),
                      })}
                    </p>
                  ) : (
                    <p className={`mt-2 ${compact ? 'text-xs' : 'text-sm'}`}>
                      {t('applicationCard.readiness.noScores')}
                    </p>
                  )}
                </div>
                {application.interviewPrepReadiness && (
                  <div className="text-right">
                    <p className={`${compact ? 'text-base' : 'text-lg'} font-semibold`}>
                      {application.interviewPrepReadiness.latestScore !== null
                        ? `${application.interviewPrepReadiness.latestScore}/100`
                        : t('applicationCard.dateUnavailable')}
                    </p>
                    {translateReadinessTrend(t, application.interviewPrepReadiness.trend) && (
                      <p className="text-xs opacity-80">
                        {translateReadinessTrend(t, application.interviewPrepReadiness.trend)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {application.interviewPrepReadiness?.weakestAreaLabel && (
                <p className={`mt-3 ${compact ? 'text-[11px]' : 'text-xs'} opacity-80`}>
                  {t('applicationCard.readiness.weakestArea', {
                    label: application.interviewPrepReadiness.weakestAreaLabel,
                  })}
                  {application.interviewPrepReadiness.weakestAreaAverage !== null
                    ? ` (${application.interviewPrepReadiness.weakestAreaAverage}/5)`
                    : ''}
                </p>
              )}
            </div>
          )}

          {application.nextInterview && (
            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
                    {t('applicationCard.upcomingInterview')}
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {formatLocalizedDateTime(
                      application.nextInterview.scheduledAt,
                      locale,
                      application.nextInterview.timezone
                    )}
                  </p>
                  <p className="mt-1 text-sm text-blue-100/80">
                    {translateInterviewMode(t, application.nextInterview.mode)}
                    {application.nextInterview.location
                      ? ` - ${application.nextInterview.location}`
                      : ''}
                  </p>
                </div>
                <span className="rounded-full border border-blue-400/30 px-3 py-1 text-xs font-medium text-blue-100">
                  {translateInterviewStatus(t, application.nextInterview.status)}
                </span>
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-blue-100/70">
                {t('applicationCard.attendance')}:{' '}
                {translateInterviewResponseStatus(
                  t,
                  application.nextInterview.candidateResponseStatus
                )}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={interviewPrepHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500"
                >
                  {t('applicationCard.prepareInterview')}
                </Link>
                {application.nextInterview.meetingUrl && (
                  <a
                    href={application.nextInterview.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-lg border border-blue-400/20 px-3.5 py-2 text-sm text-blue-200 transition-colors hover:border-blue-300/40 hover:text-blue-100"
                  >
                    {t('applicationCard.openMeetingLink')}
                  </a>
                )}
              </div>

              {application.nextInterview.candidateResponseNote && !compact && (
                <p className="mt-3 rounded-lg bg-gray-900/60 p-3 text-sm text-gray-300">
                  {application.nextInterview.candidateResponseNote}
                </p>
              )}

              <InterviewCalendarActions
                interviewId={application.nextInterview.id}
                scheduledAt={application.nextInterview.scheduledAt}
                jobTitle={application.job?.title}
                companyName={application.job?.companyName}
                modeLabel={translateInterviewMode(t, application.nextInterview.mode)}
                location={application.nextInterview.location}
                meetingUrl={application.nextInterview.meetingUrl}
                notes={application.nextInterview.notes}
                compact={compact}
              />

              {!compact && application.nextInterview.notes && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-900/60 p-3 text-sm text-gray-300">
                  {application.nextInterview.notes}
                </p>
              )}
            </div>
          )}

          {!compact && !application.nextInterview && application.interviewSlots.length > 0 && (
            <InterviewSlotBookingPanel
              slots={application.interviewSlots}
              onBooked={onInterviewBooked}
            />
          )}

          {!compact && application.coverLetter && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300">
                {t('applicationCard.viewCoverLetter')}
              </summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-900 p-4 text-sm text-gray-300">
                {application.coverLetter}
              </p>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {!application.isDraft && !application.nextInterview && (
            <Link
              href={interviewPrepHref}
              className="rounded-lg bg-teal-600 px-4 py-2 text-center text-sm text-white transition-colors hover:bg-teal-500"
            >
              {t('applicationCard.interviewPrep')}
            </Link>
          )}
          <Link
            href={primaryHref}
            className="rounded-lg bg-gray-700 px-4 py-2 text-center text-sm text-white transition-colors hover:bg-gray-600"
          >
            {application.isDraft
              ? t('applicationCard.continueDraft')
              : t('applicationCard.viewOpportunity')}
          </Link>
        </div>
      </div>
    </div>
  );
}
