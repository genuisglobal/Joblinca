import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function AdminPage() {
  const supabase = createServerSupabaseClient();

  // Fetch stats for dashboard
  const [usersResult, jobsResult, applicationsResult, recruitersResult] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    supabase.from('applications').select('id', { count: 'exact', head: true }),
    supabase.from('recruiter_profiles').select('user_id', { count: 'exact', head: true }),
  ]);

  const stats = {
    users: usersResult.count ?? 0,
    jobs: jobsResult.count ?? 0,
    applications: applicationsResult.count ?? 0,
    recruiters: recruitersResult.count ?? 0,
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">Overview of your platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <AdminStatCard title="Total Users" value={stats.users.toString()} />
        <AdminStatCard title="Jobs Posted" value={stats.jobs.toString()} />
        <AdminStatCard title="Applications" value={stats.applications.toString()} />
        <AdminStatCard title="Recruiters" value={stats.recruiters.toString()} />
      </div>

      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
        <p className="text-gray-400">
          Use the sidebar to navigate to different admin sections. You can manage users,
          approve recruiters & jobs, handle vetting requests, verifications, payments,
          and create tests/certifications.
        </p>
      </div>
    </div>
  );
}

function AdminStatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}