'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StatsCard from '../components/StatsCard';
import ApplicationProgressCard from '@/components/applications/ApplicationProgressCard';
import UpcomingInterviewsPanel from '@/components/applications/UpcomingInterviewsPanel';
import {
  applyInterviewUpdateToApplications,
  attachInterviewsToApplications,
  attachInterviewSlotsToApplications,
  countApplicationsAtStageTypes,
  countUpcomingInterviews,
  getApplicationDisplayStatus,
  isApplicationActive,
  normalizeInterviewSlotRow,
  normalizeInterviewRow,
  normalizeApplicationRow,
  type CandidateApplicationRecord,
} from '@/lib/applications/dashboard';

export default function JobSeekerDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<CandidateApplicationRecord[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
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

        const [applicationsResult, interviewsResult, slotsResult] = await Promise.all([
          supabase
            .from('applications')
            .select(
              `
              id,
              status,
              is_draft,
              created_at,
              stage_entered_at,
              decision_status,
              cover_letter,
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
                location,
                work_type,
                job_type,
                internship_track
              )
            `
            )
            .eq('applicant_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('application_interviews')
            .select(
              `
              id,
              application_id,
              scheduled_at,
              timezone,
              mode,
                location,
                meeting_url,
                notes,
                status,
                candidate_response_status,
                candidate_responded_at,
                candidate_response_note,
                confirmation_sent_at,
                reminder_sent_at
              `
            )
            .eq('candidate_user_id', user.id)
            .order('scheduled_at', { ascending: true }),
          supabase
            .from('application_interview_slots')
            .select(
              `
              id,
              application_id,
              scheduled_at,
              timezone,
              mode,
              location,
              meeting_url,
              notes,
              status,
              booked_interview_id,
              invitation_sent_at
            `
            )
            .eq('candidate_user_id', user.id)
            .order('scheduled_at', { ascending: true }),
        ]);

        if (!mounted) return;

        setApplications(
          attachInterviewSlotsToApplications(
            attachInterviewsToApplications(
              (applicationsResult.data || []).map(normalizeApplicationRow),
              (interviewsResult.data || []).map(normalizeInterviewRow)
            ),
            (slotsResult.data || []).map(normalizeInterviewSlotRow)
          )
        );
        setLoading(false);
      } catch (err) {
        console.error('Dashboard load error:', err);
        if (mounted) {
          router.replace('/auth/login');
        }
      }
    }

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const liveApplications = applications.filter((application) => !application.isDraft);
  const activeApplications = liveApplications.filter(isApplicationActive);
  const inReviewCount = countApplicationsAtStageTypes(applications, [
    'applied',
    'screening',
    'review',
  ]);
  const interviewsCount = countUpcomingInterviews(applications);
  const offersCount = activeApplications.filter((application) => {
    return application.currentStage?.stageType === 'offer' || application.decisionStatus === 'hired';
  }).length;
  const recentApplications = applications.slice(0, 3);
  const draftCount = applications.filter((application) => getApplicationDisplayStatus(application) === 'draft').length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Applications"
          value={activeApplications.length}
          color="blue"
          icon={
            <svg className="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="In Review"
          value={inReviewCount}
          color="yellow"
          icon={
            <svg className="h-6 w-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Interviews"
          value={interviewsCount}
          color="purple"
          icon={
            <svg className="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Offers / Drafts"
          value={offersCount + draftCount}
          color="green"
          icon={
            <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard/job-seeker/browse"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Browse Jobs
        </Link>
        <Link
          href="/dashboard/job-seeker/applications"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
        >
          View All Applications
        </Link>
        <Link
          href="/dashboard/job-seeker/profile"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
        >
          Edit Profile
        </Link>
      </div>

      <div className="rounded-xl bg-gray-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Recent Applications</h2>
          <Link
            href="/dashboard/job-seeker/applications"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            View All
          </Link>
        </div>

        {recentApplications.length === 0 ? (
          <div className="py-8 text-center">
            <svg
              className="mx-auto mb-4 h-16 w-16 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="mb-4 text-gray-400">No applications yet.</p>
            <Link
              href="/dashboard/job-seeker/browse"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              Start Exploring Jobs
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {recentApplications.map((application) => (
              <ApplicationProgressCard
                key={application.id}
                application={application}
                compact
              />
            ))}
          </div>
        )}
      </div>

      <UpcomingInterviewsPanel
        applications={applications}
        description="Stay on top of confirmed interviews, meeting links, and recruiter instructions."
        emptyMessage="No interview has been scheduled for your applications yet."
        onInterviewUpdated={(interview) =>
          setApplications((current) =>
            applyInterviewUpdateToApplications(current, interview)
          )
        }
      />

      <div className="rounded-xl border border-blue-700/30 bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-blue-500/20 p-3">
              <svg className="h-7 w-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Skill Up</h3>
              <p className="text-sm text-gray-300">
                Learn new skills with micro-courses to improve your match quality.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/skillup"
            className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            Start Learning
          </Link>
        </div>
      </div>

      <div className="rounded-xl bg-gray-800 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Tips for Success</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-gray-700/50 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20">
              <svg className="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="mb-1 font-medium text-white">Keep Resume Updated</h3>
            <p className="text-sm text-gray-400">
              Your current stage and recruiter feedback are only as strong as the information you submit.
            </p>
          </div>
          <div className="rounded-lg bg-gray-700/50 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-green-600/20">
              <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <h3 className="mb-1 font-medium text-white">Personalize Applications</h3>
            <p className="text-sm text-gray-400">
              Targeted cover letters and complete answers help you move faster through screening and review stages.
            </p>
          </div>
          <div className="rounded-lg bg-gray-700/50 p-4">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/20">
              <svg className="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <h3 className="mb-1 font-medium text-white">Stay Active</h3>
            <p className="text-sm text-gray-400">
              Monitor stage changes and continue any saved draft before the job closes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
