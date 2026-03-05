import { redirect } from 'next/navigation';
import { checkAdminStatus } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type AdminProfile = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

type AuditRow = {
  id: string;
  admin_id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profiles: AdminProfile | AdminProfile[] | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function adminName(profile: AdminProfile | null): string {
  if (!profile) return 'Unknown admin';
  if (profile.first_name || profile.last_name) {
    return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  }
  return profile.full_name ?? 'Unknown admin';
}

export default async function AdminAuditLogPage() {
  const { adminType } = await checkAdminStatus();

  if (adminType !== 'super') {
    redirect('/admin');
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('admin_actions')
    .select(
      `
      id,
      admin_id,
      action,
      target_table,
      target_id,
      metadata,
      created_at,
      profiles:admin_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      )
      `
    )
    .order('created_at', { ascending: false })
    .limit(200);

  const rows: AuditRow[] = (data ?? []) as AuditRow[];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-gray-400 mt-1">Latest admin activity records.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load audit log: {error.message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Admin</th>
              <th className="p-4 text-left text-gray-400 font-medium">Action</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Target</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-gray-400">
                  No audit records found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const profile = normalizeSingle(row.profiles);
              return (
                <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{adminName(profile)}</p>
                    <p className="text-gray-400 text-sm">{profile?.email ?? row.admin_id}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-gray-200 font-medium">{row.action}</p>
                    {row.metadata && (
                      <p className="text-xs text-gray-400 mt-1 truncate max-w-md">
                        {JSON.stringify(row.metadata)}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-gray-400 hidden lg:table-cell">
                    {row.target_table ?? 'N/A'}
                    {row.target_id ? `:${row.target_id}` : ''}
                  </td>
                  <td className="p-4 text-gray-400 hidden md:table-cell">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
