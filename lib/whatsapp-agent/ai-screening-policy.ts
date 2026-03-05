import { createServiceSupabaseClient } from '@/lib/supabase/service';

const aiPolicyDb = createServiceSupabaseClient();

const RECRUITER_AI_ENABLED_PLANS = new Set([
  'recruiter_trusted',
  'recruiter_premium',
]);

export interface AiScreeningDecision {
  enabled: boolean;
  source:
    | 'job_override'
    | 'recruiter_default'
    | 'recruiter_plan'
    | 'hiring_tier'
    | 'global_default';
  planSlug: string | null;
}

export interface AiScreeningDecisionInput {
  jobOverride: boolean | null;
  recruiterDefault: boolean | null;
  recruiterPlanSlug: string | null;
  hiringTier: string | null;
  globalDefaultEnabled: boolean;
}

export interface AiScreeningJobContext {
  recruiter_id: string;
  hiring_tier: string | null;
  wa_ai_screening_enabled: boolean | null;
}

export function deriveAiScreeningDecision(
  input: AiScreeningDecisionInput
): AiScreeningDecision {
  if (typeof input.jobOverride === 'boolean') {
    return {
      enabled: input.jobOverride,
      source: 'job_override',
      planSlug: input.recruiterPlanSlug,
    };
  }

  if (typeof input.recruiterDefault === 'boolean') {
    return {
      enabled: input.recruiterDefault,
      source: 'recruiter_default',
      planSlug: input.recruiterPlanSlug,
    };
  }

  if (input.recruiterPlanSlug && RECRUITER_AI_ENABLED_PLANS.has(input.recruiterPlanSlug)) {
    return {
      enabled: true,
      source: 'recruiter_plan',
      planSlug: input.recruiterPlanSlug,
    };
  }

  if (
    input.hiringTier &&
    ['tier2_shortlist', 'tier3_managed', 'tier4_partner'].includes(input.hiringTier)
  ) {
    return {
      enabled: true,
      source: 'hiring_tier',
      planSlug: input.recruiterPlanSlug,
    };
  }

  return {
    enabled: input.globalDefaultEnabled,
    source: 'global_default',
    planSlug: input.recruiterPlanSlug,
  };
}

async function resolveRecruiterPlanSlug(
  recruiterId: string
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: subs, error: subError } = await aiPolicyDb
    .from('subscriptions')
    .select('plan_id, end_date, created_at')
    .eq('user_id', recruiterId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(10);

  if (subError || !subs || subs.length === 0) {
    return null;
  }

  const validSubs = subs.filter((sub) => !sub.end_date || sub.end_date >= today);
  const planIds = validSubs
    .map((sub) => sub.plan_id)
    .filter((id): id is string => Boolean(id));

  if (planIds.length === 0) {
    return null;
  }

  const { data: plans, error: planError } = await aiPolicyDb
    .from('pricing_plans')
    .select('id, slug, role')
    .in('id', planIds);

  if (planError || !plans || plans.length === 0) {
    return null;
  }

  const recruiterPlanById = new Map(
    plans
      .filter((plan) => plan.role === 'recruiter')
      .map((plan) => [plan.id, plan.slug])
  );

  for (const sub of validSubs) {
    const slug = recruiterPlanById.get(sub.plan_id);
    if (slug) return slug;
  }

  return null;
}

export async function resolveAiScreeningDecisionForJob(
  job: AiScreeningJobContext
): Promise<AiScreeningDecision> {
  let recruiterDefault: boolean | null = null;
  let recruiterPlanSlug: string | null = null;

  const { data: recruiterProfile } = await aiPolicyDb
    .from('recruiter_profiles')
    .select('wa_ai_screening_enabled')
    .eq('user_id', job.recruiter_id)
    .maybeSingle();

  if (typeof recruiterProfile?.wa_ai_screening_enabled === 'boolean') {
    recruiterDefault = recruiterProfile.wa_ai_screening_enabled;
  }

  recruiterPlanSlug = await resolveRecruiterPlanSlug(job.recruiter_id);
  const globalDefaultEnabled =
    (process.env.WA_AI_SCREENING_DEFAULT_ENABLED || '').toLowerCase() === 'true';

  return deriveAiScreeningDecision({
    jobOverride: job.wa_ai_screening_enabled,
    recruiterDefault,
    recruiterPlanSlug,
    hiringTier: job.hiring_tier,
    globalDefaultEnabled,
  });
}

