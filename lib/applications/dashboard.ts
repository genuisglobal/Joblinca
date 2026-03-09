import type { ApplicationCurrentStage } from '@/lib/hiring-pipeline/types';
import {
  formatInterviewDateTimeLabel,
  getInterviewResponseStatusLabel,
  getInterviewModeLabel,
  normalizeInterviewResponseStatus,
  normalizeInterviewSlotStatus,
} from '@/lib/interview-scheduling/utils';
import { getOpportunityTypeLabel } from '@/lib/opportunities';

type Relation<T> = T | T[] | null | undefined;

export interface CandidateApplicationJob {
  id: string | null;
  title: string | null;
  companyName: string | null;
  location: string | null;
  workType: string | null;
  jobType: string | null;
  internshipTrack: string | null;
}

export interface CandidateApplicationRecord {
  id: string;
  status: string;
  isDraft: boolean;
  createdAt: string;
  stageEnteredAt: string | null;
  decisionStatus: string | null;
  coverLetter: string | null;
  currentStage: ApplicationCurrentStage | null;
  job: CandidateApplicationJob | null;
  interviews: CandidateInterviewRecord[];
  nextInterview: CandidateInterviewRecord | null;
  interviewSlots: CandidateInterviewSlotRecord[];
  nextAvailableInterviewSlot: CandidateInterviewSlotRecord | null;
}

export interface CandidateInterviewRecord {
  id: string;
  applicationId: string;
  scheduledAt: string;
  timezone: string;
  mode: 'video' | 'phone' | 'onsite' | 'other';
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  candidateResponseStatus: 'pending' | 'confirmed' | 'declined';
  candidateRespondedAt: string | null;
  candidateResponseNote: string | null;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
}

export interface CandidateInterviewSlotRecord {
  id: string;
  applicationId: string;
  scheduledAt: string;
  timezone: string;
  mode: 'video' | 'phone' | 'onsite' | 'other';
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  status: 'available' | 'booked' | 'cancelled';
  bookedInterviewId: string | null;
  invitationSentAt: string | null;
}

export function normalizeRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export function normalizeApplicationRow(row: any): CandidateApplicationRecord {
  const currentStage = normalizeRelation(row.current_stage);
  const job = normalizeRelation(row.jobs);

  return {
    id: row.id,
    status: row.status || 'submitted',
    isDraft: Boolean(row.is_draft),
    createdAt: row.created_at,
    stageEnteredAt: row.stage_entered_at || null,
    decisionStatus: row.decision_status || null,
    coverLetter: row.cover_letter || null,
    currentStage: currentStage
      ? {
          id: currentStage.id,
          stageKey: currentStage.stage_key,
          label: currentStage.label,
          stageType: currentStage.stage_type,
          orderIndex: currentStage.order_index,
          isTerminal: currentStage.is_terminal,
          allowsFeedback: currentStage.allows_feedback,
        }
      : null,
    job: job
      ? {
          id: job.id || null,
          title: job.title || null,
          companyName: job.company_name || null,
          location: job.location || null,
          workType: job.work_type || null,
          jobType: job.job_type || null,
          internshipTrack: job.internship_track || null,
        }
      : null,
    interviews: [],
    nextInterview: null,
    interviewSlots: [],
    nextAvailableInterviewSlot: null,
  };
}

export function normalizeInterviewRow(row: any): CandidateInterviewRecord {
  return {
    id: row.id,
    applicationId: row.application_id,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone || 'UTC',
    mode: row.mode || 'video',
    location: row.location || null,
    meetingUrl: row.meeting_url || null,
    notes: row.notes || null,
    status: row.status || 'scheduled',
    candidateResponseStatus: normalizeInterviewResponseStatus(row.candidate_response_status),
    candidateRespondedAt: row.candidate_responded_at || null,
    candidateResponseNote: row.candidate_response_note || null,
    confirmationSentAt: row.confirmation_sent_at || null,
    reminderSentAt: row.reminder_sent_at || null,
  };
}

