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
  countApplicationsByOpportunityLabel,
  countUpcomingInterviews,
  isApplicationActive,
  normalizeInterviewSlotRow,
  normalizeInterviewRow,
  normalizeApplicationRow,
  type CandidateApplicationRecord,
} from '@/lib/applications/dashboard';

interface Skill {
  name: string;
  rating: number;
}

interface Project {
  id: string;
  title: string;
  description: string;
  public: boolean;
  github_url: string | null;
  youtube_url: string | null;
  created_at: string;
}

interface Certification {
  id: string;
  name: string;
}

export default function TalentDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [certifications, setCertifications] = useState<Certification[]>([]);
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

        const [
          talentProfileResult,
          projectsResult,
          certificationsResult,
          applicationsResult,
          interviewsResult,
          slotsResult,
        ] =
          await Promise.all([
            supabase
              .from('talent_profiles')
              .select('skills')
              .eq('user_id', user.id)
              .single(),
            supabase
              .from('projects')
              .select('*')
              .eq('candidate_id', user.id)
              .order('created_at', { ascending: false }),
            supabase
              .from('certifications')
              .select('*')
              .eq('candidate_id', user.id),
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

        setSkills(talentProfileResult.data?.skills || []);
        setProjects(projectsResult.data || []);
        setCertifications(certificationsResult.data || []);
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

  const totalProjects = projects.length;
  const publicProjects = projects.filter((project) => project.public).length;
  const totalCertifications = certifications.length;
  const recentProjects = projects.slice(0, 3);
  const activeApplications = applications.filter(isApplicationActive);
  const educationalInternships = countApplicationsByOpportunityLabel(
    applications,
    'Educational Internship'
  );
  const professionalInternships = countApplicationsByOpportunityLabel(
    applications,
    'Professional Internship'
  );
  const interviewsCount = countUpcomingInterviews(applications);
  const recentApplications = applications.slice(0, 3);

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
          title="Educational Internships"
          value={educationalInternships}
          color="green"
          icon={
            <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422A12.083 12.083 0 0112 20.055a12.083 12.083 0 01-6.16-9.477L12 14z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Professional Internships"
          value={professionalInternships}
          color="purple"
          icon={
            <svg className="h-6 w-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Interviews"
          value={interviewsCount}
          color="yellow"
          icon={
            <svg className="h-6 w-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard/talent/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Project
        </Link>
        <Link
          href="/dashboard/talent/applications"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
        >
          My Applications
        </Link>
        <Link
          href="/dashboard/talent/profile"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-white transition-colors hover:bg-gray-600"
        >
          Edit Profile
        </Link>
      </div>

      <div className="rounded-xl bg-gray-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent Applications</h2>
            <p className="mt-1 text-sm text-gray-400">
              Monitor ATS progress without leaving your talent workspace.
            </p>
          </div>
          <Link
            href="/dashboard/talent/applications"
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="mb-4 text-gray-400">
              No applications yet. Browse internships that fit your portfolio and skills.
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              Browse Opportunities
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
        description="Upcoming interviews and recruiter instructions for your internships and opportunities."
        emptyMessage="No interview has been scheduled on your applications yet."
        onInterviewUpdated={(interview) =>
          setApplications((current) =>
            applyInterviewUpdateToApplications(current, interview)
          )
        }
      />

      <div className="rounded-xl bg-gray-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Recent Projects</h2>
            <p className="mt-1 text-sm text-gray-400">
              {totalProjects} total projects, {publicProjects} public, {totalCertifications} certifications.
            </p>
          </div>
          <Link
            href="/dashboard/talent/projects"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            View All
          </Link>
        </div>

        {recentProjects.length === 0 ? (
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="mb-4 text-gray-400">
              No projects yet. Add public work to strengthen professional internship applications.
            </p>
            <Link
              href="/dashboard/talent/projects/new"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              Add Your First Project
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/talent/projects/${project.id}`}
                className="rounded-lg bg-gray-700/50 p-4 transition-colors hover:bg-gray-700"
              >
                <h3 className="mb-2 font-medium text-white">{project.title}</h3>
                {project.description && (
                  <p className="mb-3 line-clamp-2 text-sm text-gray-400">{project.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {project.github_url && <span>GitHub</span>}
                  {project.youtube_url && <span>Demo</span>}
                  <span className={project.public ? 'text-green-400' : 'text-gray-400'}>
                    {project.public ? 'Public' : 'Private'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-gray-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Your Skills</h2>
          <Link
            href="/dashboard/talent/profile"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Edit Skills
          </Link>
        </div>
        {skills.length === 0 ? (
          <p className="text-gray-400">
            No skills added yet. Add skills to improve internship matching and recruiter confidence.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-2"
              >
                <span className="text-white">{skill.name}</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg
                      key={star}
                      className={`h-4 w-4 ${
                        star <= skill.rating ? 'text-yellow-400' : 'text-gray-600'
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
