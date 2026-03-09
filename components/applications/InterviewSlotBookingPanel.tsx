'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CandidateInterviewRecord,
  CandidateInterviewSlotRecord,
} from '@/lib/applications/dashboard';
import {
  formatInterviewDateTimeLabel,
  getInterviewModeLabel,
} from '@/lib/interview-scheduling/utils';

interface InterviewSlotBookingPanelProps {
  slots: CandidateInterviewSlotRecord[];
  onBooked?: (params: {
    slot: CandidateInterviewSlotRecord;
    interview: CandidateInterviewRecord;
  }) => void;
}

function normalizeInterview(row: any): CandidateInterviewRecord {
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

function normalizeSlot(row: any): CandidateInterviewSlotRecord {
  return {
    id: row.id,
    applicationId: row.applicationId || row.application_id,
    scheduledAt: row.scheduledAt || row.scheduled_at,
    timezone: row.timezone || 'UTC',
    mode: row.mode || 'video',
    location: row.location || null,
    meetingUrl: row.meetingUrl || row.meeting_url || null,
    notes: row.notes || null,
    status: row.status || 'available',
    bookedInterviewId: row.bookedInterviewId || row.booked_interview_id || null,
    invitationSentAt: row.invitationSentAt || row.invitation_sent_at || null,
  };
}

export default function InterviewSlotBookingPanel({
  slots,
  onBooked,
}: InterviewSlotBookingPanelProps) {
  const router = useRouter();
  const [bookingSlotId, setBookingSlotId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const availableSlots = slots.filter((slot) => slot.status === 'available').slice(0, 3);

  if (availableSlots.length === 0) {
    return null;
  }

  async function handleBook(slotId: string) {
    setBookingSlotId(slotId);
    setMessage(null);

    try {
      const response = await fetch(`/api/interview-slots/${slotId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to book interview slot');
      }

      const slot = normalizeSlot(payload.slot);
      const interview = normalizeInterview(payload.interview);

      setMessage({
        type: 'success',
        text: payload.notifications?.delivered
          ? 'Interview booked and confirmation sent.'
          : 'Interview booked.',
      });

      if (onBooked) {
        onBooked({ slot, interview });
      } else {
        router.refresh();
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to book interview slot',
      });
    } finally {
      setBookingSlotId(null);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/80">
            Self-schedule
          </p>
          <p className="mt-2 text-sm text-indigo-100/90">
            Choose one of the available interview slots below.
          </p>
        </div>
        <span className="rounded-full border border-indigo-400/30 px-3 py-1 text-xs font-medium text-indigo-100">
          {availableSlots.length} open
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {availableSlots.map((slot) => (
          <div
            key={slot.id}
            className="rounded-lg border border-indigo-500/20 bg-gray-900/40 p-3"
          >
            <p className="text-sm font-medium text-white">
              {formatInterviewDateTimeLabel(slot.scheduledAt, slot.timezone)}
            </p>
            <p className="mt-1 text-sm text-indigo-100/80">
              {getInterviewModeLabel(slot.mode)}
              {slot.location ? ` · ${slot.location}` : ''}
            </p>
            {slot.notes && (
              <p className="mt-2 text-sm text-gray-300">{slot.notes}</p>
            )}
            <button
              type="button"
              onClick={() => handleBook(slot.id)}
              disabled={bookingSlotId === slot.id}
              className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {bookingSlotId === slot.id ? 'Booking...' : 'Book this slot'}
            </button>
          </div>
        ))}
      </div>

      {message && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
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