export function normalizeInterviewSlotRow(row: any): CandidateInterviewSlotRecord {
  return {
    id: row.id,
    applicationId: row.application_id,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone || 'UTC',
    mode: row.mode || 'video',
    location: row.location || null,
    meetingUrl: row.meeting_url || null,
    notes: row.notes || null,
    status: normalizeInterviewSlotStatus(row.status),
    bookedInterviewId: row.booked_interview_id || null,
    invitationSentAt: row.invitation_sent_at || null,
  };
}

export function attachInterviewsToApplications(
  applications: CandidateApplicationRecord[],
  interviews: CandidateInterviewRecord[]
) {
  const interviewsByApplication = new Map<string, CandidateInterviewRecord[]>();

  for (const interview of interviews) {
    const current = interviewsByApplication.get(interview.applicationId) || [];
    current.push(interview);
    interviewsByApplication.set(interview.applicationId, current);
  }

  return applications.map((application) => {
    const applicationInterviews = (interviewsByApplication.get(application.id) || []).sort(
      (left, right) =>
        new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
    );
    const nextInterview =
      applicationInterviews.find((interview) => interview.status === 'scheduled') || null;

    return {
      ...application,
      interviews: applicationInterviews,
      nextInterview,
      interviewSlots: application.interviewSlots || [],
      nextAvailableInterviewSlot: application.nextAvailableInterviewSlot || null,
    };
  });
}

export function attachInterviewSlotsToApplications(
  applications: CandidateApplicationRecord[],
  slots: CandidateInterviewSlotRecord[]
) {
  const slotsByApplication = new Map<string, CandidateInterviewSlotRecord[]>();

  for (const slot of slots) {
    const current = slotsByApplication.get(slot.applicationId) || [];
    current.push(slot);
    slotsByApplication.set(slot.applicationId, current);
  }

  return applications.map((application) => {
    const applicationSlots = (slotsByApplication.get(application.id) || [])
      .sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      );
    const nextAvailableInterviewSlot =
      applicationSlots.find((slot) => slot.status === 'available') || null;

    return {
      ...application,
      interviewSlots: applicationSlots,
      nextAvailableInterviewSlot,
    };
  });
}

export function getApplicationDisplayStatus(application: CandidateApplicationRecord) {
  if (application.isDraft) {
    return 'draft';
  }

  if (
    application.decisionStatus === 'hired' ||
    application.decisionStatus === 'rejected' ||
    application.decisionStatus === 'withdrawn'
  ) {
    return application.decisionStatus;
  }

  return application.status;
}

export function getApplicationOpportunityLabel(application: CandidateApplicationRecord) {
  return getOpportunityTypeLabel(
    application.job?.jobType || null,
    application.job?.internshipTrack || null
  );
}

export function isApplicationActive(application: CandidateApplicationRecord) {
  if (application.isDraft) {
    return false;
  }

  return !application.decisionStatus || application.decisionStatus === 'active';
}

export function countApplicationsAtStageTypes(
  applications: CandidateApplicationRecord[],
  stageTypes: string[]
) {
  return applications.filter((application) => {
    if (!isApplicationActive(application)) {
      return false;
    }

    return stageTypes.includes(application.currentStage?.stageType || '');
  }).length;
}

export function countApplicationsByOpportunityLabel(
  applications: CandidateApplicationRecord[],
  label: string
) {
  return applications.filter((application) => {
    return getApplicationOpportunityLabel(application) === label;
  }).length;
}

