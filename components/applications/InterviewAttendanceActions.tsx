'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CandidateInterviewRecord } from '@/lib/applications/dashboard';
import { getInterviewResponseStatusLabel } from '@/lib/interview-scheduling/utils';

interface InterviewAttendanceActionsProps {
  interview: CandidateInterviewRecord;
  onUpdated?: (interview: CandidateInterviewRecord) => void;
}

function getResponseTone(status: CandidateInterviewRecord['candidateResponseStatus']) {
  switch (status) {
    case 'confirmed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100';
    case 'declined':
      return 'border-red-500/30 bg-red-500/10 text-red-100';
    default:
      return 'border-amber-500/30 bg-amber-500/10 text-amber-100';
  }
}

function normalizeInterviewResponse(row: any): CandidateInterviewRecord {
  return {
    id: row.id,
    applicationId: row.applicationId || row.application_id,
    scheduledAt: row.scheduledAt || row.scheduled_at,
    timezone: row.timezone || 'UTC',
    mode: row.mode || 'video',
    location: row.location || null,
    meetingUrl: row.meetingUrl || row.meeting_url || null,
    notes: row.notes || null,
    status: row.status || 'scheduled',
    candidateResponseStatus: row.candidateResponseStatus || row.candidate_response_status || 'pending',
    candidateRespondedAt: row.candidateRespondedAt || row.candidate_responded_at || null,
    candidateResponseNote: row.candidateResponseNote || row.candidate_response_note || null,
    confirmationSentAt: row.confirmationSentAt || row.confirmation_sent_at || null,
    reminderSentAt: row.reminderSentAt || row.reminder_sent_at || null,
  };
}

export default function InterviewAttendanceActions({
  interview,
  onUpdated,
}: InterviewAttendanceActionsProps) {
  const router = useRouter();
  const [responseStatus, setResponseStatus] = useState(interview.candidateResponseStatus);
  const [note, setNote] = useState(interview.candidateResponseNote || '');
  const [respondedAt, setRespondedAt] = useState(interview.candidateRespondedAt);
  const [submitting, setSubmitting] = useState<'confirmed' | 'declined' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const responseTone = useMemo(() => getResponseTone(responseStatus), [responseStatus]);

  async function submitResponse(nextStatus: 'confirmed' | 'declined') {
    setSubmitting(nextStatus);
    setMessage(null);

    try {
      const response = await fetch(`/api/interviews/${interview.id}/candidate-response`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          responseStatus: nextStatus,
          note,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to save interview response');
      }

      const updatedInterview = normalizeInterviewResponse(payload.interview);
      setResponseStatus(updatedInterview.candidateResponseStatus);
      setRespondedAt(updatedInterview.candidateRespondedAt);
      setNote(updatedInterview.candidateResponseNote || '');
      setMessage({
        type: 'success',
        text:
          nextStatus === 'confirmed'
            ? 'Attendance confirmed.'
            : 'The recruiter has been told that you cannot attend this slot.',
      });

      if (onUpdated) {
        onUpdated(updatedInterview);
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error ? error.message : 'Failed to save interview response',
      });
    } finally {
      setSubmitting(null);
    }
  }

  if (interview.status !== 'scheduled') {
    return null;
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-700 bg-gray-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            Attendance response
          </p>
          <p className="mt-2 text-sm text-gray-300">
            Let the recruiter know whether you can attend this interview slot.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${responseTone}`}
        >
          {getInterviewResponseStatusLabel(responseStatus)}
        </span>
      </div>

      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        placeholder="Optional note for the recruiter"
        className="mt-3 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => submitResponse('confirmed')}
          disabled={Boolean(submitting)}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {submitting === 'confirmed' ? 'Saving...' : 'Confirm attendance'}
        </button>
        <button
          type="button"
          onClick={() => submitResponse('declined')}
          disabled={Boolean(submitting)}
          className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting === 'declined' ? 'Saving...' : "Can't attend"}
        </button>
      </div>

      {respondedAt && (
        <p className="mt-3 text-xs text-gray-500">
          Last updated {new Date(respondedAt).toLocaleString()}
        </p>
      )}

      {message && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : 'border-red-500/30 bg-red-500/10 text-red-100'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
