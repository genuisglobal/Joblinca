import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '../../components/StatusBadge';

export default async function MyApplicationsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: applications } = await supabase
    .from('applications')
    .select(
      `
      *,
      jobs:job_id (
        id,
        title,
        company_name,
        location,
        work_type
      )
    `
    )
    .eq('applicant_id', user.id)
    .order('created_at', { ascending: false });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'border-blue-600';
      case 'shortlisted':
        return 'border-yellow-600';
      case 'interviewed':
        return 'border-purple-600';
      case 'hired':
        return 'border-green-600';
      case 'rejected':
        return 'border-red-600';
      default:
        return 'border-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Applications</h1>
          <p className="text-gray-400 mt-1">
            Track the status of your job applications
          </p>
        </div>
        <Link
          href="/dashboard/job-seeker/browse"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Browse More Jobs
        </Link>
      </div>

      {!applications || applications.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-600 mb-4"
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
          <h3 className="text-xl font-semibold text-white mb-2">
            No applications yet
          </h3>
          <p className="text-gray-400 mb-6">
            Start your job search and apply to positions that match your skills.
          </p>
          <Link
            href="/dashboard/job-seeker/browse"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Jobs
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div
              key={app.id}
              className={`bg-gray-800 rounded-xl p-6 border-l-4 ${getStatusColor(app.status)}`}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {app.jobs?.title || 'Job'}
                      </h3>
                      <p className="text-gray-400">
                        {app.jobs?.company_name || 'Company'}
                      </p>
                    </div>
                    <StatusBadge status={app.status} />
                  </div>

                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-400">
                    {app.jobs?.location && (
                      <span className="flex items-center gap-1">
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
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {app.jobs.location}
                      </span>
                    )}
                    {app.jobs?.work_type && (
                      <span className="capitalize">{app.jobs.work_type}</span>
                    )}
                    <span>
                      Applied {new Date(app.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {app.cover_letter && (
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300">
                        View Cover Letter
                      </summary>
                      <p className="mt-2 text-gray-300 text-sm bg-gray-900 p-4 rounded-lg whitespace-pre-wrap">
                        {app.cover_letter}
                      </p>
                    </details>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href={`/jobs/${app.jobs?.id}`}
                    className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-center"
                  >
                    View Job
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
