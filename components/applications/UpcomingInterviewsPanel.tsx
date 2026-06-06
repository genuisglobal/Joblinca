'use client';

import Link from 'next/link';
import InterviewAttendanceActions from '@/components/applications/InterviewAttendanceActions';
import InterviewCalendarActions from '@/components/interview-scheduling/InterviewCalendarActions';
import { useTranslation } from '@/lib/i18n/context';
import { addLocalePrefix } from '@/lib/i18n/locale';
import type {
  CandidateApplicationRecord,
  CandidateInterviewRecord,
} from '@/lib/applications/dashboard';
import {
  formatLocalizedDateTime,
  translateInterviewMode,
  translateInterviewResponseStatus,
} from '@/lib/i18n/application-presentation';

interface UpcomingInterviewsPanelProps {
  applications: CandidateApplicationRecord[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  maxItems?: number;
  onInterviewUpdated?: (interview: CandidateInterviewRecord) => void;
}

export default function UpcomingInterviewsPanel({
  applications,
  title,
  description,
  emptyMessage,
  maxItems = 3,
  onInterviewUpdated,
}: UpcomingInterviewsPanelProps) {
  const { t, locale } = useTranslation();
  const localize = (href: string) => addLocalePrefix(href, locale);
  const resolvedTitle = title || t('upcomingInterviews.title');
  const resolvedDescription = description || t('upcomingInterviews.description');
  const resolvedEmptyMessage = emptyMessage || t('upcomingInterviews.empty');
  const entries = applications
    .filter((application) => application.nextInterview)
    .sort((left, right) => {
      const leftDate = new Date(left.nextInterview?.scheduledAt || 0).getTime();
      const rightDate = new Date(right.nextInterview?.scheduledAt || 0).getTime();
      return leftDate - rightDate;
    })
    .slice(0, maxItems)
    .map((application) => {
      const interview = application.nextInterview as CandidateInterviewRecord;
      return {
        application,
        interview,
        label: t('upcomingInterviews.scheduledLabel', {
          mode: translateInterviewMode(t, interview.mode),
          date: formatLocalizedDateTime(
            interview.scheduledAt,
            locale,
            interview.timezone
          ),
        }),
        responseLabel: translateInterviewResponseStatus(
          t,
          interview.candidateResponseStatus
        ),
      };
    });

  return (
    <div className="rounded-xl bg-gray-800 p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{resolvedTitle}</h2>
          <p className="mt-1 text-sm text-gray-400">{resolvedDescription}</p>
        </div>
        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-100">
          {t('upcomingInterviews.count', { count: entries.length })}
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
          {resolvedEmptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(({ application, interview, label, responseLabel }) => {
            const prepHref = `/dashboard/job-seeker/interview-prep?application=${application.id}&suggest=scheduled_interview`;

            return (
              <div
                key={interview.id}
                className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {application.job?.title || t('upcomingInterviews.opportunityFallback')}
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      {application.job?.companyName ||
                        t('upcomingInterviews.organizationFallback')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={localize(prepHref)}
                      className="text-sm font-medium text-teal-300 hover:text-teal-200"
                    >
                      {t('upcomingInterviews.prepareInterview')}
                    </Link>
                    {application.job?.id && (
                      <Link
                        href={localize(`/jobs/${application.job.id}`)}
                        className="text-sm text-blue-400 hover:text-blue-300"
                      >
                        {t('upcomingInterviews.viewOpportunity')}
                      </Link>
                    )}
                  </div>
                </div>

                <p className="mt-4 text-sm text-gray-200">{label}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-500">
                  {t('upcomingInterviews.response')}: {responseLabel}
                </p>
                <div className="mt-3 rounded-lg border border-teal-500/20 bg-teal-500/10 p-3 text-sm text-teal-50">
                  {t('upcomingInterviews.prepPack')}
                </div>
                {interview.location && (
                  <p className="mt-2 text-sm text-gray-400">
                    {t('upcomingInterviews.location')}: {interview.location}
                  </p>
                )}
                {interview.meetingUrl &&
                  (() => {
                    const diff = new Date(interview.scheduledAt).getTime() - Date.now();
                    const isImminentOrLive =
                      diff < 30 * 60 * 1000 && diff > -2 * 60 * 60 * 1000;
                    return isImminentOrLive ? (
                      <a
                        href={interview.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-500"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {t('upcomingInterviews.joinMeetingNow')}
                      </a>
                    ) : (
                      <a
                        href={interview.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {t('upcomingInterviews.meetingLinkAvailable')}
                      </a>
                    );
                  })()}
                <InterviewCalendarActions
                  interviewId={interview.id}
                  scheduledAt={interview.scheduledAt}
                  jobTitle={application.job?.title}
                  companyName={application.job?.companyName}
                  modeLabel={translateInterviewMode(t, interview.mode)}
                  location={interview.location}
                  meetingUrl={interview.meetingUrl}
                  notes={interview.notes}
                  compact
                />
                {interview.notes && (
                  <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-950/50 p-3 text-sm text-gray-300">
                    {interview.notes}
                  </p>
                )}
                <InterviewAttendanceActions
                  interview={interview}
                  onUpdated={onInterviewUpdated}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
