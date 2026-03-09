import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  defaultStageKeysForLegacyStatus,
  isLegacyApplicationStatus,
  mapStageTypeToLegacyStatus,
  type LegacyApplicationStatus,
} from '@/lib/hiring-pipeline/mapping';

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
}

function sanitizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
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

  return {
    application: updated as ApplicationTransitionRow,
    fromStage,
    toStage,
    legacyStatus,
    eventId,
  };
}
