'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '../../../components/StatusBadge';
import ApplicationsTable from './ApplicationsTable';
import MatchInsightsPanel from '@/components/jobs/MatchInsightsPanel';
import PipelineEditor from '@/components/hiring-pipeline/PipelineEditor';
import InterviewAutomationEditor from '@/components/interview-scheduling/InterviewAutomationEditor';
import InterviewSelfScheduleEditor from '@/components/interview-scheduling/InterviewSelfScheduleEditor';
import type { ApplicationCurrentStage, HiringPipelineStage } from '@/lib/hiring-pipeline/types';
import {
  DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS,
  type JobInterviewAutomationSettings,
} from '@/lib/interview-scheduling/automation';
import {
  DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS,
  type JobInterviewSelfScheduleSettings,
} from '@/lib/interview-scheduling/self-schedule';
import { describeEligibleRoles, getOpportunityTypeLabel } from '@/lib/opportunities';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  work_type: string | null;
  job_type: string | null;
  internship_track: string | null;
  eligible_roles: string[] | null;
  salary: number | null;
  visibility: string | null;
  published: boolean;
  approval_status: string | null;
  rejection_reason: string | null;
  description: string | null;
  custom_questions: unknown[] | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  answers: unknown[] | null;
  status: string;
  created_at: string;
  profiles: Profile;
  current_stage_id: string | null;
  stage_entered_at: string | null;
  decision_status: string | null;
  eligibility_status: 'eligible' | 'needs_review' | 'ineligible' | null;
  overall_stage_score: number | null;
  recruiter_rating: number | null;
  ranking_score: number | null;
  ranking_breakdown: Record<string, number> | null;
  current_stage: ApplicationCurrentStage | null;
}

interface HiringPipelineResponse {
  pipeline: {
    id: string;
    name: string;
    stages: HiringPipelineStage[];
  };
}

interface InterviewAutomationResponse {
  settings: JobInterviewAutomationSettings;
}

