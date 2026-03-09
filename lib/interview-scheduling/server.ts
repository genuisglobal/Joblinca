import {
  buildInterviewOutcomeMessage,
  DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS,
  normalizeInterviewAutomationSettings,
  type JobInterviewAutomationSettings,
} from '@/lib/interview-scheduling/automation';
import {
  buildSelfScheduleSlotDrafts,
  checkSelfScheduleAvailability,
  findInterviewSlotTemplate,
  normalizeInterviewSelfScheduleSettings,
  type JobInterviewSelfScheduleSettings,
} from '@/lib/interview-scheduling/self-schedule';
import { buildInterviewCalendarEvent } from '@/lib/interview-scheduling/calendar';
import {
  loadJobPipelineBundle,
  mapCurrentStage,
  normalizeRelation,
  recordApplicationActivity,
} from '@/lib/hiring-pipeline/server';
import {
  moveApplicationToStage,
  type StageTransitionResult,
} from '@/lib/hiring-pipeline/transitions';
import { type ApplicationCurrentStage } from '@/lib/hiring-pipeline/types';
import {
  isEmailDeliveryConfigured,
  sendInterviewCancelledEmail,
  sendInterviewOutcomeFollowupEmail,
  sendInterviewRescheduledEmail,
  sendInterviewReminderEmail,
  sendInterviewScheduledEmail,
  sendInterviewSelfScheduleInviteEmail,
} from '@/lib/messaging/email';
import {
  sendInterviewCancelledWhatsapp,
  sendInterviewOutcomeFollowupWhatsapp,
  sendInterviewRescheduledWhatsapp,
  sendInterviewReminderAlertWhatsapp,
  sendInterviewScheduledWhatsapp,
  sendInterviewSelfScheduleInviteWhatsapp,
} from '@/lib/messaging/whatsapp';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type {
  ApplicationInterviewView,
  ApplicationInterviewSlotView,
  InterviewNotificationDeliveryResult,
} from '@/lib/interview-scheduling/types';
import {
  formatInterviewDateTimeLabel,
  getInterviewModeLabel,
  normalizeE164,
  normalizeInterviewMode,
  normalizeInterviewResponseStatus,
  normalizeInterviewSlotStatus,
  normalizeInterviewStatus,
  pickInterviewStageId,
  type InterviewMode,
  type InterviewResponseStatus,
  type InterviewSlotStatus,
} from '@/lib/interview-scheduling/utils';

type Relation<T> = T | T[] | null | undefined;

