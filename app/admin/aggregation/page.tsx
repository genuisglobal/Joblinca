import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatDateTime,
  formatShortDate,
  isMissingAggregationRelationError,
  normalizeSingle,
} from '@/lib/aggregation/admin';
import RunScrapersButton from './RunScrapersButton';
import DedupPanel from './DedupPanel';

type SourceSummary = {
  name: string;
  slug: string;
};

type RunRow = {
  id: string;
  status: string;
  trigger_type: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  fetched_count: number;
  normalized_count: number;
  error_count: number;
  source: SourceSummary | SourceSummary[] | null;
};

type DiscoveredJobRow = {
  id: string;
  title: string;
  company_name: string | null;
  verification_status: string;
  claim_status: string;
  trust_score: number;
  scam_score: number;
  discovered_at: string;
  source_name: string;
};

function statusBadgeClass(status: string) {
  if (status === 'completed' || status === 'healthy') {
    return 'bg-green-900/30 border-green-700 text-green-300';
  }

  if (status === 'running' || status === 'partial' || status === 'review_required') {
    return 'bg-blue-900/30 border-blue-700 text-blue-300';
  }

  if (status === 'suspicious' || status === 'failed' || status === 'failing') {
    return 'bg-red-900/30 border-red-700 text-red-300';
  }

  return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
}

