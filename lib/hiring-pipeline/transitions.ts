import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  defaultStageKeysForLegacyStatus,
  isLegacyApplicationStatus,
  mapStageTypeToLegacyStatus,
  type LegacyApplicationStatus,
} from '@/lib/hiring-pipeline/mapping';
import { sendApplicationStatusAlertWhatsapp } from '@/lib/messaging/whatsapp';

export type { LegacyApplicationStatus } from '@/lib/hiring-pipeline/mapping';

interface ApplicationTransitionRow {
  id: string;
  job_id: string;
  applicant_id: string;
  current_stage_id: string | null;
  status: string;
  is_draft: boolean | null;
  decision_status: string | null;
}

export interface HiringStageRow {
  id: string;
  job_pipeline_id: string;
  stage_key: string;
  label: string;
  stage_type: string;
  order_index: number;
  is_terminal: boolean;
  allows_feedback: boolean;
}

export interface StageTransitionResult {
  application: ApplicationTransitionRow;
  fromStage: HiringStageRow | null;
  toStage: HiringStageRow;
  legacyStatus: LegacyApplicationStatus;
  eventId: string | null;
  candidateNotification: CandidateStageNotificationResult | null;
}

interface StageNotificationContextRow {
  applicant_id: string;
  jobs:
    | {
        title: string | null;
        company_name: string | null;
      }
    | Array<{
        title: string | null;
        company_name: string | null;
      }>
    | null;
  profiles:
    | {
        role: string | null;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }
    | Array<{
        role: string | null;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }>
    | null;
}

interface StageNotificationContext {
  applicantId: string;
  applicantRole: string | null;
  applicantName: string;
  jobTitle: string;
  companyName: string;
}

interface WhatsappConversationRow {
  wa_phone: string;
}

export interface CandidateStageNotificationResult {
  channel: 'whatsapp';
  status: 'template' | 'text' | 'skipped' | 'failed';
  reason: string | null;
  message: string;
}

function sanitizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeSingle<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const compact = phone.replace(/\s+/g, '').trim();
  if (!compact) return null;

  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digitsOnly = compact.replace(/\D/g, '');
  return digitsOnly.length >= 8 ? `+${digitsOnly}` : null;
}

function applicantDisplayName(profile: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null) {
  if (!profile) return 'there';

  const composed = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  return composed || profile.full_name || 'there';
}

function buildApplicationsUrl(role: string | null): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/$/, '');
  const path = role === 'talent' ? '/dashboard/talent/applications' : '/dashboard/job-seeker/applications';
  return `${appUrl}${path}`;
}

function notificationSkipReason(
  toStage: HiringStageRow,
  trigger: string | undefined
): CandidateStageNotificationResult | null {
  if (trigger === 'pipeline_bootstrap') {
    return {
      channel: 'whatsapp',
      status: 'skipped',
      reason: 'pipeline_bootstrap',
      message: 'Pipeline bootstrap does not notify candidates.',
    };
  }

  if (trigger === 'interview_schedule') {
    return {
      channel: 'whatsapp',
      status: 'skipped',
      reason: 'interview_schedule_manages_notification',
      message: 'Interview scheduling already sends its own candidate notification.',
    };
  }

  if (!['review', 'interview', 'offer', 'hire', 'rejected'].includes(toStage.stage_type)) {
    return {
      channel: 'whatsapp',
      status: 'skipped',
      reason: 'stage_not_notifiable',
      message: 'This hiring stage does not send candidate WhatsApp alerts.',
    };
  }

  return null;
}

