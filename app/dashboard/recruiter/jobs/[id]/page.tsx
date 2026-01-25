import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '../../../components/StatusBadge';
import ApplicationsTable from './ApplicationsTable';

export default async function RecruiterJobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch job details
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.id)
    .eq('recruiter_id', user.id)
    .single();

  if (error || !job) {
    notFound();
  }

  // Fetch applications for this job
  const { data: applications } = await supabase
    .from('applications')
    .select(
      `
      *,
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
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={job.approval_status || (job.published ? 'published' : 'pending')} />
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
            <p className="text-sm text-gray-400">Job Type</p>
            <p className="text-white capitalize">{job.job_type || 'Job'}</p>
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
        </div>
        <div className="mt-6">
          <p className="text-sm text-gray-400 mb-2">Description</p>
          <p className="text-gray-300 whitespace-pre-wrap">{job.description}</p>
        </div>
      </div>

      {/* Applications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">
            Applications ({applications?.length || 0})
          </h2>
        </div>
        <ApplicationsTable
          applications={applications || []}
          jobId={params.id}
          customQuestions={job.custom_questions}
        />
      </div>
    </div>
  );
}
