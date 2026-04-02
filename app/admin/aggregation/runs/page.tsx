import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatDateTime,
  isMissingAggregationRelationError,
  normalizeSingle,
} from '@/lib/aggregation/admin';

type SourceSummary = {
  name: string;
  slug: string;
};

type RunRow = {
  id: string;
  status: string;
  trigger_type: string;
  created_at: string;
  fetched_count: number;
  parsed_count: number;
  normalized_count: number;
  inserted_count: number;
  updated_count: number;
  duplicate_count: number;
  error_count: number;
  suspicious_count: number;
  source: SourceSummary | SourceSummary[] | null;
};

function badgeClass(status: string) {
  if (status === 'completed') {
    return 'bg-green-900/30 border-green-700 text-green-300';
  }

  if (status === 'running' || status === 'partial') {
    return 'bg-blue-900/30 border-blue-700 text-blue-300';
  }

  if (status === 'failed' || status === 'cancelled') {
    return 'bg-red-900/30 border-red-700 text-red-300';
  }

  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

export default async function AdminAggregationRunsPage() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('aggregation_runs')
    .select(
      `
      id,
      status,
      trigger_type,
      created_at,
      fetched_count,
      parsed_count,
      normalized_count,
      inserted_count,
      updated_count,
      duplicate_count,
      error_count,
      suspicious_count,
      source:source_id (
        name,
        slug
      )
      `
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const migrationMissing = isMissingAggregationRelationError(error);
  const rows = (data || []) as RunRow[];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Aggregation Runs</h1>
          <p className="text-gray-400 mt-1">
            Recent source executions. Duplicate counts mean matched existing discovered jobs, not duplicate public listings.
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
          Failed to load aggregation runs: {error.message}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Source</th>
              <th className="p-4 text-left text-gray-400 font-medium">Status</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Trigger</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Created</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden xl:table-cell">Metrics</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  No aggregation runs recorded yet.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const source = normalizeSingle(row.source);

              return (
                <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium">{source?.name || 'Unknown source'}</p>
                    <p className="text-sm text-gray-400">{source?.slug || row.id}</p>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${badgeClass(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-300 hidden md:table-cell">{row.trigger_type}</td>
                  <td className="p-4 text-gray-400 hidden lg:table-cell">{formatDateTime(row.created_at)}</td>
                  <td className="p-4 text-sm text-gray-300 hidden xl:table-cell">
                    <p>Fetched: {row.fetched_count}</p>
                    <p>Parsed: {row.parsed_count}</p>
                    <p>Normalized: {row.normalized_count}</p>
                    <p>Inserted: {row.inserted_count}</p>
                    <p>Updated existing: {row.updated_count}</p>
                    <p>Matched existing: {row.duplicate_count}</p>
                    <p>Errors: {row.error_count}</p>
                    <p>Suspicious: {row.suspicious_count}</p>
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
