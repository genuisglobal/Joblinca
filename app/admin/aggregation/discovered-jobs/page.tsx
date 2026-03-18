import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatShortDate,
  isMissingAggregationRelationError,
} from '@/lib/aggregation/admin';

type QueueName = 'review' | 'suspicious' | 'claims' | 'published' | 'all';

type DiscoveredJobRow = {
  id: string;
  title: string;
  company_name: string | null;
  source_name: string;
  verification_status: string;
  claim_status: string;
  ingestion_status: string;
  trust_score: number;
  scam_score: number;
  discovered_at: string;
};

const queueLabels: Record<QueueName, string> = {
  review: 'Needs Review',
  suspicious: 'Suspicious',
  claims: 'Claims',
  published: 'Published',
  all: 'All',
};

function normalizeQueue(value: string | undefined): QueueName {
  if (value === 'suspicious' || value === 'claims' || value === 'published' || value === 'all') {
    return value;
  }

  return 'review';
}

function badgeClass(status: string) {
  if (status === 'published' || status === 'verified') {
    return 'bg-green-900/30 border-green-700 text-green-300';
  }

  if (status === 'suspicious' || status === 'rejected' || status === 'failed') {
    return 'bg-red-900/30 border-red-700 text-red-300';
  }

  if (status === 'claim_under_review' || status === 'review_required') {
    return 'bg-blue-900/30 border-blue-700 text-blue-300';
  }

  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

export default async function AdminDiscoveredJobsPage({
  searchParams,
}: {
  searchParams?: { queue?: string };
}) {
  const queue = normalizeQueue(searchParams?.queue);
  const supabase = createServerSupabaseClient();

  let query = supabase
    .from('discovered_jobs')
    .select(
      `
      id,
      title,
      company_name,
      source_name,
      verification_status,
      claim_status,
      ingestion_status,
      trust_score,
      scam_score,
      discovered_at
      `
    )
    .order('discovered_at', { ascending: false })
    .limit(100);

  if (queue === 'review') {
    query = query.eq('ingestion_status', 'review_required');
  } else if (queue === 'suspicious') {
    query = query.eq('verification_status', 'suspicious');
  } else if (queue === 'claims') {
    query = query.in('claim_status', ['claim_requested', 'claim_under_review']);
  } else if (queue === 'published') {
    query = query.eq('ingestion_status', 'published');
  }

  const { data, error } = await query;

  const migrationMissing = isMissingAggregationRelationError(error);
  const rows = (data || []) as DiscoveredJobRow[];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Discovered Jobs</h1>
          <p className="text-gray-400 mt-1">
            Admin queue for moderation, claim review, and discovered-job trust triage.
          </p>
        </div>
        <Link
          href="/admin/aggregation"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
        >
          Back to Control Room
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(Object.keys(queueLabels) as QueueName[]).map((entry) => (
          <Link
            key={entry}
            href={`/admin/aggregation/discovered-jobs?queue=${entry}`}
            className={`rounded-full px-3 py-2 text-sm transition-colors ${
              entry === queue
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {queueLabels[entry]}
          </Link>
        ))}
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
          Failed to load discovered jobs: {error.message}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800/80 p-4 text-sm text-gray-300">
        This queue stays separate from the native verified jobs marketplace. No discovered jobs are published to
        the public product from this scaffolding alone.
      </div>

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Job</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Source</th>
              <th className="p-4 text-left text-gray-400 font-medium">Verification</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Claim</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden xl:table-cell">Scores</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-400">
                  No jobs found in the {queueLabels[queue].toLowerCase()} queue.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="p-4">
                  <p className="text-white font-medium">{row.title}</p>
                  <p className="text-sm text-gray-400">
                    {row.company_name || 'Unknown company'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Status: {row.ingestion_status}</p>
                </td>
                <td className="p-4 text-gray-300 hidden md:table-cell">{row.source_name}</td>
                <td className="p-4">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${badgeClass(row.verification_status)}`}>
                    {row.verification_status}
                  </span>
                </td>
                <td className="p-4 hidden lg:table-cell">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${badgeClass(row.claim_status)}`}>
                    {row.claim_status}
                  </span>
                </td>
                <td className="p-4 text-gray-300 hidden xl:table-cell">
                  <p>Trust: {row.trust_score}</p>
                  <p>Scam: {row.scam_score}</p>
                </td>
                <td className="p-4 text-gray-400 hidden md:table-cell">
                  {formatShortDate(row.discovered_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
