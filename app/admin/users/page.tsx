import { createServerSupabaseClient } from '@/lib/supabase/server';
import UsersClient from './UsersClient';

interface PageProps {
  searchParams: Promise<{ role?: string; search?: string }>;
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const roleFilter = params.role || 'all';
  const searchTerm = params.search || '';

  // Build query
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }

  if (searchTerm) {
    query = query.or(`full_name.ilike.%${searchTerm}%,first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%`);
  }

  const { data: users, error } = await query;

  // Get role counts
  const [jobSeekerCount, talentCount, recruiterCount, adminCount, totalCount] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'job_seeker'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'talent'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'recruiter'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('admin_type', 'is', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const counts = {
    all: totalCount.count ?? 0,
    job_seeker: jobSeekerCount.count ?? 0,
    talent: talentCount.count ?? 0,
    recruiter: recruiterCount.count ?? 0,
    admin: adminCount.count ?? 0,
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-gray-400 mt-1">View and manage platform users</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">Error loading users: {error.message}</p>
        </div>
      )}

      <UsersClient
        users={users || []}
        counts={counts}
        currentRole={roleFilter}
        currentSearch={searchTerm}
      />
    </div>
  );
}