interface ApplicationInterviewRow {
  id: string;
  application_id: string;
  job_id: string;
  recruiter_id: string;
  candidate_user_id: string;
  scheduled_at: string;
  timezone: string | null;
  mode: string | null;
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  status: string | null;
  candidate_response_status: string | null;
  candidate_responded_at: string | null;
  candidate_response_note: string | null;
  confirmation_sent_at: string | null;
  reminder_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ApplicationInterviewSlotRow {
  id: string;
  application_id: string;
  job_id: string;
  recruiter_id: string;
  candidate_user_id: string;
  scheduled_at: string;
  timezone: string | null;
  mode: string | null;
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  status: string | null;
  booked_interview_id: string | null;
  invitation_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ApplicationContextRow {
  id: string;
  applicant_id: string;
  job_id: string;
  contact_info: Record<string, unknown> | null;
  decision_status: string | null;
  current_stage: Relation<{
    id: string;
    stage_key: string;
    label: string;
    stage_type: string;
    order_index: number;
    is_terminal: boolean;
    allows_feedback: boolean;
  }>;
  jobs: Relation<{
    id: string;
    title: string | null;
    company_name: string | null;
    recruiter_id: string | null;
  }>;
  profiles: Relation<{
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
}

interface WhatsappConversationRow {
  wa_phone: string;
}

interface JobInterviewAutomationSettingsRow {
  job_id: string;
  auto_send_reschedule_notice: boolean | null;
  auto_send_cancellation_notice: boolean | null;
  auto_send_completion_followup: boolean | null;
  auto_send_no_show_followup: boolean | null;
  completion_followup_message: string | null;
  no_show_followup_message: string | null;
  created_at: string;
  updated_at: string;
}

interface JobInterviewSelfScheduleSettingsRow {
  job_id: string;
  timezone: string | null;
  minimum_notice_hours: number | null;
  slot_interval_minutes: number | null;
  blackout_dates: string[] | null;
  weekly_availability: Record<string, unknown> | null;
  slot_templates: unknown[] | null;
  created_at: string;
  updated_at: string;
}

interface ApplicationSchedulingContext {
  applicationId: string;
  applicantId: string;
  jobId: string;
  contactInfo: Record<string, unknown>;
  decisionStatus: string | null;
  currentStage: ApplicationCurrentStage | null;
  job: {
    id: string;
    title: string | null;
    companyName: string | null;
    recruiterId: string | null;
  };
  profile: {
    id: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
  };
}

interface InterviewReminderDispatchResult {
  interviewId: string;
  delivery: InterviewNotificationDeliveryResult;
}

type InterviewLifecycleAction = 'reschedule' | 'cancel' | 'complete' | 'no_show';
type InterviewNotificationType =
  | 'confirmation'
  | 'reminder'
  | 'reschedule'
  | 'cancellation';

function sanitizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveOptionalTextUpdate(
  currentValue: string | null,
  nextValue: string | null | undefined
): string | null {
  if (nextValue === undefined) {
    return currentValue;
  }

  return sanitizeText(nextValue);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.length <= 200 ? message : `${message.slice(0, 197)}...`;
}

function mapInterviewRow(row: ApplicationInterviewRow): ApplicationInterviewView {
  return {
    id: row.id,
    applicationId: row.application_id,
    jobId: row.job_id,
    recruiterId: row.recruiter_id,
    candidateUserId: row.candidate_user_id,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone || 'UTC',
    mode: normalizeInterviewMode(row.mode),
    location: row.location,
    meetingUrl: row.meeting_url,
    notes: row.notes,
    status: normalizeInterviewStatus(row.status),
    candidateResponseStatus: normalizeInterviewResponseStatus(row.candidate_response_status),
    candidateRespondedAt: row.candidate_responded_at,
    candidateResponseNote: row.candidate_response_note,
    confirmationSentAt: row.confirmation_sent_at,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInterviewSlotRow(row: ApplicationInterviewSlotRow): ApplicationInterviewSlotView {
  return {
    id: row.id,
    applicationId: row.application_id,
    jobId: row.job_id,
    recruiterId: row.recruiter_id,
    candidateUserId: row.candidate_user_id,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone || 'UTC',
    mode: normalizeInterviewMode(row.mode),
    location: row.location,
    meetingUrl: row.meeting_url,
    notes: row.notes,
    status: normalizeInterviewSlotStatus(row.status),
    bookedInterviewId: row.booked_interview_id,
    invitationSentAt: row.invitation_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadInterviewById(interviewId: string): Promise<ApplicationInterviewView> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Interview not found');
  }

  return mapInterviewRow(data as ApplicationInterviewRow);
}

export async function loadInterviewCalendarContext(interviewId: string): Promise<{
  interview: ApplicationInterviewView;
  applicationContext: ApplicationSchedulingContext;
}> {
  const interview = await loadInterviewById(interviewId);
  const applicationContext = await loadApplicationContext(interview.applicationId);

  return {
    interview,
    applicationContext,
  };
}

async function loadInterviewRowById(interviewId: string): Promise<ApplicationInterviewRow> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interviews')
    .select('*')
    .eq('id', interviewId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Interview not found');
  }

  return data as ApplicationInterviewRow;
}

async function loadInterviewSlotById(slotId: string): Promise<ApplicationInterviewSlotView> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interview_slots')
    .select('*')
    .eq('id', slotId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Interview slot not found');
  }

  return mapInterviewSlotRow(data as ApplicationInterviewSlotRow);
}

async function loadInterviewSlotRowById(slotId: string): Promise<ApplicationInterviewSlotRow> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interview_slots')
    .select('*')
    .eq('id', slotId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Interview slot not found');
  }

  return data as ApplicationInterviewSlotRow;
}

async function loadApplicationContext(
  applicationId: string
): Promise<ApplicationSchedulingContext> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('applications')
    .select(
      `
      id,
      applicant_id,
      job_id,
      contact_info,
      decision_status,
      current_stage:current_stage_id (
        id,
        stage_key,
        label,
        stage_type,
        order_index,
        is_terminal,
        allows_feedback
      ),
      jobs:job_id (
        id,
        title,
        company_name,
        recruiter_id
      ),
      profiles:applicant_id (
        id,
        full_name,
        email,
        phone
      )
    `
    )
    .eq('id', applicationId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Application not found');
  }

  const row = data as ApplicationContextRow;
  const job = normalizeRelation(row.jobs);
  const profile = normalizeRelation(row.profiles);

  if (!job || !profile) {
    throw new Error('Application context is incomplete');
  }

  return {
    applicationId: row.id,
    applicantId: row.applicant_id,
    jobId: row.job_id,
    contactInfo:
      row.contact_info && typeof row.contact_info === 'object' && !Array.isArray(row.contact_info)
        ? row.contact_info
        : {},
    decisionStatus: row.decision_status,
    currentStage: mapCurrentStage(row.current_stage),
    job: {
      id: job.id,
      title: job.title,
      companyName: job.company_name,
      recruiterId: job.recruiter_id,
    },
    profile: {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
    },
  };
}

export async function loadJobInterviewAutomationSettings(
  jobId: string
): Promise<JobInterviewAutomationSettings> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('job_interview_automation_settings')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load interview automation settings: ${error.message}`);
  }

  if (!data) {
    return { ...DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS };
  }

  const row = data as JobInterviewAutomationSettingsRow;
  return normalizeInterviewAutomationSettings({
    autoSendRescheduleNotice: row.auto_send_reschedule_notice,
    autoSendCancellationNotice: row.auto_send_cancellation_notice,
    autoSendCompletionFollowup: row.auto_send_completion_followup,
    autoSendNoShowFollowup: row.auto_send_no_show_followup,
    completionFollowupMessage: row.completion_followup_message,
    noShowFollowupMessage: row.no_show_followup_message,
  });
}

export async function upsertJobInterviewAutomationSettings(params: {
  jobId: string;
  settings: JobInterviewAutomationSettings;
}): Promise<JobInterviewAutomationSettings> {
  const db = createServiceSupabaseClient();
  const payload = {
    job_id: params.jobId,
    auto_send_reschedule_notice: params.settings.autoSendRescheduleNotice,
    auto_send_cancellation_notice: params.settings.autoSendCancellationNotice,
    auto_send_completion_followup: params.settings.autoSendCompletionFollowup,
    auto_send_no_show_followup: params.settings.autoSendNoShowFollowup,
    completion_followup_message: params.settings.completionFollowupMessage,
    no_show_followup_message: params.settings.noShowFollowupMessage,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('job_interview_automation_settings')
    .upsert(payload, { onConflict: 'job_id' });

  if (error) {
    throw new Error(`Failed to save interview automation settings: ${error.message}`);
  }

  return loadJobInterviewAutomationSettings(params.jobId);
}

export async function loadJobInterviewSelfScheduleSettings(
  jobId: string
): Promise<JobInterviewSelfScheduleSettings> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('job_interview_self_schedule_settings')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load self-schedule settings: ${error.message}`);
  }

  if (!data) {
    return normalizeInterviewSelfScheduleSettings({});
  }

  const row = data as JobInterviewSelfScheduleSettingsRow;
  return normalizeInterviewSelfScheduleSettings({
    timezone: row.timezone,
    minimumNoticeHours: row.minimum_notice_hours,
    slotIntervalMinutes: row.slot_interval_minutes,
    blackoutDates: row.blackout_dates,
    weeklyAvailability: row.weekly_availability,
    slotTemplates: row.slot_templates,
  });
}

