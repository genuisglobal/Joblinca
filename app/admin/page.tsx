import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function AdminPage() {
  const supabase = createServerSupabaseClient();

  // Fetch all stats in parallel
  const [
    usersResult,
    jobsResult,
    applicationsResult,
    recruitersResult,
    pendingJobsResult,
    pendingRecruiterVerificationsResult,
    pendingJobSeekerVerificationsResult,
    approvedJobsResult,
    rejectedJobsResult,
    totalTransactionsResult,
    completedTransactionsResult,
    activeSubscriptionsResult,
    revenueResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('recruiter_profiles').select('user_id', { count: 'exact', head: true }),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.from('recruiter_profiles').select('user_id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
    supabase.from('job_seeker_profiles').select('user_id', { count: 'exact', head: true }).eq('verification_status', 'pending'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('approval_status', 'rejected'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('transactions').select('amount').eq('status', 'completed'),
  ]);

  const totalRevenue = (revenueResult.data || []).reduce(
    (sum: number, t: { amount: number }) => sum + (t.amount || 0),
    0
  );

  const stats = {
    users: usersResult.count ?? 0,
    jobs: jobsResult.count ?? 0,
    applications: applicationsResult.count ?? 0,
    recruiters: recruitersResult.count ?? 0,
    pendingJobs: pendingJobsResult.count ?? 0,
    pendingRecruiterVerifications: pendingRecruiterVerificationsResult.count ?? 0,
    pendingJobSeekerVerifications: pendingJobSeekerVerificationsResult.count ?? 0,
    approvedJobs: approvedJobsResult.count ?? 0,
    rejectedJobs: rejectedJobsResult.count ?? 0,
    totalTransactions: totalTransactionsResult.count ?? 0,
    completedTransactions: completedTransactionsResult.count ?? 0,
    activeSubscriptions: activeSubscriptionsResult.count ?? 0,
    totalRevenue,
  };

  // Fetch recent pending jobs for quick review
  const { data: recentPendingJobs } = await supabase
    .from('jobs')
    .select('id, title, company_name, created_at')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
        <p className="text-gray-400">Overview of your platform and pending actions</p>
      </div>

      {/* Pending Actions - Highlighted */}
      {(stats.pendingJobs > 0 || stats.pendingRecruiterVerifications > 0 || stats.pendingJobSeekerVerifications > 0) && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
            Pending Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {stats.pendingJobs > 0 && (
              <Link href="/admin/jobs?status=pending" className="group">
                <PendingCard
                  title="Jobs Awaiting Approval"
                  value={stats.pendingJobs}
                  color="yellow"
                />
              </Link>
            )}
            {stats.pendingRecruiterVerifications > 0 && (
              <Link href="/admin/verifications?tab=recruiters" className="group">
                <PendingCard
                  title="Recruiter Verifications"
                  value={stats.pendingRecruiterVerifications}
                  color="blue"
                />
              </Link>
            )}
            {stats.pendingJobSeekerVerifications > 0 && (
              <Link href="/admin/verifications?tab=job-seekers" className="group">
                <PendingCard
                  title="Job Seeker Verifications"
                  value={stats.pendingJobSeekerVerifications}
                  color="purple"
                />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Overview Stats */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Platform Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <AdminStatCard title="Total Users" value={stats.users.toString()} icon={<UsersIcon />} />
          <AdminStatCard title="Total Jobs" value={stats.jobs.toString()} icon={<BriefcaseIcon />} />
          <AdminStatCard title="Applications" value={stats.applications.toString()} icon={<DocumentIcon />} />
          <AdminStatCard title="Recruiters" value={stats.recruiters.toString()} icon={<BuildingIcon />} />
        </div>
      </div>

      {/* Jobs Breakdown */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Jobs Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatusCard title="Pending Approval" value={stats.pendingJobs} color="yellow" />
          <StatusCard title="Approved" value={stats.approvedJobs} color="green" />
          <StatusCard title="Rejected" value={stats.rejectedJobs} color="red" />
        </div>
      </div>

      {/* Finance Overview */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Finance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <AdminStatCard
            title="Total Revenue"
            value={`${stats.totalRevenue.toLocaleString()} CFA`}
            icon={<CreditCardIcon />}
          />
          <AdminStatCard
            title="Transactions"
            value={stats.totalTransactions.toString()}
            icon={<DocumentIcon />}
          />
          <AdminStatCard
            title="Completed"
            value={stats.completedTransactions.toString()}
            icon={<CheckIcon />}
          />
          <AdminStatCard
            title="Active Subscriptions"
            value={stats.activeSubscriptions.toString()}
            icon={<UsersIcon />}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/admin/jobs/new"
              className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Job
            </Link>
            <Link
              href="/admin/jobs?status=pending"
              className="flex items-center gap-3 px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Review Jobs
            </Link>
            <Link
              href="/admin/verifications"
              className="flex items-center gap-3 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Verifications
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-3 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              View Users
            </Link>
          </div>
        </div>

        {/* Recent Pending Jobs */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Recent Pending Jobs</h2>
            <Link href="/admin/jobs?status=pending" className="text-sm text-blue-400 hover:text-blue-300">
              View all &rarr;
            </Link>
          </div>
          {recentPendingJobs && recentPendingJobs.length > 0 ? (
            <div className="space-y-3">
              {recentPendingJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/admin/jobs/${job.id}`}
                  className="block p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <p className="text-white font-medium truncate">{job.title}</p>
                  <p className="text-sm text-gray-400">
                    {job.company_name || 'Unknown company'} &bull; {new Date(job.created_at).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>No pending jobs</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminStatCard({ title, value, icon }: { title: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        {icon && <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center text-gray-400">{icon}</div>}
      </div>
    </div>
  );
}

function PendingCard({ title, value, color }: { title: string; value: number; color: 'yellow' | 'blue' | 'purple' }) {
  const colors = {
    yellow: 'bg-yellow-900/30 border-yellow-700/50 group-hover:border-yellow-600',
    blue: 'bg-blue-900/30 border-blue-700/50 group-hover:border-blue-600',
    purple: 'bg-purple-900/30 border-purple-700/50 group-hover:border-purple-600',
  };
  const textColors = {
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
  };

  return (
    <div className={`${colors[color]} border rounded-lg p-4 transition-colors`}>
      <p className="text-gray-400 text-sm">{title}</p>
      <p className={`text-3xl font-bold ${textColors[color]} mt-1`}>{value}</p>
      <p className="text-xs text-gray-500 mt-2">Click to review &rarr;</p>
    </div>
  );
}

function StatusCard({ title, value, color }: { title: string; value: number; color: 'yellow' | 'green' | 'red' }) {
  const bgColors = {
    yellow: 'bg-yellow-900/20',
    green: 'bg-green-900/20',
    red: 'bg-red-900/20',
  };
  const textColors = {
    yellow: 'text-yellow-400',
    green: 'text-green-400',
    red: 'text-red-400',
  };

  return (
    <div className={`${bgColors[color]} rounded-lg p-4`}>
      <p className="text-gray-400 text-sm">{title}</p>
      <p className={`text-2xl font-bold ${textColors[color]} mt-1`}>{value}</p>
    </div>
  );
}

// Icon components
function UsersIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