interface InterviewSelfScheduleResponse {
  settings: JobInterviewSelfScheduleSettings;
}

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default function RecruiterJobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [pipelineName, setPipelineName] = useState('Structured Hiring');
  const [pipelineStages, setPipelineStages] = useState<HiringPipelineStage[]>([]);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [automationSettings, setAutomationSettings] = useState<JobInterviewAutomationSettings>(
    DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS
  );
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [selfScheduleSettings, setSelfScheduleSettings] =
    useState<JobInterviewSelfScheduleSettings>(
      DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS
    );
  const [savingSelfSchedule, setSavingSelfSchedule] = useState(false);
  const showCreatedNotice = searchParams.get('created') === '1';

  useEffect(() => {
    let mounted = true;

    async function loadJobData() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          router.replace('/auth/login');
          return;
        }

        // Fetch job details
        const { data: jobData, error: jobError } = await supabase
          .from('jobs')
          .select('*')
          .eq('id', params.id)
          .eq('recruiter_id', user.id)
          .single();

        if (!mounted) return;

        if (jobError || !jobData) {
          router.replace('/dashboard/recruiter/jobs');
          return;
        }

        setJob(jobData);

        const pipelineResponse = await fetch(`/api/jobs/${params.id}/pipeline`, {
          credentials: 'include',
        });
        if (pipelineResponse.ok) {
          const pipelineData = (await pipelineResponse.json()) as HiringPipelineResponse;
          setPipelineName(pipelineData.pipeline?.name || 'Structured Hiring');
          setPipelineStages(pipelineData.pipeline?.stages || []);
        }

        const automationResponse = await fetch(`/api/jobs/${params.id}/interview-automation`, {
          credentials: 'include',
        });
        if (automationResponse.ok) {
          const automationData =
            (await automationResponse.json()) as InterviewAutomationResponse;
          setAutomationSettings(
            automationData.settings || DEFAULT_JOB_INTERVIEW_AUTOMATION_SETTINGS
          );
        }

        const selfScheduleResponse = await fetch(
          `/api/jobs/${params.id}/interview-self-schedule`,
          {
            credentials: 'include',
          }
        );
        if (selfScheduleResponse.ok) {
          const selfScheduleData =
            (await selfScheduleResponse.json()) as InterviewSelfScheduleResponse;
          setSelfScheduleSettings(
            selfScheduleData.settings || DEFAULT_JOB_INTERVIEW_SELF_SCHEDULE_SETTINGS
          );
        }

        // Fetch applications for this job
        const { data: appsData } = await supabase
          .from('applications')
          .select(
            `
            *,
            current_stage:current_stage_id (
              id,
              stage_key,
              label,
              stage_type,
              order_index,
              is_terminal,
              allows_feedback
            ),
            profiles:applicant_id (
              id,
              full_name,
              first_name,
              last_name,
              avatar_url
            )
          `
          )
          .eq('job_id', params.id)
          .order('created_at', { ascending: false });

        if (!mounted) return;

        const normalizedApplications = (appsData || []).map((app: any) => ({
          ...app,
          profiles: normalizeRelation(app.profiles),
          current_stage: (() => {
            const stage = normalizeRelation(app.current_stage);
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
          })(),
        }));

        setApplications(normalizedApplications as Application[]);
        setLoading(false);
      } catch (err) {
        console.error('Job detail load error:', err);
        if (mounted) {
          router.replace('/dashboard/recruiter/jobs');
        }
      }
    }

    loadJobData();

    return () => {
      mounted = false;
    };
  }, [supabase, router, params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track);
  const eligibleRoleSummary = describeEligibleRoles(
    job.eligible_roles,
    job.job_type,
    job.internship_track,
    job.visibility
  );

  const handlePipelineSave = async (payload: {
    name: string;
    stages: Array<{
      id: string;
      label: string;
      orderIndex: number;
      allowsFeedback: boolean;
    }>;
  }) => {
    setSavingPipeline(true);
    try {
      const response = await fetch(`/api/jobs/${params.id}/pipeline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || 'Failed to save hiring pipeline');
      }

      const data = (await response.json()) as HiringPipelineResponse;
      setPipelineName(data.pipeline?.name || payload.name);
      setPipelineStages(data.pipeline?.stages || []);
      setApplications((currentApplications) =>
        currentApplications.map((application) => {
          const updatedStage = data.pipeline?.stages?.find(
            (stage) => stage.id === application.current_stage_id
          );

          if (!updatedStage) {
            return application;
          }

          return {
            ...application,
            current_stage: {
              id: updatedStage.id,
              stageKey: updatedStage.stageKey,
              label: updatedStage.label,
              stageType: updatedStage.stageType,
              orderIndex: updatedStage.orderIndex,
              isTerminal: updatedStage.isTerminal,
              allowsFeedback: updatedStage.allowsFeedback,
            },
          };
        })
      );
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setSavingPipeline(false);
    }
  };

  const handleAutomationSave = async (settings: JobInterviewAutomationSettings) => {
    setSavingAutomation(true);
    try {
      const response = await fetch(`/api/jobs/${params.id}/interview-automation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || 'Failed to save interview automation');
      }

      const data = (await response.json()) as InterviewAutomationResponse;
      setAutomationSettings(data.settings || settings);
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setSavingAutomation(false);
    }
  };

  const handleSelfScheduleSave = async (
    settings: JobInterviewSelfScheduleSettings
  ) => {
    setSavingSelfSchedule(true);
    try {
      const response = await fetch(`/api/jobs/${params.id}/interview-self-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || 'Failed to save self-schedule settings');
      }

      const data = (await response.json()) as InterviewSelfScheduleResponse;
      setSelfScheduleSettings(data.settings || settings);
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      setSavingSelfSchedule(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/recruiter/jobs"
            className="text-gray-400 hover:text-white text-sm mb-2 inline-flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Jobs
          </Link>
          <h1 className="text-2xl font-bold text-white">{job.title}</h1>
          {job.company_name && (
            <p className="text-gray-400">{job.company_name}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              {opportunityLabel}
            </span>
            <span className="inline-flex rounded-full border border-gray-600 bg-gray-700/60 px-3 py-1 text-xs font-medium text-gray-200">
              {eligibleRoleSummary}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={job.approval_status || (job.published ? 'published' : 'pending')} />
          <Link
            href={`/jobs/${job.id}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Edit Job
          </Link>
          <Link
            href={`/jobs/${job.id}`}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            target="_blank"
          >
            Preview
          </Link>
        </div>
      </div>

      {/* Rejection Notice */}
      {job.approval_status === 'rejected' && job.rejection_reason && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-medium text-red-400">Job Rejected</h3>
              <p className="text-gray-300 mt-1">{job.rejection_reason}</p>
              <p className="text-sm text-gray-400 mt-2">
                Please update your job posting and contact support if you have questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {showCreatedNotice && (
        <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-medium text-blue-400">Job Submitted</h3>
              <p className="text-gray-300 mt-1">
                Your job has been created. It is pending review and will appear on the public jobs page once an admin approves it.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Approval Notice */}
      {job.approval_status === 'pending' && (
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-medium text-yellow-400">Pending Approval</h3>
              <p className="text-gray-300 mt-1">
                Your job posting is being reviewed by our team. It will be visible to candidates once approved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Job Info */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Job Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-400">Location</p>
            <p className="text-white">{job.location || 'Not specified'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Work Type</p>
            <p className="text-white capitalize">
              {job.work_type || 'On-site'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Salary</p>
            <p className="text-white">
              {job.salary ? `${job.salary.toLocaleString()} XAF` : 'Not disclosed'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Opportunity Type</p>
            <p className="text-white">{opportunityLabel}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Visibility</p>
            <p className="text-white capitalize">
              {job.visibility || 'Public'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Posted</p>
            <p className="text-white">
              {new Date(job.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Eligible Profiles</p>
            <p className="text-white">{eligibleRoleSummary}</p>
          </div>
        </div>
        <div className="mt-6">
          <p className="text-sm text-gray-400 mb-2">Description</p>
          <p className="text-gray-300 whitespace-pre-wrap">{job.description}</p>
        </div>
      </div>

      <MatchInsightsPanel jobId={job.id} />

      {pipelineStages.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Hiring Pipeline</h2>
            <p className="text-sm text-gray-400 mt-1">
              Edit stage labels, order, and feedback availability for this job.
            </p>
          </div>
          <PipelineEditor
            pipelineName={pipelineName}
            stages={pipelineStages}
            saving={savingPipeline}
            onSave={handlePipelineSave}
          />
        </div>
      )}

      <InterviewAutomationEditor
        settings={automationSettings}
        saving={savingAutomation}
        onSave={handleAutomationSave}
      />

      <InterviewSelfScheduleEditor
        settings={selfScheduleSettings}
        saving={savingSelfSchedule}
        onSave={handleSelfScheduleSave}
      />

      {/* Applications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">
            Applications ({applications.length})
          </h2>
        </div>
        <ApplicationsTable
          applications={applications as Parameters<typeof ApplicationsTable>[0]['applications']}
          jobId={params.id}
          pipelineStages={pipelineStages}
          customQuestions={job.custom_questions as Parameters<typeof ApplicationsTable>[0]['customQuestions']}
        />
      </div>
    </div>
  );
}
