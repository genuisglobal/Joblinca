import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserSubscription } from '@/lib/subscriptions';
import InterviewPrepClient, {
  type InterviewPrepApplicationOption,
} from './InterviewPrepClient';

type SuggestReason = 'scheduled_interview' | 'application';

interface PageProps {
  searchParams: Promise<{
    application?: string;
    suggest?: string;
  }>;
}

type Relation<T> = T | T[] | null | undefined;

interface ApplicationRow {
  id: string;
  created_at: string;
  jobs: Relation<{
    id: string;
    title: string | null;
    company_name: string | null;
    location: string | null;
    work_type: string | null;
  }>;
}

interface InterviewRow {
  application_id: string;
  scheduled_at: string;
  timezone: string | null;
  mode: string | null;
}

function normalizeRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function sortApplications(
  left: InterviewPrepApplicationOption,
  right: InterviewPrepApplicationOption
) {
  if (left.interviewAt && right.interviewAt) {
    return new Date(left.interviewAt).getTime() - new Date(right.interviewAt).getTime();
  }

  if (left.interviewAt) {
    return -1;
  }

  if (right.interviewAt) {
    return 1;
  }

  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function buildTeaserQuestion(application: InterviewPrepApplicationOption | null): string {
  if (!application) {
    return 'Tell me about yourself and why this role is the right next step for you.';
  }

  if (application.companyName) {
    return `Why are you a strong fit for the ${application.jobTitle} role at ${application.companyName}?`;
  }

  return `Why are you a strong fit for the ${application.jobTitle} role?`;
}

export default async function JobSeekerInterviewPrepPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const [subscription, applicationsResult, interviewsResult] = await Promise.all([
    getUserSubscription(user.id),
    supabase
      .from('applications')
      .select(
        `
        id,
        created_at,
        jobs:job_id (
          id,
          title,
          company_name,
          location,
          work_type
        )
      `
      )
      .eq('applicant_id', user.id)
      .eq('is_draft', false)
      .order('created_at', { ascending: false }),
    supabase
      .from('application_interviews')
      .select('application_id, scheduled_at, timezone, mode')
      .eq('candidate_user_id', user.id)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true }),
  ]);

  const nextInterviewByApplication = new Map<string, InterviewRow>();
  for (const interview of (interviewsResult.data || []) as InterviewRow[]) {
    if (!nextInterviewByApplication.has(interview.application_id)) {
      nextInterviewByApplication.set(interview.application_id, interview);
    }
  }

  const applications = ((applicationsResult.data || []) as ApplicationRow[])
    .map((application) => {
      const job = normalizeRelation(application.jobs);
      if (!job?.id || !job.title) {
        return null;
      }

      const nextInterview = nextInterviewByApplication.get(application.id) || null;
      return {
        id: application.id,
        jobTitle: job.title,
        companyName: job.company_name || null,
        jobLocation: job.location || null,
        workType: job.work_type || null,
        createdAt: application.created_at,
        interviewAt: nextInterview?.scheduled_at || null,
        interviewTimezone: nextInterview?.timezone || null,
        interviewMode: nextInterview?.mode || null,
      } satisfies InterviewPrepApplicationOption;
    })
    .filter(
      (application): application is InterviewPrepApplicationOption => application !== null
    )
    .sort(sortApplications);

  const requestedApplicationId =
    typeof params.application === 'string' ? params.application.trim() : '';
  const initialApplication =
    applications.find((application) => application.id === requestedApplicationId) ||
    applications[0] ||
    null;
  const initialApplicationId = initialApplication?.id || null;
  const suggestedReason: SuggestReason | null =
    params.suggest === 'scheduled_interview' || params.suggest === 'application'
      ? params.suggest
      : null;

  const hasActiveJobSeekerSubscription =
    subscription.isActive && subscription.plan?.role === 'job_seeker';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300/80">
            Subscribed Job Seekers
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">Interview Prep</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-400">
            Generate a practical prep pack from your real Joblinca application instead of
            starting from a blank page before an interview.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard/job-seeker/applications"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-600"
          >
            View Applications
          </Link>
          <Link
            href="/dashboard/subscription"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            {hasActiveJobSeekerSubscription ? 'Manage Plan' : 'Unlock Premium'}
          </Link>
        </div>
      </div>

      {!hasActiveJobSeekerSubscription ? (
        <div className="grid gap-6 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-900/30 to-gray-900 p-8 lg:grid-cols-[minmax(0,1.3fr),minmax(320px,0.9fr)]">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
              Premium Feature
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              AI interview simulation belongs to the job seeker subscription
            </h2>
            <p className="mt-4 text-sm leading-7 text-blue-50/85">
              The current pricing plans already promise AI interview support for job seekers.
              This page is designed to deliver that promise by generating role-specific prep packs,
              scored mock feedback, and saved practice sessions tied to your real applications.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-blue-500/20 bg-gray-950/30 p-4">
                <p className="text-sm font-semibold text-white">What unlocks</p>
                <ul className="mt-3 space-y-2 text-sm text-blue-50/80">
                  <li>Role-specific prep pack from your real application</li>
                  <li>Scored answer feedback with strengths and weak points</li>
                  <li>Saved mock interview sessions you can reopen later</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-blue-500/20 bg-gray-950/30 p-4">
                <p className="text-sm font-semibold text-white">Best time to use it</p>
                <ul className="mt-3 space-y-2 text-sm text-blue-50/80">
                  <li>Right after you submit an important application</li>
                  <li>Immediately after a recruiter schedules an interview</li>
                  <li>Any time you want scored practice, not generic tips</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/pricing?role=job_seeker&from=interview-prep"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                View Job Seeker Plans
              </Link>
              <Link
                href="/dashboard/subscription"
                className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-gray-700"
              >
                Billing & Subscription
              </Link>
              <Link
                href="/dashboard/job-seeker/applications"
                className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-100 transition hover:bg-gray-700"
              >
                View Applications
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-blue-400/20 bg-gray-950/40 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200/80">
              Free Teaser
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {initialApplication
                ? `Preview for ${initialApplication.jobTitle}`
                : 'Preview the interview coach'}
            </h3>
            <p className="mt-3 text-sm text-gray-300">
              {suggestedReason === 'scheduled_interview' && initialApplication?.interviewAt
                ? `You already have a scheduled interview for this application on ${new Date(
                    initialApplication.interviewAt
                  ).toLocaleString()}.`
                : initialApplication
                  ? `Joblinca can build a prep session from your ${initialApplication.jobTitle} application${initialApplication.companyName ? ` at ${initialApplication.companyName}` : ''}.`
                  : 'Pick one of your real applications and Joblinca will generate a prep plan from the evidence already on file.'}
            </p>
            <div className="mt-5 rounded-xl border border-gray-800 bg-gray-900/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                Sample interview question
              </p>
              <p className="mt-3 text-sm font-medium text-white">
                {buildTeaserQuestion(initialApplication)}
              </p>
              <p className="mt-3 text-sm text-gray-400">
                Full access adds scored feedback, a stronger rewritten answer, and the next mock
                question based on this same role.
              </p>
            </div>
            <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                What the full coach grades
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-200">
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2">
                  Relevance
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2">
                  Specificity
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2">
                  Structure
                </div>
                <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2">
                  Confidence
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : applications.length === 0 ? (
        <div className="rounded-2xl border border-gray-700 bg-gray-800 p-10 text-center">
          <h2 className="text-2xl font-semibold text-white">No submitted applications yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-gray-400">
            Interview prep becomes much more useful once it can anchor on a real job, your saved
            answers, and recruiter context.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/job-seeker/browse"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Browse Jobs
            </Link>
            <Link
              href="/dashboard/job-seeker/profile"
              className="inline-flex items-center gap-2 rounded-xl bg-gray-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-600"
            >
              Complete Profile
            </Link>
          </div>
        </div>
      ) : (
        <InterviewPrepClient
          applications={applications}
          subscriptionPlanName={subscription.plan?.name || null}
          initialApplicationId={initialApplicationId}
          suggestedApplicationId={suggestedReason ? initialApplicationId : null}
          suggestedReason={suggestedReason}
        />
      )}
    </div>
  );
}
