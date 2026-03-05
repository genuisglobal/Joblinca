import { createServerSupabaseClient } from '@/lib/supabase/server';

type UserPreview = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
};

type PaymentRow = {
  id: string;
  user_id: string;
  amount: number | null;
  currency: string | null;
  status: string;
  provider: string | null;
  description: string | null;
  created_at: string;
  profiles: UserPreview | UserPreview[] | null;
};

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function displayName(profile: UserPreview | null): string {
  if (!profile) return 'Unknown user';
  if (profile.first_name || profile.last_name) {
    return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
  }
  return profile.full_name ?? 'Unknown user';
}

function statusClass(status: string): string {
  if (status === 'completed') return 'bg-green-900/30 border-green-700 text-green-300';
  if (status === 'failed') return 'bg-red-900/30 border-red-700 text-red-300';
  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

export default async function AdminPaymentsPage() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(
      `
      id,
      user_id,
      amount,
      currency,
      status,
      provider,
      description,
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

  const rows: PaymentRow[] = (data ?? []) as PaymentRow[];
  const totalCompleted = rows
    .filter((row) => row.status === 'completed')
    .reduce((sum, row) => sum + (row.amount ?? 0), 0);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Payments</h1>
          <p className="text-gray-400 mt-1">Recent transactions and payment statuses.</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3">
          <p className="text-xs text-gray-400">Completed total (latest 100)</p>
          <p className="text-lg text-white font-semibold">{totalCompleted.toLocaleString()} CFA</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          Failed to load payments: {error.message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">User</th>
              <th className="p-4 text-left text-gray-400 font-medium">Amount</th>
              <th className="p-4 text-left text-gray-400 font-medium">Status</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Provider</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  No payment records found.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const profile = normalizeSingle(row.profiles);
              return (
                <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{displayName(profile)}</p>
                    <p className="text-gray-400 text-sm">{profile?.email ?? row.user_id}</p>
                  </td>
                  <td className="p-4 text-gray-200">
                    {(row.amount ?? 0).toLocaleString()} {row.currency ?? 'XAF'}
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex px-2 py-1 rounded-full border text-xs ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300 hidden md:table-cell">{row.provider ?? 'N/A'}</td>
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
