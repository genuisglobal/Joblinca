import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ApplicationProgressCard from '@/components/applications/ApplicationProgressCard';
import UpcomingInterviewsPanel from '@/components/applications/UpcomingInterviewsPanel';
import {
  attachInterviewSlotsToApplications,
  attachInterviewsToApplications,
  normalizeInterviewSlotRow,
  normalizeApplicationRow,
  normalizeInterviewRow,
} from '@/lib/applications/dashboard';

export default async function MyApplicationsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
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

  const normalizedApplications = attachInterviewSlotsToApplications(
    attachInterviewsToApplications(
      (applicationsResult.data || []).map(normalizeApplicationRow),
      (interviewsResult.data || []).map(normalizeInterviewRow)
    ),
    (slotsResult.data || []).map(normalizeInterviewSlotRow)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Applications</h1>
          <p className="mt-1 text-gray-400">
            Track the current stage, outcome, and next step for every application.
          </p>
        </div>
        <Link
          href="/dashboard/job-seeker/browse"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          Browse More Jobs
        </Link>
      </div>

      {normalizedApplications.length === 0 ? (
        <div className="rounded-xl bg-gray-800 p-12 text-center">
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mb-2 text-xl font-semibold text-white">No applications yet</h3>
          <p className="mb-6 text-gray-400">
            Start your job search and apply to positions that match your skills.
          </p>
          <Link
            href="/dashboard/job-seeker/browse"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
          >
            Browse Jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <UpcomingInterviewsPanel
            applications={normalizedApplications}
            emptyMessage="No upcoming interviews across your applications yet."
          />
          <div className="space-y-4">
            {normalizedApplications.map((application) => (
              <ApplicationProgressCard
                key={application.id}
                application={application}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
