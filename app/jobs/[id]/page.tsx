import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ApplyOptions from './ApplyOptions';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; already_applied?: string }>;
}

export default async function JobDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = createServerSupabaseClient();

  // Fetch job with apply method info
  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      *,
      recruiter:recruiter_id (
        id,
        full_name
      )
    `)
    .eq('id', id)
    .single();

  if (error || !job) {
    notFound();
  }

  // Check if job is published and approved
  const isPubliclyVisible = job.published && job.approval_status === 'approved';
  const isClosed = job.closes_at && new Date(job.closes_at) < new Date();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if user already applied
  let existingApplication = null;
  let isSaved = false;
  let userRole = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    userRole = profile?.role || null;

    const { data: application } = await supabase
      .from('applications')
      .select('id, status, is_draft, created_at')
      .eq('job_id', id)
      .eq('applicant_id', user.id)
      .single();

    existingApplication = application;

    const { data: savedJob } = await supabase
      .from('saved_jobs')
      .select('id')
      .eq('job_id', id)
      .eq('user_id', user.id)
      .single();

    isSaved = !!savedJob;
  }

  const formatSalary = () => {
    if (!job.salary_min && !job.salary_max) return null;
    const currency = job.salary_currency || 'XAF';
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });

    if (job.salary_min && job.salary_max) {
      return `${formatter.format(job.salary_min)} - ${formatter.format(job.salary_max)}`;
    }
    if (job.salary_min) return `From ${formatter.format(job.salary_min)}`;
    if (job.salary_max) return `Up to ${formatter.format(job.salary_max)}`;
    return null;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link
          href="/jobs"
          className="text-blue-400 hover:text-blue-300 text-sm mb-6 inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to jobs
        </Link>

        {/* Error/Info Messages */}
        {query.error === 'not_accepting' && (
          <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-yellow-400">
            This job is no longer accepting applications.
          </div>
        )}

        {query.already_applied === 'true' && (
          <div className="mb-6 p-4 bg-blue-900/50 border border-blue-700 rounded-lg text-blue-400">
            You have already applied for this position. Check your applications dashboard for status updates.
          </div>
        )}

        {/* Not Publicly Visible Warning */}
        {!isPubliclyVisible && (
          <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-yellow-400">
            This job is not publicly visible. It may be pending approval or unpublished.
          </div>
        )}

        {/* Closed Warning */}
        {isClosed && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-400">
            This job posting has closed and is no longer accepting applications.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
              {job.image_url && (
                <img
                  src={job.image_url}
                  alt={`${job.title} at ${job.company_name}`}
                  className="w-full h-48 object-cover rounded-lg mb-6"
                />
              )}

              <h1 className="text-2xl font-bold text-white mb-2">{job.title}</h1>
              <p className="text-lg text-gray-300 mb-4">{job.company_name}</p>

              <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                {job.location && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {job.location}
                  </div>
                )}

                {job.employment_type && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    {job.employment_type.replace(/_/g, ' ')}
                  </div>
                )}

                {job.work_type && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                      />
                    </svg>
                    {job.work_type.charAt(0).toUpperCase() + job.work_type.slice(1)}
                  </div>
                )}

                {formatSalary() && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {formatSalary()}
                  </div>
                )}
              </div>

              {job.created_at && (
                <p className="text-gray-500 text-sm mt-4">
                  Posted {formatDate(job.created_at)}
                  {job.closes_at && !isClosed && (
                    <span className="ml-2">• Closes {formatDate(job.closes_at)}</span>
                  )}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
              <h2 className="text-lg font-semibold text-white mb-4">Job Description</h2>
              <div className="prose prose-invert max-w-none text-gray-300">
                {job.description ? (
                  <div className="whitespace-pre-wrap">{job.description}</div>
                ) : (
                  <p className="text-gray-500 italic">No description provided</p>
                )}
              </div>
            </div>

            {/* Requirements */}
            {job.requirements && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
                <h2 className="text-lg font-semibold text-white mb-4">Requirements</h2>
                <div className="prose prose-invert max-w-none text-gray-300">
                  <div className="whitespace-pre-wrap">{job.requirements}</div>
                </div>
              </div>
            )}

            {/* Benefits */}
            {job.benefits && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-4">Benefits</h2>
                <div className="prose prose-invert max-w-none text-gray-300">
                  <div className="whitespace-pre-wrap">{job.benefits}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar with Apply Options */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <ApplyOptions
                job={{
                  id: job.id,
                  title: job.title,
                  company_name: job.company_name,
                  apply_method: job.apply_method || 'joblinca',
                  external_apply_url: job.external_apply_url,
                  apply_email: job.apply_email,
                  apply_phone: job.apply_phone,
                  apply_whatsapp: job.apply_whatsapp,
                  closes_at: job.closes_at,
                }}
                isAuthenticated={!!user}
                userRole={userRole}
                existingApplication={existingApplication}
                isSaved={isSaved}
                isClosed={!!isClosed}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
