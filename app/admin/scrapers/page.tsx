import { createClient } from '@supabase/supabase-js';
import { isMissingAggregationRelationError, normalizeSingle } from '@/lib/aggregation/admin';
import ScraperDashboard from './ScraperDashboard';

export const dynamic = 'force-dynamic';

interface ScraperStats {
  source: string;
  count: number;
  latest_fetched: string | null;
  cameroon_local: number;
  count_mode: 'external_feed' | 'latest_run';
}

type SourceSummary = {
  name: string;
  slug: string;
};

type AggregationRunRow = {
  created_at: string;
  normalized_count: number;
  fetched_count: number;
  source: SourceSummary | SourceSummary[] | null;
};

const CAMEROON_AGGREGATION_SOURCES = new Set([
  'reliefweb',
  'kamerpower',
  'minajobs',
  'cameroonjobs',
  'jobincamer',
  'emploicm',
]);

const KNOWN_SOURCES: Array<{
  source: string;
  count_mode: 'external_feed' | 'latest_run';
}> = [
  { source: 'reliefweb', count_mode: 'latest_run' },
  { source: 'kamerpower', count_mode: 'latest_run' },
  { source: 'minajobs', count_mode: 'latest_run' },
  { source: 'cameroonjobs', count_mode: 'latest_run' },
  { source: 'jobincamer', count_mode: 'latest_run' },
  { source: 'emploicm', count_mode: 'latest_run' },
  { source: 'facebook', count_mode: 'external_feed' },
  { source: 'remotive', count_mode: 'external_feed' },
  { source: 'jobicy', count_mode: 'external_feed' },
  { source: 'findwork', count_mode: 'external_feed' },
  { source: 'upwork', count_mode: 'external_feed' },
];

async function getScraperStats(): Promise<{
  stats: ScraperStats[];
  totalJobs: number;
  facebookGroups: any[];
  unprocessedPosts: number;
  failedPosts: number;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { stats: [], totalJobs: 0, facebookGroups: [], unprocessedPosts: 0, failedPosts: 0 };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const sourceMap = new Map<string, ScraperStats>(
    KNOWN_SOURCES.map((item) => [
      item.source,
      {
        source: item.source,
        count: 0,
        latest_fetched: null,
        cameroon_local: 0,
        count_mode: item.count_mode,
      },
    ])
  );

  // Get job counts by source from the legacy external feed.
  const { data: jobs } = await supabase
    .from('external_jobs')
    .select('source, fetched_at, is_cameroon_local');

  let totalJobs = 0;

  for (const job of (jobs || [])) {
    if (CAMEROON_AGGREGATION_SOURCES.has(job.source)) {
      continue;
    }

    totalJobs++;
    const existing = sourceMap.get(job.source) || {
      source: job.source,
      count: 0,
      latest_fetched: null,
      cameroon_local: 0,
      count_mode: 'external_feed' as const,
    };

    if (existing) {
      existing.count++;
      if (job.is_cameroon_local) existing.cameroon_local++;
      if (job.fetched_at && (!existing.latest_fetched || job.fetched_at > existing.latest_fetched)) {
        existing.latest_fetched = job.fetched_at;
      }
    }

    sourceMap.set(job.source, existing);
  }

  const aggregationRunsResult = await supabase
    .from('aggregation_runs')
    .select(
      `
      created_at,
      normalized_count,
      fetched_count,
      source:source_id (
        name,
        slug
      )
      `
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (!aggregationRunsResult.error || !isMissingAggregationRelationError(aggregationRunsResult.error)) {
    for (const row of ((aggregationRunsResult.data || []) as AggregationRunRow[])) {
      const source = normalizeSingle(row.source);
      const slug = source?.slug;

      if (!slug || !CAMEROON_AGGREGATION_SOURCES.has(slug)) {
        continue;
      }

      const existing = sourceMap.get(slug);
      if (!existing || existing.latest_fetched) {
        continue;
      }

      existing.count = row.normalized_count || row.fetched_count || 0;
      existing.latest_fetched = row.created_at;
      existing.count_mode = 'latest_run';
      sourceMap.set(slug, existing);
    }
  }

  const stats = [...sourceMap.values()]
    .filter((stat) => stat.count > 0 || stat.latest_fetched || KNOWN_SOURCES.some((item) => item.source === stat.source))
    .sort((a, b) => b.count - a.count);

  // Facebook groups
  const { data: groups } = await supabase
    .from('facebook_job_groups')
    .select('*')
    .order('created_at');

  // Unprocessed posts count
  const { count: unprocessedPosts } = await supabase
    .from('facebook_raw_posts')
    .select('id', { count: 'exact', head: true })
    .eq('processed', false);

  const { count: failedPosts } = await supabase
    .from('facebook_raw_posts')
    .select('id', { count: 'exact', head: true })
    .eq('extraction_status', 'failed');

  return {
    stats,
    totalJobs,
    facebookGroups: groups || [],
    unprocessedPosts: unprocessedPosts || 0,
    failedPosts: failedPosts || 0,
  };
}

export default async function ScrapersPage() {
  let data;
  try {
    data = await getScraperStats();
  } catch {
    data = { stats: [], totalJobs: 0, facebookGroups: [], unprocessedPosts: 0, failedPosts: 0 };
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Job Scrapers</h1>
        <span className="text-sm text-gray-400">
          {data.totalJobs.toLocaleString()} active external feed jobs
        </span>
      </div>

      <ScraperDashboard
        stats={data.stats}
        totalJobs={data.totalJobs}
        facebookGroups={data.facebookGroups}
        unprocessedPosts={data.unprocessedPosts}
        failedPosts={data.failedPosts}
      />
    </div>
  );
}
