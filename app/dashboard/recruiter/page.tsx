import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';

export default async function RecruiterDashboardPage() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch recruiter's jobs
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('recruiter_id', user.id)
    .order('created_at', { ascending: false });

  // Fetch applications for recruiter's jobs
  const jobIds = jobs?.map((j) => j.id) || [];
  const { data: applications } = await supabase
    .from('applications')
    .select('*, jobs!inner(recruiter_id)')
    .in('job_id', jobIds.length > 0 ? jobIds : ['00000000-0000-0000-0000-000000000000']);

  // Fetch verification status
  const { data: verification } = await supabase
    .from('verifications')
    .select('status')
    .eq('user_id', user.id)
    .single();

  const totalJobs = jobs?.length || 0;
  const publishedJobs = jobs?.filter((j) => j.published).length || 0;
  const totalApplications = applications?.length || 0;
  const pendingApplications =
    applications?.filter((a) => a.status === 'submitted').length || 0;

  const recentJobs = jobs?.slice(0, 5) || [];
  const recentApplications = applications?.slice(0, 5) || [];

  return (
    <div className="space-y-8">
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Jobs Posted"
          value={totalJobs}
          color="blue"
          icon={
            <svg
              className="w-6 h-6 text-blue-400"
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
          }
        />
        <StatsCard
          title="Published Jobs"
          value={publishedJobs}
          color="green"
          icon={
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Total Applications"
          value={totalApplications}
          color="purple"
          icon={
            <svg
              className="w-6 h-6 text-purple-400"
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
          }
        />
        <StatsCard
          title="Pending Review"
          value={pendingApplications}
          color="yellow"
          icon={
            <svg
              className="w-6 h-6 text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
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
        <Link
          href="/dashboard/recruiter/jobs"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          View All Jobs
        </Link>
        {!verification && (
          <Link
            href="/dashboard/recruiter/verification"
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            Get Verified
          </Link>
        )}
      </div>

      {/* Recent Jobs */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Jobs</h2>
          <Link
            href="/dashboard/recruiter/jobs"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View All
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <p className="text-gray-400">No jobs posted yet.</p>
        ) : (
          <div className="space-y-4">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-white">{job.title}</h3>
                  <p className="text-sm text-gray-400">
                    {job.location || 'Location not specified'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={job.published ? 'published' : 'pending'}
                  />
                  <Link
                    href={`/dashboard/recruiter/jobs/${job.id}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Applications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Recent Applications
          </h2>
        </div>
        {recentApplications.length === 0 ? (
          <p className="text-gray-400">No applications received yet.</p>
        ) : (
          <div className="space-y-4">
            {recentApplications.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-white">
                    Application #{app.id.slice(0, 8)}
                  </p>
                  <p className="text-sm text-gray-400">
                    {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