export async function upsertJobInterviewSelfScheduleSettings(params: {
  jobId: string;
  settings: JobInterviewSelfScheduleSettings;
}): Promise<JobInterviewSelfScheduleSettings> {
  const db = createServiceSupabaseClient();
  const payload = {
    job_id: params.jobId,
    timezone: params.settings.timezone,
    minimum_notice_hours: params.settings.minimumNoticeHours,
    slot_interval_minutes: params.settings.slotIntervalMinutes,
    blackout_dates: params.settings.blackoutDates,
    weekly_availability: params.settings.weeklyAvailability,
    slot_templates: params.settings.slotTemplates,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('job_interview_self_schedule_settings')
    .upsert(payload, { onConflict: 'job_id' });

  if (error) {
    throw new Error(`Failed to save self-schedule settings: ${error.message}`);
  }

  return loadJobInterviewSelfScheduleSettings(params.jobId);
}

async function loadOptedInWhatsappPhone(userId: string): Promise<string | null> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('wa_conversations')
    .select('wa_phone')
    .eq('user_id', userId)
    .eq('opted_in', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to load WhatsApp opt-in: ${error.message}`);
  }

  const row = ((data || []) as WhatsappConversationRow[])[0];
  return normalizeE164(row?.wa_phone || null);
}

async function updateInterviewDeliveryTimestamp(params: {
  interviewId: string;
  field: 'confirmation_sent_at' | 'reminder_sent_at';
}): Promise<void> {
  const db = createServiceSupabaseClient();
  const { error } = await db
    .from('application_interviews')
    .update({
      [params.field]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.interviewId);

  if (error) {
    throw new Error(`Failed to update interview delivery state: ${error.message}`);
  }
}

async function deliverInterviewNotifications(params: {
  interview: ApplicationInterviewView;
  applicationContext: ApplicationSchedulingContext;
  type: InterviewNotificationType;
}): Promise<InterviewNotificationDeliveryResult> {
  const interviewTime = formatInterviewDateTimeLabel(
    params.interview.scheduledAt,
    params.interview.timezone
  );
  const candidateName =
    sanitizeText(String(params.applicationContext.contactInfo.fullName || '')) ||
    sanitizeText(params.applicationContext.profile.fullName) ||
    'there';
  const candidateEmail =
    sanitizeText(String(params.applicationContext.contactInfo.email || '')) ||
    sanitizeText(params.applicationContext.profile.email);
  const whatsappPhone = await loadOptedInWhatsappPhone(params.applicationContext.applicantId);
  const modeLabel = getInterviewModeLabel(params.interview.mode);
  const companyName = params.applicationContext.job.companyName || 'Joblinca';
  const jobTitle = params.applicationContext.job.title || 'Interview';
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/$/, '');
  const calendarEvent = buildInterviewCalendarEvent({
    interviewId: params.interview.id,
    scheduledAt: params.interview.scheduledAt,
    jobTitle,
    companyName,
    modeLabel,
    location: params.interview.location,
    meetingUrl: params.interview.meetingUrl,
    notes: params.interview.notes,
    manageUrl: `${appUrl}/dashboard`,
  });

  const result: InterviewNotificationDeliveryResult = {
    delivered: false,
    emailStatus: 'skipped',
    emailError: null,
    whatsappStatus: 'skipped',
    whatsappError: null,
  };

  if (candidateEmail && isEmailDeliveryConfigured()) {
    try {
      if (params.type === 'confirmation') {
        await sendInterviewScheduledEmail({
          to: candidateEmail,
          userName: candidateName,
          jobTitle,
          companyName,
          interviewTime,
          modeLabel,
          location: params.interview.location,
          meetingUrl: params.interview.meetingUrl,
          notes: params.interview.notes,
          googleCalendarUrl: calendarEvent.googleCalendarUrl,
          outlookCalendarUrl: calendarEvent.outlookCalendarUrl,
        });
      } else if (params.type === 'reschedule') {
        await sendInterviewRescheduledEmail({
          to: candidateEmail,
          userName: candidateName,
          jobTitle,
          companyName,
          interviewTime,
          modeLabel,
          location: params.interview.location,
          meetingUrl: params.interview.meetingUrl,
          notes: params.interview.notes,
          googleCalendarUrl: calendarEvent.googleCalendarUrl,
          outlookCalendarUrl: calendarEvent.outlookCalendarUrl,
        });
      } else if (params.type === 'cancellation') {
        await sendInterviewCancelledEmail({
          to: candidateEmail,
          userName: candidateName,
          jobTitle,
          companyName,
          interviewTime,
          modeLabel,
          location: params.interview.location,
          meetingUrl: params.interview.meetingUrl,
          notes: params.interview.notes,
        });
      } else {
        await sendInterviewReminderEmail({
          to: candidateEmail,
          userName: candidateName,
          jobTitle,
          companyName,
          interviewTime,
          modeLabel,
          location: params.interview.location,
          meetingUrl: params.interview.meetingUrl,
          googleCalendarUrl: calendarEvent.googleCalendarUrl,
          outlookCalendarUrl: calendarEvent.outlookCalendarUrl,
        });
      }
      result.emailStatus = 'sent';
      result.delivered = true;
    } catch (error) {
      result.emailStatus = 'failed';
      result.emailError = sanitizeError(error);
    }
  } else if (!candidateEmail) {
    result.emailError = 'no_candidate_email';
  } else {
    result.emailError = 'email_not_configured';
  }

  if (whatsappPhone) {
    try {
      if (params.type === 'confirmation') {
        await sendInterviewScheduledWhatsapp({
          to: whatsappPhone,
          seekerName: candidateName,
          jobTitle,
          company: companyName,
          interviewTime,
          modeLabel,
          meetingUrl: params.interview.meetingUrl,
          userId: params.applicationContext.applicantId,
        });
      } else if (params.type === 'reschedule') {
        await sendInterviewRescheduledWhatsapp({
          to: whatsappPhone,
          seekerName: candidateName,
          jobTitle,
          company: companyName,
          interviewTime,
          modeLabel,
          meetingUrl: params.interview.meetingUrl,
          userId: params.applicationContext.applicantId,
        });
      } else if (params.type === 'cancellation') {
        await sendInterviewCancelledWhatsapp({
          to: whatsappPhone,
          seekerName: candidateName,
          jobTitle,
          company: companyName,
          interviewTime,
          modeLabel,
          meetingUrl: params.interview.meetingUrl,
          userId: params.applicationContext.applicantId,
        });
      } else {
        await sendInterviewReminderAlertWhatsapp({
          to: whatsappPhone,
          seekerName: candidateName,
          jobTitle,
          company: companyName,
          interviewTime,
          modeLabel,
          meetingUrl: params.interview.meetingUrl,
          userId: params.applicationContext.applicantId,
        });
      }
      result.whatsappStatus = 'sent';
      result.delivered = true;
    } catch (error) {
      result.whatsappStatus = 'failed';
      result.whatsappError = sanitizeError(error);
    }
  } else {
    result.whatsappError = 'no_whatsapp_opt_in';
  }

  return result;
}

async function deliverInterviewOutcomeFollowup(params: {
  interview: ApplicationInterviewView;
  applicationContext: ApplicationSchedulingContext;
  type: 'completion' | 'no_show';
  customMessage?: string | null;
}): Promise<InterviewNotificationDeliveryResult> {
  const candidateName =
    sanitizeText(String(params.applicationContext.contactInfo.fullName || '')) ||
    sanitizeText(params.applicationContext.profile.fullName) ||
    'there';
  const candidateEmail =
    sanitizeText(String(params.applicationContext.contactInfo.email || '')) ||
    sanitizeText(params.applicationContext.profile.email);
  const whatsappPhone = await loadOptedInWhatsappPhone(params.applicationContext.applicantId);
  const message = buildInterviewOutcomeMessage({
    type: params.type,
    jobTitle: params.applicationContext.job.title || 'Interview',
    companyName: params.applicationContext.job.companyName || 'Joblinca',
    interviewTime: formatInterviewDateTimeLabel(
      params.interview.scheduledAt,
      params.interview.timezone
    ),
    customMessage: params.customMessage,
  });

  const result: InterviewNotificationDeliveryResult = {
    delivered: false,
    emailStatus: 'skipped',
    emailError: null,
    whatsappStatus: 'skipped',
    whatsappError: null,
  };

  if (candidateEmail && isEmailDeliveryConfigured()) {
    try {
      await sendInterviewOutcomeFollowupEmail({
        to: candidateEmail,
        userName: candidateName,
        subject: message.subject,
        intro: message.emailIntro,
        detail: message.detail,
      });
      result.emailStatus = 'sent';
      result.delivered = true;
    } catch (error) {
      result.emailStatus = 'failed';
      result.emailError = sanitizeError(error);
    }
  } else if (!candidateEmail) {
    result.emailError = 'no_candidate_email';
  } else {
    result.emailError = 'email_not_configured';
  }

  if (whatsappPhone) {
    try {
      await sendInterviewOutcomeFollowupWhatsapp({
        to: whatsappPhone,
        text: message.whatsappText,
        userId: params.applicationContext.applicantId,
      });
      result.whatsappStatus = 'sent';
      result.delivered = true;
    } catch (error) {
      result.whatsappStatus = 'failed';
      result.whatsappError = sanitizeError(error);
    }
  } else {
    result.whatsappError = 'no_whatsapp_opt_in';
  }

  return result;
}

async function createScheduledInterviewRecord(params: {
  applicationContext: ApplicationSchedulingContext;
  actorId: string;
  scheduledAt: string;
  timezone?: string | null;
  mode?: InterviewMode;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  moveToInterviewStage?: boolean;
  activityAction?: string;
  activityMetadata?: Record<string, unknown>;
}): Promise<{
  interview: ApplicationInterviewView;
  stageTransition: StageTransitionResult | null;
}> {
  const scheduledDate = new Date(params.scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error('scheduledAt must be a valid ISO datetime');
  }

  if (scheduledDate.getTime() <= Date.now()) {
    throw new Error('Interview time must be in the future');
  }

  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interviews')
    .insert({
      application_id: params.applicationContext.applicationId,
      job_id: params.applicationContext.jobId,
      recruiter_id: params.applicationContext.job.recruiterId || params.actorId,
      candidate_user_id: params.applicationContext.applicantId,
      scheduled_at: scheduledDate.toISOString(),
      timezone: sanitizeText(params.timezone) || 'UTC',
      mode: normalizeInterviewMode(params.mode),
      location: sanitizeText(params.location),
      meeting_url: sanitizeText(params.meetingUrl),
      notes: sanitizeText(params.notes),
      status: 'scheduled',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to schedule interview');
  }

  const interview = mapInterviewRow(data as ApplicationInterviewRow);
  let stageTransition: StageTransitionResult | null = null;

  if (params.moveToInterviewStage !== false && !params.applicationContext.currentStage?.isTerminal) {
    const bundle = await loadJobPipelineBundle(params.applicationContext.jobId);
    const targetStageId = pickInterviewStageId(
      bundle.pipeline.stages,
      params.applicationContext.currentStage?.id
    );
    if (targetStageId && targetStageId !== params.applicationContext.currentStage?.id) {
      stageTransition = await moveApplicationToStage({
        applicationId: params.applicationContext.applicationId,
        actorId: params.actorId,
        toStageId: targetStageId,
        note: `Interview scheduled for ${formatInterviewDateTimeLabel(interview.scheduledAt, interview.timezone)}`,
        reason: 'interview_scheduled',
        trigger: 'interview_schedule',
      });
    }
  }

  await recordApplicationActivity({
    applicationId: params.applicationContext.applicationId,
    actorId: params.actorId,
    action: params.activityAction || 'interview_scheduled',
    newValue: formatInterviewDateTimeLabel(interview.scheduledAt, interview.timezone),
    metadata: {
      interviewId: interview.id,
      mode: interview.mode,
      timezone: interview.timezone,
      meetingUrl: interview.meetingUrl,
      location: interview.location,
      movedToInterviewStage: Boolean(stageTransition),
      ...(params.activityMetadata || {}),
    },
  });

  return {
    interview,
    stageTransition,
  };
}

export async function loadApplicationInterviews(
  applicationId: string
): Promise<ApplicationInterviewView[]> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interviews')
    .select('*')
    .eq('application_id', applicationId)
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load application interviews: ${error.message}`);
  }

  return ((data || []) as ApplicationInterviewRow[]).map(mapInterviewRow);
}