export function getApplicationProgressSummary(application: CandidateApplicationRecord) {
  if (application.isDraft) {
    return 'Draft saved. Continue your application when you are ready.';
  }

  if (application.nextInterview) {
    const dateLabel = formatInterviewDateTimeLabel(
      application.nextInterview.scheduledAt,
      application.nextInterview.timezone
    );

    if (application.nextInterview.candidateResponseStatus === 'confirmed') {
      return `Interview confirmed for ${dateLabel}.`;
    }

    if (application.nextInterview.candidateResponseStatus === 'declined') {
      return `Interview scheduled for ${dateLabel}. You told the recruiter that you cannot attend this slot.`;
    }

    return `Upcoming interview scheduled for ${dateLabel}. Confirm or decline attendance from your interview panel.`;
  }

  if (application.nextAvailableInterviewSlot) {
    return `Interview slots are available. Choose a time for ${formatInterviewDateTimeLabel(
      application.nextAvailableInterviewSlot.scheduledAt,
      application.nextAvailableInterviewSlot.timezone
    )} or later.`;
  }

  if (application.currentStage?.label) {
    return `Current stage: ${application.currentStage.label}.`;
  }

  if (application.decisionStatus === 'hired') {
    return 'Outcome recorded: hired.';
  }

  if (application.decisionStatus === 'rejected') {
    return 'Outcome recorded: rejected.';
  }

  return 'Submitted and waiting for recruiter review.';
}

export function countUpcomingInterviews(applications: CandidateApplicationRecord[]) {
  return applications.filter((application) => Boolean(application.nextInterview)).length;
}

export function getUpcomingInterviewEntries(
  applications: CandidateApplicationRecord[],
  limit?: number
) {
  const entries = applications
    .filter((application) => application.nextInterview)
    .sort((left, right) => {
      const leftDate = new Date(left.nextInterview?.scheduledAt || 0).getTime();
      const rightDate = new Date(right.nextInterview?.scheduledAt || 0).getTime();
      return leftDate - rightDate;
    })
    .map((application) => ({
      application,
      interview: application.nextInterview as CandidateInterviewRecord,
      label: `${getInterviewModeLabel(application.nextInterview?.mode || 'video')} on ${formatInterviewDateTimeLabel(
        application.nextInterview?.scheduledAt || '',
        application.nextInterview?.timezone || 'UTC'
      )}`,
      responseLabel: getInterviewResponseStatusLabel(
        application.nextInterview?.candidateResponseStatus || 'pending'
      ),
    }));

  return typeof limit === 'number' ? entries.slice(0, limit) : entries;
}

export function applyInterviewUpdateToApplications(
  applications: CandidateApplicationRecord[],
  updatedInterview: CandidateInterviewRecord
) {
  return applications.map((application) => {
    if (application.id !== updatedInterview.applicationId) {
      return application;
    }

    const interviews = application.interviews
      .filter((interview) => interview.id !== updatedInterview.id)
      .concat(updatedInterview)
      .sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      );

    return {
      ...application,
      interviews,
      nextInterview: interviews.find((interview) => interview.status === 'scheduled') || null,
    };
  });
}

export function applyInterviewSlotUpdateToApplications(
  applications: CandidateApplicationRecord[],
  updatedSlot: CandidateInterviewSlotRecord
) {
  return applications.map((application) => {
    if (application.id !== updatedSlot.applicationId) {
      return application;
    }

    const interviewSlots = application.interviewSlots
      .filter((slot) => slot.id !== updatedSlot.id)
      .concat(updatedSlot)
      .sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      );

    return {
      ...application,
      interviewSlots,
      nextAvailableInterviewSlot:
        interviewSlots.find((slot) => slot.status === 'available') || null,
    };
  });
}

export function consumeBookedInterviewSlot(
  applications: CandidateApplicationRecord[],
  slotId: string
) {
  return applications.map((application) => {
    const interviewSlots = application.interviewSlots.map((slot) =>
      slot.id === slotId ? { ...slot, status: 'booked' as const } : slot
    );

    return {
      ...application,
      interviewSlots,
      nextAvailableInterviewSlot:
        interviewSlots.find((slot) => slot.status === 'available') || null,
    };
  });
}
