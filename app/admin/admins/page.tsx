import { redirect } from 'next/navigation';
import { checkAdminStatus, getAdminTypeLabel } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type AdminRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  admin_type: string | null;
  created_at: string;
};

function displayName(admin: AdminRow): string {
  if (admin.first_name || admin.last_name) {
    return `${admin.first_name ?? ''} ${admin.last_name ?? ''}`.trim();
  }
  return admin.full_name ?? 'Unknown admin';
}

export default async function AdminAdminsPage() {
  const { adminType } = await checkAdminStatus();

  if (adminType !== 'super') {
    redirect('/admin');
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, last_name, email, admin_type, created_at')
    .not('admin_type', 'is', null)
    .order('created_at', { ascending: false });

  const admins: AdminRow[] = (data ?? []) as AdminRow[];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Manage Admins</h1>
        <p className="text-gray-400 mt-1">Current users with admin privileges.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load admins: {error.message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Admin</th>
              <th className="p-4 text-left text-gray-400 font-medium">Type</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Added</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr>
                <td colSpan={3} className="p-10 text-center text-gray-400">
                  No admin users found.
                </td>
              </tr>
            )}
            {admins.map((admin) => (
              <tr key={admin.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="p-4">
                  <p className="text-white font-medium">{displayName(admin)}</p>
                  <p className="text-gray-400 text-sm">{admin.email ?? admin.id}</p>
                </td>
                <td className="p-4 text-gray-300">
                  {admin.admin_type ? getAdminTypeLabel(admin.admin_type as any) : 'Unknown'}
                </td>
                <td className="p-4 text-gray-400 hidden md:table-cell">
                  {new Date(admin.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