export async function loadApplicationInterviewSlots(
  applicationId: string
): Promise<ApplicationInterviewSlotView[]> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interview_slots')
    .select('*')
    .eq('application_id', applicationId)
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to load interview slots: ${error.message}`);
  }

  return ((data || []) as ApplicationInterviewSlotRow[]).map(mapInterviewSlotRow);
}

async function updateInterviewSlotInvitationTimestamp(slotId: string): Promise<void> {
  const db = createServiceSupabaseClient();
  const { error } = await db
    .from('application_interview_slots')
    .update({
      invitation_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', slotId);

  if (error) {
    throw new Error(`Failed to update interview slot invitation state: ${error.message}`);
  }
}

async function deliverSelfScheduleInvite(params: {
  slot: ApplicationInterviewSlotView;
  applicationContext: ApplicationSchedulingContext;
}): Promise<InterviewNotificationDeliveryResult> {
  const candidateName =
    sanitizeText(String(params.applicationContext.contactInfo.fullName || '')) ||
    sanitizeText(params.applicationContext.profile.fullName) ||
    'there';
  const candidateEmail =
    sanitizeText(String(params.applicationContext.contactInfo.email || '')) ||
    sanitizeText(params.applicationContext.profile.email);
  const whatsappPhone = await loadOptedInWhatsappPhone(params.applicationContext.applicantId);
  const result: InterviewNotificationDeliveryResult = {
    delivered: false,
    emailStatus: 'skipped',
    emailError: null,
    whatsappStatus: 'skipped',
    whatsappError: null,
  };
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/$/, '');
  const inviteUrl = `${appUrl}/dashboard`;
  const modeLabel = getInterviewModeLabel(params.slot.mode);
  const jobTitle = params.applicationContext.job.title || 'Interview';
  const companyName = params.applicationContext.job.companyName || 'Joblinca';

  if (candidateEmail && isEmailDeliveryConfigured()) {
    try {
      await sendInterviewSelfScheduleInviteEmail({
        to: candidateEmail,
        userName: candidateName,
        jobTitle,
        companyName,
        inviteUrl,
        modeLabel,
        notes: params.slot.notes,
      });
      result.emailStatus = 'sent';
      result.delivered = true;
    } catch (error) {
      result.emailStatus = 'failed';
      result.emailError = sanitizeError(error);
    }
  } else if (!candidateEmail) {
    result.emailError = 'no_candidate_email';
  } else {
    result.emailError = 'email_not_configured';
  }

  if (whatsappPhone) {
    try {
      await sendInterviewSelfScheduleInviteWhatsapp({
        to: whatsappPhone,
        seekerName: candidateName,
        jobTitle,
        company: companyName,
        inviteUrl,
        modeLabel,
        userId: params.applicationContext.applicantId,
      });
      result.whatsappStatus = 'sent';
      result.delivered = true;
    } catch (error) {
      result.whatsappStatus = 'failed';
      result.whatsappError = sanitizeError(error);
    }
  } else {
    result.whatsappError = 'no_whatsapp_opt_in';
  }

  return result;
}

export async function createApplicationInterviewSlot(params: {
  applicationId: string;
  actorId: string;
  scheduledAt: string;
  timezone?: string | null;
  mode?: InterviewMode;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  sendInvitation?: boolean;
}): Promise<{
  slot: ApplicationInterviewSlotView;
  notifications: InterviewNotificationDeliveryResult | null;
}> {
  const context = await loadApplicationContext(params.applicationId);

  if (context.decisionStatus && context.decisionStatus !== 'active') {
    throw new Error('Only active applications can receive self-schedule slots');
  }

  const scheduledDate = new Date(params.scheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error('scheduledAt must be a valid ISO datetime');
  }

  if (scheduledDate.getTime() <= Date.now()) {
    throw new Error('Interview time must be in the future');
  }

  const selfScheduleSettings = await loadJobInterviewSelfScheduleSettings(context.jobId);
  const availabilityCheck = checkSelfScheduleAvailability({
    scheduledAt: scheduledDate.toISOString(),
    timezone: sanitizeText(params.timezone) || selfScheduleSettings.timezone,
    settings: selfScheduleSettings,
  });

  if (!availabilityCheck.allowed) {
    throw new Error(availabilityCheck.reason || 'Interview slot falls outside self-schedule policy');
  }

  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interview_slots')
    .insert({
      application_id: params.applicationId,
      job_id: context.jobId,
      recruiter_id: params.actorId,
      candidate_user_id: context.applicantId,
      scheduled_at: scheduledDate.toISOString(),
      timezone: sanitizeText(params.timezone) || 'UTC',
      mode: normalizeInterviewMode(params.mode),
      location: sanitizeText(params.location),
      meeting_url: sanitizeText(params.meetingUrl),
      notes: sanitizeText(params.notes),
      status: 'available',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create interview slot');
  }

  const slot = mapInterviewSlotRow(data as ApplicationInterviewSlotRow);

  await recordApplicationActivity({
    applicationId: params.applicationId,
    actorId: params.actorId,
    action: 'interview_slot_created',
    newValue: formatInterviewDateTimeLabel(slot.scheduledAt, slot.timezone),
    metadata: {
      slotId: slot.id,
      mode: slot.mode,
      timezone: slot.timezone,
    },
  });

  let notifications: InterviewNotificationDeliveryResult | null = null;
  if (params.sendInvitation !== false) {
    notifications = await deliverSelfScheduleInvite({
      slot,
      applicationContext: context,
    });

    if (notifications.delivered) {
      await updateInterviewSlotInvitationTimestamp(slot.id);
      await recordApplicationActivity({
        applicationId: params.applicationId,
        actorId: params.actorId,
        action: 'interview_self_schedule_invite_sent',
        metadata: {
          slotId: slot.id,
          emailStatus: notifications.emailStatus,
          whatsappStatus: notifications.whatsappStatus,
        },
      });
    }
  }

  return {
    slot: await loadInterviewSlotById(slot.id),
    notifications,
  };
}

export async function cancelApplicationInterviewSlot(params: {
  slotId: string;
  applicationId: string;
  actorId: string;
}): Promise<ApplicationInterviewSlotView> {
  const existing = await loadInterviewSlotRowById(params.slotId);
  if (existing.application_id !== params.applicationId) {
    throw new Error('Interview slot does not belong to this application');
  }

  if (normalizeInterviewSlotStatus(existing.status) !== 'available') {
    throw new Error('Only available interview slots can be cancelled');
  }

  const db = createServiceSupabaseClient();
  const { error } = await db
    .from('application_interview_slots')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.slotId);

  if (error) {
    throw new Error(`Failed to cancel interview slot: ${error.message}`);
  }

  await recordApplicationActivity({
    applicationId: params.applicationId,
    actorId: params.actorId,
    action: 'interview_slot_cancelled',
    oldValue: normalizeInterviewSlotStatus(existing.status),
    newValue: 'cancelled',
    metadata: {
      slotId: params.slotId,
    },
  });

  return loadInterviewSlotById(params.slotId);
}

export async function generateApplicationInterviewSlotsFromRange(params: {
  applicationId: string;
  actorId: string;
  templateId: string;
  startDate: string;
  endDate: string;
  sendInvitation?: boolean;
}): Promise<{
  slots: ApplicationInterviewSlotView[];
  createdCount: number;
  skippedDates: string[];
  notificationDeliveries: number;
}> {
  const context = await loadApplicationContext(params.applicationId);

  if (context.decisionStatus && context.decisionStatus !== 'active') {
    throw new Error('Only active applications can receive self-schedule slots');
  }

  const settings = await loadJobInterviewSelfScheduleSettings(context.jobId);
  const template = findInterviewSlotTemplate(settings, params.templateId);

  if (!template) {
    throw new Error('Self-schedule template not found');
  }

  const drafts = buildSelfScheduleSlotDrafts({
    startDate: params.startDate,
    endDate: params.endDate,
    settings,
  });

  if (drafts.length === 0) {
    throw new Error('No self-schedule days are available in the selected range');
  }

  const [existingSlots, existingInterviews] = await Promise.all([
    loadApplicationInterviewSlots(params.applicationId),
    loadApplicationInterviews(params.applicationId),
  ]);

  const occupiedTimes = new Set<string>();
  for (const slot of existingSlots) {
    if (slot.status !== 'cancelled') {
      occupiedTimes.add(slot.scheduledAt);
    }
  }
  for (const interview of existingInterviews) {
    if (interview.status !== 'cancelled') {
      occupiedTimes.add(interview.scheduledAt);
    }
  }

  const slots: ApplicationInterviewSlotView[] = [];
  const skippedDates: string[] = [];
  let notificationDeliveries = 0;

  for (const draft of drafts) {
    if (occupiedTimes.has(draft.scheduledAt)) {
      skippedDates.push(draft.date);
      continue;
    }

    const result = await createApplicationInterviewSlot({
      applicationId: params.applicationId,
      actorId: params.actorId,
      scheduledAt: draft.scheduledAt,
      timezone: settings.timezone,
      mode: template.mode,
      location: template.location,
      meetingUrl: template.meetingUrl,
      notes: template.notes,
      sendInvitation: params.sendInvitation,
    });

    occupiedTimes.add(result.slot.scheduledAt);
    slots.push(result.slot);
    if (result.notifications?.delivered) {
      notificationDeliveries += 1;
    }
  }

  return {
    slots,
    createdCount: slots.length,
    skippedDates,
    notificationDeliveries,
  };
}

export async function bookApplicationInterviewSlot(params: {
  slotId: string;
  candidateUserId: string;
}): Promise<{
  slot: ApplicationInterviewSlotView;
  interview: ApplicationInterviewView;
  notifications: InterviewNotificationDeliveryResult;
  stageTransition: StageTransitionResult | null;
}> {
  const existing = await loadInterviewSlotRowById(params.slotId);

  if (existing.candidate_user_id !== params.candidateUserId) {
    throw new Error('Not authorized');
  }

  if (normalizeInterviewSlotStatus(existing.status) !== 'available') {
    throw new Error('Interview slot is no longer available');
  }

  const context = await loadApplicationContext(existing.application_id);
  const { interview, stageTransition } = await createScheduledInterviewRecord({
    applicationContext: context,
    actorId: existing.recruiter_id,
    scheduledAt: existing.scheduled_at,
    timezone: existing.timezone,
    mode: normalizeInterviewMode(existing.mode),
    location: existing.location,
    meetingUrl: existing.meeting_url,
    notes: existing.notes,
    activityAction: 'interview_slot_booked',
    activityMetadata: {
      slotId: existing.id,
      bookedByCandidate: true,
    },
  });

  const db = createServiceSupabaseClient();
  const { error } = await db
    .from('application_interview_slots')
    .update({
      status: 'booked',
      booked_interview_id: interview.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.slotId);

  if (error) {
    throw new Error(`Failed to book interview slot: ${error.message}`);
  }

  const notifications = await deliverInterviewNotifications({
    interview,
    applicationContext: context,
    type: 'confirmation',
  });

  if (notifications.delivered) {
    await updateInterviewDeliveryTimestamp({
      interviewId: interview.id,
      field: 'confirmation_sent_at',
    });

    await recordApplicationActivity({
      applicationId: existing.application_id,
      actorId: existing.recruiter_id,
      action: 'interview_confirmation_sent',
      metadata: {
        interviewId: interview.id,
        slotId: existing.id,
        emailStatus: notifications.emailStatus,
        whatsappStatus: notifications.whatsappStatus,
        source: 'self_schedule_booking',
      },
    });
  }

  return {
    slot: await loadInterviewSlotById(existing.id),
    interview: await loadInterviewById(interview.id),
    notifications,
    stageTransition,
  };
}

export async function scheduleApplicationInterview(params: {
  applicationId: string;
  actorId: string;
  scheduledAt: string;
  timezone?: string | null;
  mode?: InterviewMode;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  sendNotifications?: boolean;
  moveToInterviewStage?: boolean;
}): Promise<{
  interview: ApplicationInterviewView;
  notifications: InterviewNotificationDeliveryResult;
  stageTransition: StageTransitionResult | null;
}> {
  const context = await loadApplicationContext(params.applicationId);

  if (context.decisionStatus && context.decisionStatus !== 'active') {
    throw new Error('Only active applications can be scheduled for interviews');
  }
  const { interview, stageTransition } = await createScheduledInterviewRecord({
    applicationContext: context,
    actorId: params.actorId,
    scheduledAt: params.scheduledAt,
    timezone: params.timezone,
    mode: params.mode,
    location: params.location,
    meetingUrl: params.meetingUrl,
    notes: params.notes,
    moveToInterviewStage: params.moveToInterviewStage,
  });

  let notifications: InterviewNotificationDeliveryResult = {
    delivered: false,
    emailStatus: 'skipped',
    emailError: null,
    whatsappStatus: 'skipped',
    whatsappError: null,
  };

  if (params.sendNotifications !== false) {
    notifications = await deliverInterviewNotifications({
      interview,
      applicationContext: context,
      type: 'confirmation',
    });

    if (notifications.delivered) {
      await updateInterviewDeliveryTimestamp({
        interviewId: interview.id,
        field: 'confirmation_sent_at',
      });

      await recordApplicationActivity({
        applicationId: params.applicationId,
        actorId: params.actorId,
        action: 'interview_confirmation_sent',
        metadata: {
          interviewId: interview.id,
          emailStatus: notifications.emailStatus,
          whatsappStatus: notifications.whatsappStatus,
        },
      });
    }
  }

  return {
    interview: await loadInterviewById(interview.id),
    notifications,
    stageTransition,
  };
}

export async function updateApplicationInterview(params: {
  interviewId: string;
  applicationId: string;
  actorId: string;
  action: InterviewLifecycleAction;
  scheduledAt?: string | null;
  timezone?: string | null;
  mode?: InterviewMode;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  sendNotifications?: boolean;
}): Promise<{
  interview: ApplicationInterviewView;
  notifications: InterviewNotificationDeliveryResult | null;
}> {
  const existing = await loadInterviewRowById(params.interviewId);
  if (existing.application_id !== params.applicationId) {
    throw new Error('Interview does not belong to this application');
  }

  const context = await loadApplicationContext(existing.application_id);
  const automationSettings = await loadJobInterviewAutomationSettings(context.jobId);
  const db = createServiceSupabaseClient();

  if (params.action === 'reschedule') {
    if (context.decisionStatus && context.decisionStatus !== 'active') {
      throw new Error('Only active applications can be rescheduled for interviews');
    }

    const scheduledAt = params.scheduledAt || existing.scheduled_at;
    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      throw new Error('scheduledAt must be a valid ISO datetime');
    }

    if (scheduledDate.getTime() <= Date.now()) {
      throw new Error('Interview time must be in the future');
    }

    const updatePayload = {
      scheduled_at: scheduledDate.toISOString(),
      timezone: sanitizeText(params.timezone) || existing.timezone || 'UTC',
      mode: normalizeInterviewMode(params.mode || existing.mode || 'video'),
      location: resolveOptionalTextUpdate(existing.location, params.location),
      meeting_url: resolveOptionalTextUpdate(existing.meeting_url, params.meetingUrl),
      notes: resolveOptionalTextUpdate(existing.notes, params.notes),
      status: 'scheduled',
      candidate_response_status: 'pending',
      candidate_responded_at: null,
      candidate_response_note: null,
      reminder_sent_at: null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await db
      .from('application_interviews')
      .update(updatePayload)
      .eq('id', params.interviewId);

    if (error) {
      throw new Error(`Failed to reschedule interview: ${error.message}`);
    }

    const updatedInterview = await loadInterviewById(params.interviewId);
    await recordApplicationActivity({
      applicationId: params.applicationId,
      actorId: params.actorId,
      action: 'interview_rescheduled',
      oldValue: formatInterviewDateTimeLabel(existing.scheduled_at, existing.timezone || 'UTC'),
      newValue: formatInterviewDateTimeLabel(
        updatedInterview.scheduledAt,
        updatedInterview.timezone
      ),
      metadata: {
        interviewId: updatedInterview.id,
        mode: updatedInterview.mode,
        timezone: updatedInterview.timezone,
      },
    });

    let notifications: InterviewNotificationDeliveryResult | null = null;
    if (
      params.sendNotifications !== false &&
      automationSettings.autoSendRescheduleNotice
    ) {
      notifications = await deliverInterviewNotifications({
        interview: updatedInterview,
        applicationContext: context,
        type: 'reschedule',
      });

      if (notifications.delivered) {
        await updateInterviewDeliveryTimestamp({
          interviewId: updatedInterview.id,
          field: 'confirmation_sent_at',
        });

        await recordApplicationActivity({
          applicationId: params.applicationId,
          actorId: params.actorId,
          action: 'interview_reschedule_sent',
          metadata: {
            interviewId: updatedInterview.id,
            emailStatus: notifications.emailStatus,
            whatsappStatus: notifications.whatsappStatus,
          },
        });
      }
    }

    return {
      interview: await loadInterviewById(params.interviewId),
      notifications,
    };
  }

  const statusMap: Record<Exclude<InterviewLifecycleAction, 'reschedule'>, ApplicationInterviewView['status']> = {
    cancel: 'cancelled',
    complete: 'completed',
    no_show: 'no_show',
  };
  const activityMap: Record<Exclude<InterviewLifecycleAction, 'reschedule'>, string> = {
    cancel: 'interview_cancelled',
    complete: 'interview_completed',
    no_show: 'interview_no_show',
  };
  const nextStatus = statusMap[params.action];

  if (existing.status !== 'scheduled') {
    throw new Error(`Only scheduled interviews can be updated with action ${params.action}`);
  }

  const { error } = await db
    .from('application_interviews')
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.interviewId);

  if (error) {
    throw new Error(`Failed to update interview status: ${error.message}`);
  }

  await recordApplicationActivity({
    applicationId: params.applicationId,
    actorId: params.actorId,
    action: activityMap[params.action],
    oldValue: normalizeInterviewStatus(existing.status),
    newValue: nextStatus,
    metadata: {
      interviewId: params.interviewId,
    },
  });

  let notifications: InterviewNotificationDeliveryResult | null = null;
  if (
    params.action === 'cancel' &&
    params.sendNotifications !== false &&
    automationSettings.autoSendCancellationNotice
  ) {
    const updatedInterview = await loadInterviewById(params.interviewId);
    notifications = await deliverInterviewNotifications({
      interview: updatedInterview,
      applicationContext: context,
      type: 'cancellation',
    });

    if (notifications.delivered) {
      await updateInterviewDeliveryTimestamp({
        interviewId: updatedInterview.id,
        field: 'confirmation_sent_at',
      });

      await recordApplicationActivity({
        applicationId: params.applicationId,
        actorId: params.actorId,
        action: 'interview_cancel_notice_sent',
        metadata: {
          interviewId: updatedInterview.id,
          emailStatus: notifications.emailStatus,
          whatsappStatus: notifications.whatsappStatus,
        },
      });
    }
  } else if (
    params.action === 'complete' &&
    params.sendNotifications !== false &&
    automationSettings.autoSendCompletionFollowup
  ) {
    const updatedInterview = await loadInterviewById(params.interviewId);
    notifications = await deliverInterviewOutcomeFollowup({
      interview: updatedInterview,
      applicationContext: context,
      type: 'completion',
      customMessage: automationSettings.completionFollowupMessage,
    });

    if (notifications.delivered) {
      await recordApplicationActivity({
        applicationId: params.applicationId,
        actorId: params.actorId,
        action: 'interview_completion_followup_sent',
        metadata: {
          interviewId: updatedInterview.id,
          emailStatus: notifications.emailStatus,
          whatsappStatus: notifications.whatsappStatus,
        },
      });
    }
  } else if (
    params.action === 'no_show' &&
    params.sendNotifications !== false &&
    automationSettings.autoSendNoShowFollowup
  ) {
    const updatedInterview = await loadInterviewById(params.interviewId);
    notifications = await deliverInterviewOutcomeFollowup({
      interview: updatedInterview,
      applicationContext: context,
      type: 'no_show',
      customMessage: automationSettings.noShowFollowupMessage,
    });

    if (notifications.delivered) {
      await recordApplicationActivity({
        applicationId: params.applicationId,
        actorId: params.actorId,
        action: 'interview_no_show_followup_sent',
        metadata: {
          interviewId: updatedInterview.id,
          emailStatus: notifications.emailStatus,
          whatsappStatus: notifications.whatsappStatus,
        },
      });
    }
  }

  return {
    interview: await loadInterviewById(params.interviewId),
    notifications,
  };
}

export async function dispatchInterviewReminderForInterview(
  interviewId: string
): Promise<InterviewReminderDispatchResult> {
  const interview = await loadInterviewById(interviewId);
  if (interview.status !== 'scheduled') {
    throw new Error('Only scheduled interviews can receive reminders');
  }

  const context = await loadApplicationContext(interview.applicationId);
  const delivery = await deliverInterviewNotifications({
    interview,
    applicationContext: context,
    type: 'reminder',
  });

  if (delivery.delivered) {
    await updateInterviewDeliveryTimestamp({
      interviewId,
      field: 'reminder_sent_at',
    });

    await recordApplicationActivity({
      applicationId: interview.applicationId,
      actorId: interview.recruiterId,
      action: 'interview_reminder_sent',
      metadata: {
        interviewId,
        emailStatus: delivery.emailStatus,
        whatsappStatus: delivery.whatsappStatus,
      },
    });
  }

  return {
    interviewId,
    delivery,
  };
}

export async function respondToInterviewInvitation(params: {
  interviewId: string;
  candidateUserId: string;
  responseStatus: InterviewResponseStatus;
  note?: string | null;
}): Promise<ApplicationInterviewView> {
  const existing = await loadInterviewRowById(params.interviewId);

  if (existing.candidate_user_id !== params.candidateUserId) {
    throw new Error('Not authorized');
  }

  if (normalizeInterviewStatus(existing.status) !== 'scheduled') {
    throw new Error('Only scheduled interviews can be acknowledged');
  }

  const db = createServiceSupabaseClient();
  const nowIso = new Date().toISOString();
  const note = sanitizeText(params.note);

  const { error } = await db
    .from('application_interviews')
    .update({
      candidate_response_status: params.responseStatus,
      candidate_responded_at: nowIso,
      candidate_response_note: note,
      updated_at: nowIso,
    })
    .eq('id', params.interviewId);

  if (error) {
    throw new Error(`Failed to save candidate response: ${error.message}`);
  }

  await recordApplicationActivity({
    applicationId: existing.application_id,
    actorId: params.candidateUserId,
    action:
      params.responseStatus === 'confirmed'
        ? 'interview_candidate_confirmed'
        : 'interview_candidate_declined',
    oldValue: normalizeInterviewResponseStatus(existing.candidate_response_status),
    newValue: params.responseStatus,
    metadata: {
      interviewId: params.interviewId,
      note,
    },
  });

  return loadInterviewById(params.interviewId);
}

export async function dispatchUpcomingInterviewReminders(params?: {
  windowHours?: number;
}): Promise<{
  selectedInterviews: number;
  remindersSent: number;
  remindersSkipped: number;
  remindersFailed: number;
  results: Array<{
    interviewId: string;
    delivery?: InterviewNotificationDeliveryResult;
    error?: string;
  }>;
}> {
  const rawWindowHours =
    params?.windowHours ?? Number(process.env.INTERVIEW_REMINDER_WINDOW_HOURS || '4');
  const windowHours = Number.isFinite(rawWindowHours)
    ? Math.max(1, Math.min(48, Math.floor(rawWindowHours)))
    : 4;

  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString();
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_interviews')
    .select('id')
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', untilIso)
    .order('scheduled_at', { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load pending interview reminders: ${error.message}`);
  }

  const interviewIds = ((data || []) as Array<{ id: string }>).map((row) => row.id);
  const summary = {
    selectedInterviews: interviewIds.length,
    remindersSent: 0,
    remindersSkipped: 0,
    remindersFailed: 0,
    results: [] as Array<{
      interviewId: string;
      delivery?: InterviewNotificationDeliveryResult;
      error?: string;
    }>,
  };

  for (const interviewId of interviewIds) {
    try {
      const result = await dispatchInterviewReminderForInterview(interviewId);
      summary.results.push(result);

      if (result.delivery.delivered) {
        summary.remindersSent += 1;
      } else if (
        result.delivery.emailStatus === 'failed' ||
        result.delivery.whatsappStatus === 'failed'
      ) {
        summary.remindersFailed += 1;
      } else {
        summary.remindersSkipped += 1;
      }
    } catch (error) {
      summary.remindersFailed += 1;
      summary.results.push({
        interviewId,
        error: sanitizeError(error),
      });
    }
  }

  return summary;
}
