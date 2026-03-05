import { createServerSupabaseClient } from '@/lib/supabase/server';

type Applicant = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

type Job = {
  id: string;
  title: string | null;
  company_name: string | null;
};

type ApplicationRow = {
  id: string;
  status: string;
  created_at: string;
  profiles: Applicant | Applicant[] | null;
  jobs: Job | Job[] | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function applicantName(profile: Applicant | null): string {
  if (!profile) return 'Unknown applicant';
  if (profile.first_name || profile.last_name) {
    return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  }
  return profile.full_name ?? 'Unknown applicant';
}

function statusClass(status: string): string {
  if (status === 'hired') return 'bg-green-900/30 border-green-700 text-green-300';
  if (status === 'rejected') return 'bg-red-900/30 border-red-700 text-red-300';
  if (status === 'shortlisted' || status === 'interviewed') return 'bg-blue-900/30 border-blue-700 text-blue-300';
  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

export default async function AdminApplicationsPage() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('applications')
    .select(
      `
      id,
      status,
      created_at,
      profiles:applicant_id (
        id,
        full_name,
        first_name,
        last_name,
        email
      ),
      jobs:job_id (
        id,
        title,
        company_name
      )
      `
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows: ApplicationRow[] = (data ?? []) as ApplicationRow[];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Applications</h1>
        <p className="text-gray-400 mt-1">Recent candidate applications across all jobs.</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load applications: {error.message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Applicant</th>
              <th className="p-4 text-left text-gray-400 font-medium">Job</th>
              <th className="p-4 text-left text-gray-400 font-medium">Status</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const profile = normalizeSingle(row.profiles);
              const job = normalizeSingle(row.jobs);
              return (
                <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{applicantName(profile)}</p>
                    <p className="text-gray-400 text-sm">{profile?.email ?? row.id}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-gray-200">{job?.title ?? 'Unknown job'}</p>
                    <p className="text-gray-400 text-sm">{job?.company_name ?? 'Unknown company'}</p>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-1 rounded-full border text-xs ${statusClass(row.status)}`}>
                      {row.status}
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
