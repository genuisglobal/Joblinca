import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import JobsList from './JobsList';

export default async function BrowseJobsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch only approved opportunities that job seekers are eligible to apply for.
  const { data: jobs } = await supabase
    .from('jobs')
    .select(
      `
      id,
      title,
      description,
      location,
      salary,
      company_name,
      work_type,
      job_type,
      internship_track,
      eligible_roles,
      created_at,
      closes_at,
      lifecycle_status
    `
    )
    .eq('published', true)
    .eq('approval_status', 'approved')
    .contains('eligible_roles', ['job_seeker'])
    .order('created_at', { ascending: false });

  // Get user's existing applications to mark which jobs they've applied to
  const liveJobs = (jobs || []).filter((job) => isJobPubliclyListable(job));

  const { data: applications } = await supabase
    .from('applications')
    .select('job_id')
    .eq('applicant_id', user.id);

  const appliedJobIds = new Set(applications?.map((a) => a.job_id) || []);

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
