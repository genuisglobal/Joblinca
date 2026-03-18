import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatDateTime,
  isMissingAggregationRelationError,
  normalizeSingle,
} from '@/lib/aggregation/admin';

type RegionRow = {
  id: string;
  name: string;
};

type SourceRow = {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  enabled: boolean;
  health_status: string;
  poll_interval_minutes: number;
  allowed_domains: string[] | null;
  last_success_at: string | null;
  platform_region: RegionRow | RegionRow[] | null;
};

function statusBadgeClass(status: string) {
  if (status === 'healthy') {
    return 'bg-green-900/30 border-green-700 text-green-300';
  }

  if (status === 'degraded') {
    return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
  }

  if (status === 'failing') {
    return 'bg-red-900/30 border-red-700 text-red-300';
  }

  return 'bg-gray-700/50 border-gray-600 text-gray-200';
}

export default async function AdminAggregationSourcesPage() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('aggregation_sources')
    .select(
      `
      id,
      name,
      slug,
      source_type,
      enabled,
      health_status,
      poll_interval_minutes,
      allowed_domains,
      last_success_at,
      platform_region:platform_region_id (
        id,
        name
      )
      `
    )
    .order('created_at', { ascending: false });

  const migrationMissing = isMissingAggregationRelationError(error);
  const rows = (data || []) as SourceRow[];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Aggregation Sources</h1>
          <p className="text-gray-400 mt-1">
            Approved connectors and source controls for the discovered-jobs subsystem.
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
          Aggregation schema is not available yet. Apply{' '}
          <code>supabase/migrations/20260313000200_job_aggregation_foundation.sql</code>{' '}
          first.
        </div>
      )}

      {!migrationMissing && error && (
        <div className="mb-6 rounded-xl border border-red-700 bg-red-900/20 p-4 text-red-200">
          Failed to load aggregation sources: {error.message}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800/80 p-4">
        <p className="text-sm text-gray-300">
          Source CRUD is exposed through <code>/api/admin/aggregation/sources</code>. This page is the
          operational read surface until form workflows are added.
        </p>
      </div>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Source</th>
              <th className="p-4 text-left text-gray-400 font-medium">Type</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Region</th>
              <th className="p-4 text-left text-gray-400 font-medium">Health</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Polling</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden xl:table-cell">Last Success</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-400">
                  No aggregation sources configured yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const region = normalizeSingle(row.platform_region);
              return (
                <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{row.name}</p>
                    <p className="text-sm text-gray-400">{row.slug}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Domains: {(row.allowed_domains || []).join(', ') || 'none configured'}
                    </p>
                  </td>
                  <td className="p-4 text-gray-300">{row.source_type}</td>
                  <td className="p-4 text-gray-300 hidden md:table-cell">{region?.name || 'Unknown'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadgeClass(row.health_status)}`}>
                        {row.health_status}
                      </span>
                      {!row.enabled && (
                        <span className="inline-flex rounded-full border border-gray-600 bg-gray-700/40 px-2 py-1 text-xs text-gray-300">
                          disabled
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-gray-300 hidden lg:table-cell">
                    Every {row.poll_interval_minutes} min
                  </td>
                  <td className="p-4 text-gray-400 hidden xl:table-cell">
                    {formatDateTime(row.last_success_at)}
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
