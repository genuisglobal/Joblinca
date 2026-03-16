import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { canRoleApplyToOpportunity } from '@/lib/opportunities';
import { getRequestBaseUrl } from '@/lib/app-url';
import JobsList from './JobsList';

interface Job {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  salary: number | null;
  company_name: string | null;
  work_type: string | null;
  job_type: string | null;
  internship_track: string | null;
  eligible_roles: string[] | null;
  visibility: string | null;
  created_at: string;
  closes_at: string | null;
  lifecycle_status: string | null;
}

export default async function BrowseJobsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const [jobsResponse, applicationsResult] = await Promise.all([
    fetch(`${getRequestBaseUrl()}/api/jobs`, {
      cache: 'no-store',
    }),
    supabase.from('applications').select('job_id').eq('applicant_id', user.id),
  ]);

  let jobs: Job[] = [];
  if (jobsResponse.ok) {
    const payload = await jobsResponse.json();
    jobs = Array.isArray(payload) ? (payload as Job[]) : [];
  }

  const liveJobs = jobs.filter(
    (job) =>
      isJobPubliclyListable(job) &&
      canRoleApplyToOpportunity(
        'job_seeker',
        job.eligible_roles,
        job.job_type,
        job.internship_track,
        job.visibility
      )
  );

  const appliedJobIds = new Set(applicationsResult.data?.map((a) => a.job_id) || []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Browse Opportunities</h1>
        <p className="text-gray-400 mt-1">
          Find jobs and professional internships available to your profile from {liveJobs.length} active listings
        </p>
      </div>

      <JobsList jobs={liveJobs} appliedJobIds={appliedJobIds} />
    </div>
  );
}
