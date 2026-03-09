'use client';

import { useMemo } from 'react';
import { buildInterviewCalendarEvent } from '@/lib/interview-scheduling/calendar';

interface InterviewCalendarActionsProps {
  interviewId: string;
  scheduledAt: string;
  jobTitle?: string | null;
  companyName?: string | null;
  modeLabel?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  compact?: boolean;
}

export default function InterviewCalendarActions({
  interviewId,
  scheduledAt,
  jobTitle,
  companyName,
  modeLabel,
  location,
  meetingUrl,
  notes,
  compact = false,
}: InterviewCalendarActionsProps) {
  const calendarEvent = useMemo(
    () =>
      buildInterviewCalendarEvent({
        interviewId,
        scheduledAt,
        jobTitle,
        companyName,
        modeLabel,
        location,
        meetingUrl,
        notes,
      }),
    [companyName, interviewId, jobTitle, location, meetingUrl, modeLabel, notes, scheduledAt]
  );

  const className = compact
    ? 'inline-flex items-center rounded-full border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:border-gray-500 hover:text-white'
    : 'inline-flex items-center rounded-full border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:border-gray-500 hover:text-white';

  return (
    <div className={`mt-3 flex flex-wrap gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <a
        href={calendarEvent.googleCalendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        Google Calendar
      </a>
      <a
        href={calendarEvent.outlookCalendarUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        Outlook
      </a>
      <a href={`/api/interviews/${interviewId}/calendar`} className={className}>
        Download .ics
      </a>
    </div>
  );
}
