import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplySuccessPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  // Check authentication
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch job details
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, company_name')
    .eq('id', id)
    .single();

  if (!job) {
    notFound();
  }

  // Verify user has an application for this job
  const { data: application } = await supabase
    .from('applications')
    .select('id, created_at')
    .eq('job_id', id)
    .eq('applicant_id', user.id)
    .eq('is_draft', false)
    .single();

  if (!application) {
    redirect(`/jobs/${id}`);
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-900/50 rounded-full mb-6">
          <svg
            className="w-10 h-10 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Application Submitted!</h1>
        <p className="text-gray-400 mb-8">
          Your application for <span className="text-white">{job.title}</span> at{' '}
          <span className="text-white">{job.company_name}</span> has been submitted successfully.
        </p>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8 text-left">
          <h2 className="text-white font-medium mb-4">What happens next?</h2>
          <ul className="space-y-3 text-gray-400 text-sm">
            <li className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-900 text-blue-400 rounded-full text-xs flex-shrink-0 mt-0.5">
                1
              </span>
              <span>The employer will review your application and resume</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-900 text-blue-400 rounded-full text-xs flex-shrink-0 mt-0.5">
                2
              </span>
              <span>If shortlisted, you'll receive an email notification</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="inline-flex items-center justify-center w-5 h-5 bg-blue-900 text-blue-400 rounded-full text-xs flex-shrink-0 mt-0.5">
                3
              </span>
              <span>Track your application status in your dashboard</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/dashboard/job-seeker/applications"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            View My Applications
          </Link>
          <Link
            href="/jobs"
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Browse More Jobs
          </Link>
        </div>
      </div>
    </div>
  );
}
