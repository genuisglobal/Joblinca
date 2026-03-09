import type {
  InterviewMode,
  InterviewResponseStatus,
  InterviewSlotStatus,
  InterviewStatus,
} from '@/lib/interview-scheduling/utils';

export interface ApplicationInterviewView {
  id: string;
  applicationId: string;
  jobId: string;
  recruiterId: string;
  candidateUserId: string;
  scheduledAt: string;
  timezone: string;
  mode: InterviewMode;
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  status: InterviewStatus;
  candidateResponseStatus: InterviewResponseStatus;
  candidateRespondedAt: string | null;
  candidateResponseNote: string | null;
  confirmationSentAt: string | null;
  reminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationInterviewSlotView {
  id: string;
  applicationId: string;
  jobId: string;
  recruiterId: string;
  candidateUserId: string;
  scheduledAt: string;
  timezone: string;
  mode: InterviewMode;
  location: string | null;
  meetingUrl: string | null;
  notes: string | null;
  status: InterviewSlotStatus;
  bookedInterviewId: string | null;
  invitationSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type InterviewNotificationStatus = 'sent' | 'skipped' | 'failed';

export interface InterviewNotificationDeliveryResult {
  delivered: boolean;
  emailStatus: InterviewNotificationStatus;
  emailError: string | null;
  whatsappStatus: InterviewNotificationStatus;
  whatsappError: string | null;
}
