import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { ACTIVE_ADMIN_TYPES, type AdminType } from '@/lib/admin-types';
import type {
  ApplicationCurrentStage,
  ApplicationStageFeedbackView,
  HiringDecisionStatus,
  HiringPipeline,
  HiringPipelineStage,
  JobHiringRequirements,
} from '@/lib/hiring-pipeline/types';

type Relation<T> = T | T[] | null | undefined;

interface JobOwnershipRow {
  id: string;
  recruiter_id: string;
}

interface ApplicationOwnershipRow {
  id: string;
  job_id: string;
  applicant_id: string;
  current_stage_id: string | null;
  status: string;
  decision_status: HiringDecisionStatus | null;
  disposition_reason: string | null;
  reviewed_at?: string | null;
  jobs: Relation<JobOwnershipRow>;
  current_stage?: Relation<{
    id: string;
    stage_key: string;
    label: string;
    stage_type: string;
    order_index: number;
    is_terminal: boolean;
    allows_feedback: boolean;
  }>;
}

interface PipelineStageRow {
  id: string;
  job_pipeline_id: string;
  source_template_stage_id: string | null;
  stage_key: string;
  label: string;
  stage_type: string;
  order_index: number;
  score_weight: number | string | null;
  is_terminal: boolean;
  allows_feedback: boolean;
  config: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface PipelineRow {
  id: string;
  job_id: string;
  template_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stages: Relation<PipelineStageRow>;
}

interface RequirementsRow {
  id: string;
  job_id: string;
  must_have_skills: string[] | null;
  nice_to_have_skills: string[] | null;
  required_languages: string[] | null;
  education_requirements: string[] | null;
  min_years_experience: number | null;
  location_rules: Record<string, unknown> | null;
  screening_rules: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface FeedbackRow {
  id: string;
  application_id: string;
  reviewer_id: string;
  job_pipeline_stage_id: string;
  interview_scorecard_id: string | null;
  score: number | string | null;
  recommendation: ApplicationStageFeedbackView['recommendation'];
  summary: string | null;
  feedback: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  stage: Relation<{
    id: string;
    stage_key: string;
    label: string;
    stage_type: string;
    order_index: number;
    is_terminal: boolean;
    allows_feedback: boolean;
  }>;
  scorecard: Relation<{
    id: string;
    name: string;
    instructions: string | null;
  }>;
}

export function normalizeRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

async function loadAdminTypeForUser(userId: string): Promise<AdminType | null> {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('profiles')
    .select('admin_type')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate admin access: ${error.message}`);
  }

  return ((data as { admin_type?: AdminType | null } | null)?.admin_type || null) as AdminType | null;
}

async function isActiveAdminUser(userId: string): Promise<boolean> {
  const adminType = await loadAdminTypeForUser(userId);
  return Boolean(adminType && ACTIVE_ADMIN_TYPES.includes(adminType));
}

export function mapCurrentStage(
  value:
    | Relation<{
        id: string;
        stage_key: string;
        label: string;
        stage_type: string;
        order_index: number;
        is_terminal: boolean;
        allows_feedback: boolean;
      }>
    | null
    | undefined
): ApplicationCurrentStage | null {
  const stage = normalizeRelation(value);
  if (!stage) return null;

  return {
    id: stage.id,
    stageKey: stage.stage_key,
    label: stage.label,
    stageType: stage.stage_type,
    orderIndex: stage.order_index,
    isTerminal: stage.is_terminal,
    allowsFeedback: stage.allows_feedback,
  };
}

function mapPipelineStage(row: PipelineStageRow): HiringPipelineStage {
  return {
    id: row.id,
    jobPipelineId: row.job_pipeline_id,
    sourceTemplateStageId: row.source_template_stage_id,
    stageKey: row.stage_key,
    label: row.label,
    stageType: row.stage_type,
    orderIndex: row.order_index,
    scoreWeight: toNumber(row.score_weight),
    isTerminal: row.is_terminal,
    allowsFeedback: row.allows_feedback,
    config: row.config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function requireAuthenticatedUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Authentication required');
  }

  return user;
}

export async function requireRecruiterOwnedJob(jobId: string, userId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('jobs')
    .select('id, recruiter_id')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    throw new Error('Job not found');
  }

  if ((data as JobOwnershipRow).recruiter_id !== userId && !(await isActiveAdminUser(userId))) {
    throw new Error('Not authorized');
  }

  return data as JobOwnershipRow;
}

export async function requireRecruiterOwnedApplication(applicationId: string, userId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      id,
      job_id,
      applicant_id,
      current_stage_id,
      status,
      decision_status,
      disposition_reason,
      reviewed_at,
      jobs:job_id (
        id,
        recruiter_id
      ),
      current_stage:current_stage_id (
        id,
        stage_key,
        label,
        stage_type,
        order_index,
        is_terminal,
        allows_feedback
      )
    `
    )
    .eq('id', applicationId)
    .single();

  if (error || !data) {
    throw new Error('Application not found');
  }

  const application = data as ApplicationOwnershipRow;
  const job = normalizeRelation(application.jobs);

  if (!job) {
    throw new Error('Application not found');
  }

  if (job.recruiter_id !== userId && !(await isActiveAdminUser(userId))) {
    throw new Error('Not authorized');
  }

