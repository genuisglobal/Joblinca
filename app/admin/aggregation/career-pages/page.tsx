import Link from 'next/link';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { AddCareerPageForm, CareerPageRowActions } from './CareerPageActions';

export const dynamic = 'force-dynamic';

type CareerPageRow = {
  id: string;
  company_name: string;
  url: string;
  enabled: boolean;
  notes: string | null;
  last_checked_at: string | null;
  last_jobs_found: number;
  consecutive_failures: number;
};

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const hours = Math.round((Date.now() - t) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function CareerPagesAdminPage() {
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from('monitored_career_pages')
    .select('id, company_name, url, enabled, notes, last_checked_at, last_jobs_found, consecutive_failures')
    .order('company_name', { ascending: true });

  const rows = (data || []) as CareerPageRow[];
  const migrationMissing = Boolean(
    error && /relation .* does not exist/i.test(error.message || '')
  );

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Career Pages</h1>
          <p className="text-gray-400 mt-1">
            Monitored employer career pages. The Company Career Pages source checks each
            enabled page ~once a day and AI-extracts new postings into the discovery pipeline.
          </p>
        </div>
        <Link
          href="/admin/aggregation"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
        >
          Back to Control Room
        </Link>
      </div>

      {migrationMissing && (
        <div className="mb-6 rounded-xl border border-yellow-700 bg-yellow-900/20 p-4 text-yellow-200">
          Career pages schema is not available yet. Apply{' '}
          <code>supabase/migrations/20260709000200_monitored_career_pages.sql</code> first.
        </div>
      )}

      {!migrationMissing && error && (
        <div className="mb-6 rounded-xl border border-red-700 bg-red-900/20 p-4 text-red-200">
          Failed to load career pages: {error.message}
        </div>
      )}

      <div className="mb-6">
        <AddCareerPageForm />
      </div>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Company</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Page</th>
              <th className="p-4 text-left text-gray-400 font-medium">Status</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Last check</th>
              <th className="p-4 text-left text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  No career pages monitored yet. Add the careers URLs of major employers
                  (banks, telecoms, breweries, NGOs, UN agencies, government portals) above.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="p-4">
                  <p className="text-white font-medium">{row.company_name}</p>
                  {row.notes && <p className="text-xs text-gray-500 mt-0.5">{row.notes}</p>}
                </td>
                <td className="p-4 hidden md:table-cell">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 break-all"
                  >
                    {row.url}
                  </a>
                </td>
                <td className="p-4">
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-xs ${
                      !row.enabled
                        ? 'bg-gray-700/50 border-gray-600 text-gray-400'
                        : row.consecutive_failures >= 2
                          ? 'bg-red-900/30 border-red-700 text-red-300'
                          : 'bg-green-900/30 border-green-700 text-green-300'
                    }`}
                  >
                    {!row.enabled
                      ? 'disabled'
                      : row.consecutive_failures >= 2
                        ? `failing (${row.consecutive_failures}x)`
                        : 'active'}
                  </span>
                </td>
                <td className="p-4 text-gray-400 hidden lg:table-cell">
                  <p>{formatWhen(row.last_checked_at)}</p>
                  <p className="text-xs text-gray-500">{row.last_jobs_found} jobs last check</p>
                </td>
                <td className="p-4">
                  <CareerPageRowActions id={row.id} enabled={row.enabled} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Extraction requires OPENAI_API_KEY. Pages are re-checked at most once every 20 hours;
        run the Company Career Pages scraper from the Scrapers dashboard to force a check.
      </p>
    </div>
  );
}