async function loadStageNotificationContext(
  applicationId: string
): Promise<StageNotificationContext | null> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('applications')
    .select(
      `
      applicant_id,
      jobs:job_id (
        title,
        company_name
      ),
      profiles:applicant_id (
        role,
        full_name,
        first_name,
        last_name
      )
    `
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load candidate notification context: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const row = data as StageNotificationContextRow;
  const job = normalizeSingle(row.jobs);
  const profile = normalizeSingle(row.profiles);

  return {
    applicantId: row.applicant_id,
    applicantRole: profile?.role || null,
    applicantName: applicantDisplayName(profile),
    jobTitle: job?.title || 'your application',
    companyName: job?.company_name || 'Joblinca',
  };
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
    throw new Error(`Failed to load candidate WhatsApp opt-in: ${error.message}`);
  }

  const row = ((data || []) as WhatsappConversationRow[])[0];
  return normalizeE164(row?.wa_phone || null);
}

function sanitizeNotificationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.length <= 200 ? message : `${message.slice(0, 197)}...`;
}

async function sendCandidateStageNotification(params: {
  applicationId: string;
  toStage: HiringStageRow;
  trigger?: string;
}): Promise<CandidateStageNotificationResult | null> {
  const skipped = notificationSkipReason(params.toStage, params.trigger);
  if (skipped) {
    return skipped;
  }

  try {
    const context = await loadStageNotificationContext(params.applicationId);
    if (!context) {
      return {
        channel: 'whatsapp',
        status: 'skipped',
        reason: 'missing_candidate_context',
        message: 'Candidate context is incomplete, so no WhatsApp alert was sent.',
      };
    }

    const phone = await loadOptedInWhatsappPhone(context.applicantId);
    if (!phone) {
      return {
        channel: 'whatsapp',
        status: 'skipped',
        reason: 'no_whatsapp_opt_in',
        message: 'No opted-in WhatsApp number was found for this applicant.',
      };
    }

    const delivery = await sendApplicationStatusAlertWhatsapp({
      to: phone,
      seekerName: context.applicantName,
      jobTitle: context.jobTitle,
      company: context.companyName,
      stageLabel: params.toStage.label,
      stageType: params.toStage.stage_type,
      applicationsUrl: buildApplicationsUrl(context.applicantRole),
      userId: context.applicantId,
    });

    return {
      channel: 'whatsapp',
      status: delivery,
      reason: null,
      message:
        delivery === 'template'
          ? 'WhatsApp alert sent with template delivery.'
          : 'WhatsApp alert sent with text fallback.',
    };
  } catch (error) {
    return {
      channel: 'whatsapp',
      status: 'failed',
      reason: 'send_failed',
      message: `WhatsApp alert failed: ${sanitizeNotificationError(error)}`,
    };
  }
}

async function ensureJobPipeline(jobId: string): Promise<string> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db.rpc('create_default_job_hiring_pipeline', {
    p_job_id: jobId,
  });

  if (error || !data) {
    throw new Error(`Failed to ensure hiring pipeline: ${error?.message || 'unknown_error'}`);
  }

  return data as string;
}

async function loadApplicationForTransition(
  applicationId: string
): Promise<ApplicationTransitionRow> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('applications')
    .select('id, job_id, applicant_id, current_stage_id, status, is_draft, decision_status')
    .eq('id', applicationId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Application not found');
  }

  return data as ApplicationTransitionRow;
}

async function loadPipelineStages(jobId: string): Promise<HiringStageRow[]> {
  const pipelineId = await ensureJobPipeline(jobId);
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('job_hiring_pipeline_stages')
    .select('id, job_pipeline_id, stage_key, label, stage_type, order_index, is_terminal, allows_feedback')
    .eq('job_pipeline_id', pipelineId)
    .order('order_index', { ascending: true });

  if (error) {
    throw new Error(`Failed to load hiring stages: ${error.message}`);
  }

  return (data || []) as HiringStageRow[];
}

function findStageById(stages: HiringStageRow[], stageId: string | null): HiringStageRow | null {
  if (!stageId) return null;
  return stages.find((stage) => stage.id === stageId) || null;
}

