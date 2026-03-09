'use client';

import Link from 'next/link';
import InterviewSlotBookingPanel from '@/components/applications/InterviewSlotBookingPanel';
import InterviewCalendarActions from '@/components/interview-scheduling/InterviewCalendarActions';
import StageBadge from '@/components/hiring-pipeline/StageBadge';
import StatusBadge from '@/app/dashboard/components/StatusBadge';
import {
  formatDecisionLabel,
  getDecisionTone,
} from '@/lib/hiring-pipeline/presentation';
import {
  formatInterviewDateTimeLabel,
  getInterviewModeLabel,
  getInterviewResponseStatusLabel,
  getInterviewStatusLabel,
} from '@/lib/interview-scheduling/utils';
import {
  getApplicationDisplayStatus,
  getApplicationOpportunityLabel,
  getApplicationProgressSummary,
  type CandidateInterviewRecord,
  type CandidateInterviewSlotRecord,
  type CandidateApplicationRecord,
} from '@/lib/applications/dashboard';

interface ApplicationProgressCardProps {
  application: CandidateApplicationRecord;
  compact?: boolean;
  onInterviewBooked?: (params: {
    slot: CandidateInterviewSlotRecord;
    interview: CandidateInterviewRecord;
  }) => void;
}

function formatDate(date: string | null | undefined) {
  if (!date) {
    return 'Not available';
  }

  return new Date(date).toLocaleDateString();
}

export default function ApplicationProgressCard({
  application,
  compact = false,
  onInterviewBooked,
}: ApplicationProgressCardProps) {
  const opportunityLabel = getApplicationOpportunityLabel(application);
  const displayStatus = getApplicationDisplayStatus(application);
  const decisionTone = getDecisionTone(application.decisionStatus || 'active');
  const primaryHref =
    application.isDraft && application.job?.id
      ? `/jobs/${application.job.id}/apply`
      : application.job?.id
        ? `/jobs/${application.job.id}`
        : '#';

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
                {formatDecisionLabel(application.decisionStatus)}
              </span>
            )}
            <StatusBadge status={displayStatus} />
          </div>

          <h3 className={`${compact ? 'text-base' : 'text-lg'} font-semibold text-white`}>
            {application.job?.title || 'Opportunity'}
          </h3>
          <p className="text-gray-400">
            {application.job?.companyName || 'Organization'}
          </p>

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-400">
            {application.job?.location && <span>{application.job.location}</span>}
            {application.job?.workType && (
              <span className="capitalize">{application.job.workType}</span>
            )}
            <span>Applied {formatDate(application.createdAt)}</span>
            {!application.isDraft && application.stageEnteredAt && (
              <span>Stage updated {formatDate(application.stageEnteredAt)}</span>
            )}
          </div>

          <p className="mt-4 text-sm text-gray-300">
            {getApplicationProgressSummary(application)}
          </p>

          {application.nextInterview && (
            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
                    Upcoming Interview
                  </p>
                  <p className="mt-2 text-sm font-medium text-white">
                    {formatInterviewDateTimeLabel(
                      application.nextInterview.scheduledAt,
                      application.nextInterview.timezone
                    )}
                  </p>
                  <p className="mt-1 text-sm text-blue-100/80">
                    {getInterviewModeLabel(application.nextInterview.mode)}
                    {application.nextInterview.location
                      ? ` · ${application.nextInterview.location}`
                      : ''}
                  </p>
                </div>
                <span className="rounded-full border border-blue-400/30 px-3 py-1 text-xs font-medium text-blue-100">
                  {getInterviewStatusLabel(application.nextInterview.status)}
                </span>
              </div>

              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-blue-100/70">
                Attendance: {getInterviewResponseStatusLabel(application.nextInterview.candidateResponseStatus)}
              </p>

              {application.nextInterview.candidateResponseNote && !compact && (
                <p className="mt-2 rounded-lg bg-gray-900/60 p-3 text-sm text-gray-300">
                  {application.nextInterview.candidateResponseNote}
                </p>
              )}

              {application.nextInterview.meetingUrl && (
                <a
                  href={application.nextInterview.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-sm text-blue-300 hover:text-blue-200"
                >
                  Open meeting link
                </a>
              )}
              <InterviewCalendarActions
                interviewId={application.nextInterview.id}
                scheduledAt={application.nextInterview.scheduledAt}
                jobTitle={application.job?.title}
                companyName={application.job?.companyName}
                modeLabel={getInterviewModeLabel(application.nextInterview.mode)}
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
                View Cover Letter
              </summary>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-900 p-4 text-sm text-gray-300">
                {application.coverLetter}
              </p>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href={primaryHref}
            className="rounded-lg bg-gray-700 px-4 py-2 text-center text-sm text-white transition-colors hover:bg-gray-600"
          >
            {application.isDraft ? 'Continue Draft' : 'View Opportunity'}
          </Link>
        </div>
      </div>
    </div>
  );
}
