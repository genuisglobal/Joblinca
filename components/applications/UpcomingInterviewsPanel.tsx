'use client';

import Link from 'next/link';
import InterviewAttendanceActions from '@/components/applications/InterviewAttendanceActions';
import InterviewCalendarActions from '@/components/interview-scheduling/InterviewCalendarActions';
import type {
  CandidateApplicationRecord,
  CandidateInterviewRecord,
} from '@/lib/applications/dashboard';
import {
  getUpcomingInterviewEntries,
} from '@/lib/applications/dashboard';
import { getInterviewModeLabel } from '@/lib/interview-scheduling/utils';

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
  title = 'Upcoming Interviews',
  description = 'Your next confirmed interviews and candidate instructions.',
  emptyMessage = 'No interview has been scheduled yet.',
  maxItems = 3,
  onInterviewUpdated,
}: UpcomingInterviewsPanelProps) {
  const entries = getUpcomingInterviewEntries(applications, maxItems);

  return (
    <div className="rounded-xl bg-gray-800 p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-gray-400">{description}</p>
        </div>
        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-100">
          {entries.length} upcoming
        </span>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
          {emptyMessage}
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(({ application, interview, label, responseLabel }) => (
            <div
              key={interview.id}
              className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {application.job?.title || 'Opportunity'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    {application.job?.companyName || 'Organization'}
                  </p>
                </div>
                {application.job?.id && (
                  <Link
                    href={`/jobs/${application.job.id}`}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    View opportunity
                  </Link>
                )}
              </div>

              <p className="mt-4 text-sm text-gray-200">{label}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.2em] text-gray-500">
                Response: {responseLabel}
              </p>
              {interview.location && (
                <p className="mt-2 text-sm text-gray-400">Location: {interview.location}</p>
              )}
              {interview.meetingUrl && (
                <a
                  href={interview.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-sm text-blue-400 hover:text-blue-300"
                >
                  Open meeting link
                </a>
              )}
              <InterviewCalendarActions
                interviewId={interview.id}
                scheduledAt={interview.scheduledAt}
                jobTitle={application.job?.title}
                companyName={application.job?.companyName}
                modeLabel={getInterviewModeLabel(interview.mode)}
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
          ))}
        </div>
      )}
    </div>
  );
}