  return {
    ...application,
    jobs: job,
    currentStage: mapCurrentStage(application.current_stage),
  };
}

export async function requireApplicantOwnedApplication(applicationId: string, userId: string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('applications')
    .select('id, applicant_id, job_id')
    .eq('id', applicationId)
    .single();

  if (error || !data) {
    throw new Error('Application not found');
  }

  if ((data as { applicant_id: string }).applicant_id !== userId) {
    throw new Error('Not authorized');
  }

  return data as { id: string; applicant_id: string; job_id: string };
}

export async function ensureJobPipeline(jobId: string) {
  const db = createServiceSupabaseClient();
  const { error } = await db.rpc('create_default_job_hiring_pipeline', {
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(`Failed to ensure hiring pipeline: ${error.message}`);
  }
}

export async function loadJobPipelineBundle(jobId: string): Promise<{
  pipeline: HiringPipeline;
  requirements: JobHiringRequirements | null;
}> {
  await ensureJobPipeline(jobId);

  const db = createServiceSupabaseClient();
  const [{ data: pipelineData, error: pipelineError }, { data: requirementsData, error: requirementsError }] =
    await Promise.all([
      db
        .from('job_hiring_pipelines')
        .select(
          `
          id,
          job_id,
          template_id,
          name,
          is_active,
          created_at,
          updated_at,
          stages:job_hiring_pipeline_stages (
            id,
            job_pipeline_id,
            source_template_stage_id,
            stage_key,
            label,
            stage_type,
            order_index,
            score_weight,
            is_terminal,
            allows_feedback,
            config,
            created_at,
            updated_at
          )
        `
        )
        .eq('job_id', jobId)
        .single(),
      db
        .from('job_hiring_requirements')
        .select(
          `
          id,
          job_id,
          must_have_skills,
          nice_to_have_skills,
          required_languages,
          education_requirements,
          min_years_experience,
          location_rules,
          screening_rules,
          created_at,
          updated_at
        `
        )
        .eq('job_id', jobId)
        .maybeSingle(),
    ]);

  if (pipelineError || !pipelineData) {
    throw new Error(pipelineError?.message || 'Hiring pipeline not found');
  }

  if (requirementsError) {
    throw new Error(requirementsError.message);
  }

  const pipelineRow = pipelineData as PipelineRow;
  const stages = (Array.isArray(pipelineRow.stages) ? pipelineRow.stages : [])
    .map(mapPipelineStage)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const requirementsRow = (requirementsData || null) as RequirementsRow | null;

  return {
    pipeline: {
      id: pipelineRow.id,
      jobId: pipelineRow.job_id,
      templateId: pipelineRow.template_id,
      name: pipelineRow.name,
      isActive: pipelineRow.is_active,
      createdAt: pipelineRow.created_at,
      updatedAt: pipelineRow.updated_at,
      stages,
    },
    requirements: requirementsRow
      ? {
          id: requirementsRow.id,
          jobId: requirementsRow.job_id,
          mustHaveSkills: requirementsRow.must_have_skills || [],
          niceToHaveSkills: requirementsRow.nice_to_have_skills || [],
          requiredLanguages: requirementsRow.required_languages || [],
          educationRequirements: requirementsRow.education_requirements || [],
          minYearsExperience: requirementsRow.min_years_experience,
          locationRules: requirementsRow.location_rules || {},
          screeningRules: requirementsRow.screening_rules || {},
          createdAt: requirementsRow.created_at,
          updatedAt: requirementsRow.updated_at,
        }
      : null,
  };
}

export async function recordApplicationActivity(params: {
  applicationId: string;
  actorId: string;
  action: string;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
}) {
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

export async function refreshApplicationOverallStageScore(applicationId: string) {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_stage_feedback')
    .select('score')
    .eq('application_id', applicationId);

  if (error) {
    throw new Error(`Failed to load stage feedback scores: ${error.message}`);
  }

  const scores = (data || []).map((item) => toNumber((item as { score: number | string | null }).score));
  const averageScore = scores.length
    ? scores.reduce((sum, score) => sum + score, 0) / scores.length
    : 0;

  const { error: updateError } = await db
    .from('applications')
    .update({
      overall_stage_score: averageScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  if (updateError) {
    throw new Error(`Failed to update application stage score: ${updateError.message}`);
  }
}

export async function loadApplicationFeedback(applicationId: string) {
  const db = createServiceSupabaseClient();
  const { data, error } = await db
    .from('application_stage_feedback')
    .select(
      `
      id,
      application_id,
      reviewer_id,
      job_pipeline_stage_id,
      interview_scorecard_id,
      score,
      recommendation,
      summary,
      feedback,
      created_at,
      updated_at,
      stage:job_pipeline_stage_id (
        id,
        stage_key,
        label,
        stage_type,
        order_index,
        is_terminal,
        allows_feedback
      ),
      scorecard:interview_scorecard_id (
        id,
        name,
        instructions
      )
    `
    )
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load stage feedback: ${error.message}`);
  }

  return ((data || []) as FeedbackRow[]).map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    reviewerId: row.reviewer_id,
    stageId: row.job_pipeline_stage_id,
    scorecardId: row.interview_scorecard_id,
    score: toNumber(row.score),
    recommendation: row.recommendation,
    summary: row.summary,
    feedback: row.feedback || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stage: mapCurrentStage(row.stage),
    scorecard: normalizeRelation(row.scorecard),
  }));
}
