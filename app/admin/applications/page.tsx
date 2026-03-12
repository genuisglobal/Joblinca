import AdminApplicationsClient from './AdminApplicationsClient';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  loadJobPipelineBundle,
  mapCurrentStage,
  normalizeRelation,
} from '@/lib/hiring-pipeline/server';

type Applicant = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

type Job = {
  id: string;
  title: string | null;
  company_name: string | null;
};

type ApplicationRow = {
  id: string;
  status: string;
  decision_status: string | null;
  created_at: string;
  profiles: Applicant | Applicant[] | null;
  jobs: Job | Job[] | null;
  current_stage:
    | {
        id: string;
        stage_key: string;
        label: string;
        stage_type: string;
        order_index: number;
        is_terminal: boolean;
        allows_feedback: boolean;
      }
    | Array<{
        id: string;
        stage_key: string;
        label: string;
        stage_type: string;
        order_index: number;
        is_terminal: boolean;
        allows_feedback: boolean;
      }>
    | null;
};

function applicantName(profile: Applicant | null): string {
  if (!profile) return 'Unknown applicant';
  if (profile.first_name || profile.last_name) {
    return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  }
  return profile.full_name ?? 'Unknown applicant';
}

export default async function AdminApplicationsPage() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      decision_status,
      created_at,
      profiles:applicant_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      ),
      jobs:job_id (
        id,
        title,
        company_name
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
    .order('created_at', { ascending: false })
    .limit(100);

  const rows: ApplicationRow[] = (data ?? []) as ApplicationRow[];
  const jobIds = Array.from(
    new Set(
      rows
        .map((row) => normalizeRelation(row.jobs)?.id || null)
        .filter((jobId): jobId is string => Boolean(jobId))
    )
  );

  const pipelineResults = await Promise.allSettled(
    jobIds.map(async (jobId) => {
      const bundle = await loadJobPipelineBundle(jobId);
      return [
        jobId,
        bundle.pipeline.stages.map((stage) => ({
          id: stage.id,
          stageKey: stage.stageKey,
          label: stage.label,
          stageType: stage.stageType,
          orderIndex: stage.orderIndex,
        })),
      ] as const;
    })
  );

  const stageOptionsByJobId = Object.fromEntries(
    pipelineResults.flatMap((result) =>
      result.status === 'fulfilled' ? [[result.value[0], result.value[1]]] : []
    )
  );

  const initialApplications = rows.map((row) => {
    const profile = normalizeRelation(row.profiles);
    const job = normalizeRelation(row.jobs);

    return {
      id: row.id,
      status: row.status,
      decisionStatus: row.decision_status,
      createdAt: row.created_at,
      applicant: {
        id: profile?.id || row.id,
        name: applicantName(profile),
        email: profile?.email || null,
      },
      job: job
        ? {
            id: job.id,
            title: job.title || 'Untitled job',
            companyName: job.company_name || 'Unknown company',
          }
        : null,
      currentStage: mapCurrentStage(row.current_stage),
    };
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Applications</h1>
        <p className="text-gray-400 mt-1">
          Review applicants, move them through the pipeline, and reject or hire from admin.
        </p>
      </div>

      <AdminApplicationsClient
        initialApplications={initialApplications}
        stageOptionsByJobId={stageOptionsByJobId}
        loadError={error?.message ?? null}
      />
    </div>
  );
}
