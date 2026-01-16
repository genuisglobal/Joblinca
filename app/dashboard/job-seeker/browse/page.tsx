import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import JobsList from './JobsList';

export default async function BrowseJobsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch published jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });

  // Get user's existing applications to mark which jobs they've applied to
  const { data: applications } = await supabase
    .from('applications')
    .select('job_id')
    .eq('applicant_id', user.id);

  const appliedJobIds = new Set(applications?.map((a) => a.job_id) || []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Browse Jobs</h1>
        <p className="text-gray-400 mt-1">
          Find your next opportunity from {jobs?.length || 0} available positions
        </p>
      </div>

      <JobsList jobs={jobs || []} appliedJobIds={appliedJobIds} />
    </div>
  );
}