export default async function AdminAggregationPage() {
  const supabase = createServerSupabaseClient();

  const [
    sourcesResult,
    enabledSourcesResult,
    discoveredJobsResult,
    suspiciousJobsResult,
    reviewRequiredJobsResult,
    claimReviewJobsResult,
    recentRunsResult,
    recentJobsResult,
  ] = await Promise.all([
    supabase.from('aggregation_sources').select('id', { count: 'exact', head: true }),
    supabase.from('aggregation_sources').select('id', { count: 'exact', head: true }).eq('enabled', true),
    supabase.from('discovered_jobs').select('id', { count: 'exact', head: true }),
    supabase
      .from('discovered_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'suspicious'),
    supabase
      .from('discovered_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('ingestion_status', 'review_required'),
    supabase
      .from('discovered_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('claim_status', 'claim_under_review'),
    supabase
      .from('aggregation_runs')
      .select(
        `
        id,
        status,
        trigger_type,
        created_at,
        started_at,
        finished_at,
        fetched_count,
        normalized_count,
        error_count,
        source:source_id (
          name,
          slug
        )
        `
      )
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('discovered_jobs')
      .select(
        `
        id,
        title,
        company_name,
        verification_status,
        claim_status,
        trust_score,
        scam_score,
        discovered_at,
        source_name
        `
      )
      .order('discovered_at', { ascending: false })
      .limit(6),
  ]);

  const results = [
    sourcesResult,
    enabledSourcesResult,
    discoveredJobsResult,
    suspiciousJobsResult,
    reviewRequiredJobsResult,
    claimReviewJobsResult,
    recentRunsResult,
    recentJobsResult,
  ];

  const migrationMissing = results.some((result) =>
    isMissingAggregationRelationError(result.error || null)
  );

  const firstError = results.find(
    (result) => result.error && !isMissingAggregationRelationError(result.error)
  )?.error;

  const recentRuns = (recentRunsResult.data || []) as RunRow[];
  const recentJobs = (recentJobsResult.data || []) as DiscoveredJobRow[];

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Aggregation Control Room</h1>
          <p className="text-gray-400">
            Admin-only view of approved sources, discovered supply, and ingestion activity.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/aggregation/sources"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            Sources
          </Link>
          <Link
            href="/admin/aggregation/runs"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
          >
            Run History
          </Link>
        </div>
      </div>

      {migrationMissing && (
        <div className="mb-6 rounded-xl border border-yellow-700 bg-yellow-900/20 p-4 text-yellow-200">
          Aggregation tables are not available yet. Apply{' '}
          <code>supabase/migrations/20260313000200_job_aggregation_foundation.sql</code>{' '}
          before using these admin screens.
        </div>
      )}

      {!migrationMissing && firstError && (
        <div className="mb-6 rounded-xl border border-red-700 bg-red-900/20 p-4 text-red-200">
          Failed to load aggregation overview: {firstError.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        <MetricCard
          title="Sources"
          value={`${sourcesResult.count ?? 0}`}
          href="/admin/aggregation/sources"
          muted="Approved connectors registered for aggregation."
        />
        <MetricCard
          title="Enabled Sources"
          value={`${enabledSourcesResult.count ?? 0}`}
          href="/admin/aggregation/sources"
          muted="Sources currently eligible for scheduled runs."
        />
        <MetricCard
          title="Discovered Jobs"
          value={`${discoveredJobsResult.count ?? 0}`}
          href="/admin/aggregation/discovered-jobs?queue=all"
          muted="Canonical discovered job records in the new subsystem."
        />
        <MetricCard
          title="Needs Review"
          value={`${reviewRequiredJobsResult.count ?? 0}`}
          href="/admin/aggregation/discovered-jobs?queue=review"
          muted="Jobs waiting for moderation or trust review."
        />
        <MetricCard
          title="Suspicious"
          value={`${suspiciousJobsResult.count ?? 0}`}
          href="/admin/aggregation/discovered-jobs?queue=suspicious"
          muted="Hidden jobs that tripped trust or scam signals."
        />
        <MetricCard
          title="Claims In Review"
          value={`${claimReviewJobsResult.count ?? 0}`}
          href="/admin/aggregation/discovered-jobs?queue=claims"
          muted="Discovered jobs awaiting recruiter claim review."
        />
      </div>

      <div className="mb-8 space-y-4">
        <RunScrapersButton />
        <DedupPanel />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Runs</h2>
              <p className="text-sm text-gray-400">Last six ingestion runs across all sources.</p>
            </div>
            <Link href="/admin/aggregation/runs" className="text-sm text-blue-400 hover:text-blue-300">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-700">
            {recentRuns.length === 0 && (
              <div className="px-6 py-10 text-center text-gray-400">
                No aggregation runs recorded yet.
              </div>
            )}
            {recentRuns.map((run) => {
              const source = normalizeSingle(run.source);
              return (
                <div key={run.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-white font-medium">
                        {source?.name ?? 'Unknown source'}
                      </p>
                      <p className="text-sm text-gray-400">
                        {run.trigger_type} run on {formatDateTime(run.created_at)}
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadgeClass(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg bg-gray-900/50 p-3">
                      <p className="text-gray-500">Fetched</p>
                      <p className="text-white font-semibold">{run.fetched_count}</p>
                    </div>
                    <div className="rounded-lg bg-gray-900/50 p-3">
                      <p className="text-gray-500">Normalized</p>
                      <p className="text-white font-semibold">{run.normalized_count}</p>
                    </div>
                    <div className="rounded-lg bg-gray-900/50 p-3">
                      <p className="text-gray-500">Errors</p>
                      <p className="text-white font-semibold">{run.error_count}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Newest Discovered Jobs</h2>
              <p className="text-sm text-gray-400">Raw supply stays separate from verified native jobs.</p>
            </div>
            <Link
              href="/admin/aggregation/discovered-jobs?queue=all"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              View queue
            </Link>
          </div>
          <div className="divide-y divide-gray-700">
            {recentJobs.length === 0 && (
              <div className="px-6 py-10 text-center text-gray-400">
                No discovered jobs yet.
              </div>
            )}
            {recentJobs.map((job) => (
              <div key={job.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white font-medium">{job.title}</p>
                    <p className="text-sm text-gray-400">
                      {job.company_name || 'Unknown company'} | {job.source_name} | {formatShortDate(job.discovered_at)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadgeClass(job.verification_status)}`}
                  >
                    {job.verification_status}
                  </span>
                </div>
                <div className="mt-3 flex gap-3 text-xs text-gray-400">
                  <span>Claim: {job.claim_status}</span>
                  <span>Trust: {job.trust_score}</span>
                  <span>Scam: {job.scam_score}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  href,
  muted,
}: {
  title: string;
  value: string;
  href: string;
  muted: string;
}) {
  return (
    <Link href={href} className="block bg-gray-800 hover:bg-gray-800/80 rounded-xl p-5 transition-colors">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-3xl font-bold text-white mt-2">{value}</p>
      <p className="text-sm text-gray-500 mt-3">{muted}</p>
    </Link>
  );
}
