import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

type ProfilePreview = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

type RecruiterRow = {
  user_id: string;
  company_name: string | null;
  verification_status: string | null;
  created_at: string;
  profiles: ProfilePreview | ProfilePreview[] | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function displayName(profile: ProfilePreview | null): string {
  if (!profile) return 'Unknown user';
  if (profile.first_name || profile.last_name) {
    return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  }
  return profile.full_name ?? 'Unknown user';
}

function statusBadgeClass(status: string | null): string {
  if (status === 'verified') return 'bg-green-900/30 border-green-700 text-green-300';
  if (status === 'rejected') return 'bg-red-900/30 border-red-700 text-red-300';
  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

export default async function AdminRecruitersPage() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('recruiter_profiles')
    .select(
      `
      user_id,
      company_name,
      verification_status,
      created_at,
      profiles:user_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      )
      `
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows: RecruiterRow[] = (data ?? []) as RecruiterRow[];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Recruiters</h1>
          <p className="text-gray-400 mt-1">Manage recruiter accounts and verification status.</p>
        </div>
        <Link
          href="/admin/verifications?tab=recruiters"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Open Recruiter Verifications
        </Link>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load recruiters: {error.message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Recruiter</th>
              <th className="p-4 text-left text-gray-400 font-medium">Company</th>
              <th className="p-4 text-left text-gray-400 font-medium">Status</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-gray-400">
                  No recruiter profiles found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const profile = normalizeSingle(row.profiles);
              const status = row.verification_status ?? 'pending';
              return (
                <tr key={row.user_id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{displayName(profile)}</p>
                    <p className="text-gray-400 text-sm">{profile?.email ?? row.user_id}</p>
                  </td>
                  <td className="p-4 text-gray-300">{row.company_name ?? 'Unknown company'}</td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-1 rounded-full border text-xs ${statusBadgeClass(status)}`}>
                      {status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-400 hidden md:table-cell">
                    {new Date(row.created_at).toLocaleDateString()}
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
