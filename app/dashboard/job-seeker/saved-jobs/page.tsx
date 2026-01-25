import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import SavedJobCard from './SavedJobCard';

export default async function SavedJobsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch saved jobs with job details
  const { data: savedJobs } = await supabase
    .from('saved_jobs')
    .select(`
      id,
      saved_at,
      job:job_id (
        id,
        title,
        company_name,
        location,
        employment_type,
        salary_min,
        salary_max,
        salary_currency,
        published,
        approval_status,
        closes_at,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false });

  // Check which jobs user has already applied to
  const jobIds = savedJobs?.map((sj: any) => sj.job?.id).filter(Boolean) || [];
  const { data: applications } = await supabase
    .from('applications')
    .select('job_id, is_draft')
    .eq('applicant_id', user.id)
    .in('job_id', jobIds);

  const appliedJobIds = new Set(
    applications?.filter((a) => !a.is_draft).map((a) => a.job_id) || []
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Saved Jobs</h1>
        <p className="text-gray-400 mt-1">Jobs you've saved for later</p>
      </div>

      {!savedJobs || savedJobs.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-700 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">No saved jobs yet</h2>
          <p className="text-gray-400 mb-6">
            Save jobs you're interested in to review them later
          </p>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Browse Jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {savedJobs.map((savedJob: any) => {
            const job = savedJob.job;
            if (!job) return null;

            const hasApplied = appliedJobIds.has(job.id);
            const isClosed = job.closes_at && new Date(job.closes_at) < new Date();
            const isAvailable = job.published && job.approval_status === 'approved' && !isClosed;

            return (
              <SavedJobCard
                key={savedJob.id}
                savedJobId={savedJob.id}
                job={job}
                savedAt={savedJob.saved_at}
                hasApplied={hasApplied}
                isAvailable={isAvailable}
                isClosed={!!isClosed}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