function resolveStageFromLegacyStatus(
  stages: HiringStageRow[],
  status: LegacyApplicationStatus,
  currentStageId?: string | null
): HiringStageRow | null {
  const currentStage = findStageById(stages, currentStageId || null);
  if (currentStage && mapStageTypeToLegacyStatus(currentStage.stage_type) === status) {
    return currentStage;
  }

  const preferredKeys = defaultStageKeysForLegacyStatus(status);

  for (const stageKey of preferredKeys) {
    const stage = stages.find((item) => item.stage_key === stageKey);
    if (stage) return stage;
  }

  return (
    stages.find((item) => mapStageTypeToLegacyStatus(item.stage_type) === status) || null
  );
}

async function insertStageEvent(params: {
  applicationId: string;
  actorId?: string | null;
  fromStageId?: string | null;
  toStageId: string;
  note?: string | null;
  reason?: string | null;
  trigger?: string | null;
}): Promise<string | null> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_stage_events')
    .insert({
      application_id: params.applicationId,
      actor_id: params.actorId || null,
      from_stage_id: params.fromStageId || null,
      to_stage_id: params.toStageId,
      note: params.note || null,
      transition_reason: params.reason || null,
      metadata: {
        trigger: params.trigger || 'manual',
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to record stage event: ${error.message}`);
  }

  return (data as { id: string } | null)?.id || null;
}

async function insertActivity(params: {
  applicationId: string;
  actorId?: string | null;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!params.actorId) return;

  const db = createServiceSupabaseClient();
  const { error } = await db.from('application_activity').insert({
    application_id: params.applicationId,
    actor_id: params.actorId,
    action: params.action,
    old_value: params.oldValue || null,
    new_value: params.newValue || null,
    metadata: params.metadata || {},
  });

  if (error) {
    throw new Error(`Failed to record application activity: ${error.message}`);
  }
}

export async function ensureApplicationPipelineStage(params: {
  applicationId: string;
  actorId?: string | null;
  trigger?: string;
}): Promise<StageTransitionResult | null> {
  const application = await loadApplicationForTransition(params.applicationId);
  if (application.is_draft) return null;
  if (application.current_stage_id) return null;

  if (!isLegacyApplicationStatus(application.status)) {
    throw new Error(`Unsupported application status for pipeline bootstrap: ${application.status}`);
  }

  return moveApplicationToLegacyStatus({
    applicationId: params.applicationId,
    actorId: params.actorId || null,
    status: application.status,
    reason: 'pipeline_bootstrap',
    trigger: params.trigger || 'pipeline_bootstrap',
  });
}

export async function moveApplicationToLegacyStatus(params: {
  applicationId: string;
  actorId?: string | null;
  status: LegacyApplicationStatus;
  note?: string | null;
  reason?: string | null;
  trigger?: string;
}): Promise<StageTransitionResult> {
  const application = await loadApplicationForTransition(params.applicationId);
  if (application.is_draft) {
    throw new Error('Draft applications cannot be moved through the hiring pipeline');
  }

  const stages = await loadPipelineStages(application.job_id);
  const targetStage = resolveStageFromLegacyStatus(
    stages,
    params.status,
    application.current_stage_id
  );

  if (!targetStage) {
    throw new Error(`No hiring stage configured for legacy status: ${params.status}`);
  }

  return moveApplicationToStage({
    applicationId: params.applicationId,
    actorId: params.actorId || null,
    toStageId: targetStage.id,
    note: params.note || null,
    reason: params.reason || null,
    trigger: params.trigger || 'legacy_status_move',
  });
}

export async function moveApplicationToStage(params: {
  applicationId: string;
  actorId?: string | null;
  toStageId?: string;
  toStageKey?: string;
  note?: string | null;
  reason?: string | null;
  trigger?: string;
}): Promise<StageTransitionResult> {
  const application = await loadApplicationForTransition(params.applicationId);
  if (application.is_draft) {
    throw new Error('Draft applications cannot be moved through the hiring pipeline');
  }

  const stages = await loadPipelineStages(application.job_id);
  const fromStage = findStageById(stages, application.current_stage_id);

  let toStage: HiringStageRow | null = null;
  if (params.toStageId) {
    toStage = findStageById(stages, params.toStageId);
  } else if (params.toStageKey) {
    toStage = stages.find((stage) => stage.stage_key === params.toStageKey) || null;
  }

  if (!toStage) {
    throw new Error('Target stage not found for this application');
  }

  if (fromStage?.id === toStage.id) {
    return {
      application,
      fromStage,
      toStage,
      legacyStatus: mapStageTypeToLegacyStatus(toStage.stage_type),
      eventId: null,
      candidateNotification: null,
    };
  }

  const legacyStatus = mapStageTypeToLegacyStatus(toStage.stage_type);
  const nextDecisionStatus =
    toStage.stage_type === 'hire'
      ? 'hired'
      : toStage.stage_type === 'rejected'
        ? 'rejected'
        : application.decision_status === 'withdrawn'
          ? 'withdrawn'
          : 'active';

  const db = createServiceSupabaseClient();
  const { data: updated, error } = await db
    .from('applications')
    .update({
      current_stage_id: toStage.id,
      stage_entered_at: new Date().toISOString(),
      status: legacyStatus,
      decision_status: nextDecisionStatus,
      disposition_reason:
        toStage.stage_type === 'rejected'
          ? sanitizeText(params.reason || params.note || null)
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.applicationId)
    .select('id, job_id, applicant_id, current_stage_id, status, is_draft, decision_status')
    .single();

  if (error || !updated) {
    throw new Error(error?.message || 'Failed to update application stage');
  }

  const eventId = await insertStageEvent({
    applicationId: params.applicationId,
    actorId: params.actorId || null,
    fromStageId: fromStage?.id || null,
    toStageId: toStage.id,
    note: sanitizeText(params.note || null),
    reason: sanitizeText(params.reason || null),
    trigger: params.trigger || 'manual',
  });

  await insertActivity({
    applicationId: params.applicationId,
    actorId: params.actorId || null,
    action: 'stage_changed',
    oldValue: fromStage?.label || null,
    newValue: toStage.label,
    metadata: {
      fromStageId: fromStage?.id || null,
      fromStageKey: fromStage?.stage_key || null,
      toStageId: toStage.id,
      toStageKey: toStage.stage_key,
      compatStatus: legacyStatus,
      trigger: params.trigger || 'manual',
      reason: sanitizeText(params.reason || null),
    },
  });

  if (application.status !== legacyStatus) {
    await insertActivity({
      applicationId: params.applicationId,
      actorId: params.actorId || null,
      action: 'status_changed',
      oldValue: application.status,
      newValue: legacyStatus,
      metadata: {
        source: 'structured_hiring_transition',
        stageId: toStage.id,
        stageKey: toStage.stage_key,
        trigger: params.trigger || 'manual',
      },
    });
  }

  const candidateNotification = await sendCandidateStageNotification({
    applicationId: params.applicationId,
    toStage,
    trigger: params.trigger,
  });

  if (candidateNotification) {
    const action =
      candidateNotification.status === 'failed'
        ? 'candidate_status_whatsapp_failed'
        : candidateNotification.status === 'skipped'
          ? 'candidate_status_whatsapp_skipped'
          : 'candidate_status_whatsapp_sent';

    await insertActivity({
      applicationId: params.applicationId,
      actorId: params.actorId || null,
      action,
      newValue: toStage.label,
      metadata: {
        channel: candidateNotification.channel,
        deliveryStatus: candidateNotification.status,
        reason: candidateNotification.reason,
        message: candidateNotification.message,
        stageId: toStage.id,
        stageKey: toStage.stage_key,
        trigger: params.trigger || 'manual',
      },
    }).catch(() => undefined);
  }

  return {
    application: updated as ApplicationTransitionRow,
    fromStage,
    toStage,
    legacyStatus,
    eventId,
    candidateNotification,
  };
}
