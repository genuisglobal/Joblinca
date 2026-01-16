import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '../../components/StatusBadge';

export default async function RecruiterJobsPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('recruiter_id', user.id)
    .order('created_at', { ascending: false });

  // Get application counts for each job
  const jobIds = jobs?.map((j) => j.id) || [];
  const { data: applicationCounts } = await supabase
    .from('applications')
    .select('job_id')
    .in('job_id', jobIds.length > 0 ? jobIds : ['00000000-0000-0000-0000-000000000000']);

  const countByJob: Record<string, number> = {};
  applicationCounts?.forEach((app) => {
    countByJob[app.job_id] = (countByJob[app.job_id] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Jobs</h1>
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Post New Job
        </Link>
      </div>

      {!jobs || jobs.length === 0 ? (
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
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">
            No jobs posted yet
          </h3>
          <p className="text-gray-400 mb-6">
            Start attracting candidates by posting your first job.
          </p>
          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Post Your First Job
          </Link>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-gray-400 font-medium">
                  Job Title
                </th>
                <th className="text-left p-4 text-gray-400 font-medium hidden md:table-cell">
                  Location
                </th>
                <th className="text-left p-4 text-gray-400 font-medium hidden lg:table-cell">
                  Posted
                </th>
                <th className="text-center p-4 text-gray-400 font-medium">
                  Applications
                </th>
                <th className="text-center p-4 text-gray-400 font-medium">
                  Status
                </th>
                <th className="text-right p-4 text-gray-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30"
                >
                  <td className="p-4">
                    <Link
                      href={`/dashboard/recruiter/jobs/${job.id}`}
                      className="font-medium text-white hover:text-blue-400"
                    >
                      {job.title}
                    </Link>
                    {job.company_name && (
                      <p className="text-sm text-gray-400">{job.company_name}</p>
                    )}
                  </td>
                  <td className="p-4 text-gray-300 hidden md:table-cell">
                    {job.location || 'Not specified'}
                  </td>
                  <td className="p-4 text-gray-400 hidden lg:table-cell">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-600/20 text-blue-400 rounded-full font-medium">
                      {countByJob[job.id] || 0}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge
                      status={job.published ? 'published' : 'pending'}
                    />
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/recruiter/jobs/${job.id}`}
                        className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                      >
                        View
                      </Link>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                        target="_blank"
                      >
                        Preview
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
