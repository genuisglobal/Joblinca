import { createClient } from '@supabase/supabase-js';
import ScraperDashboard from './ScraperDashboard';

export const dynamic = 'force-dynamic';

interface ScraperStats {
  source: string;
  count: number;
  latest_fetched: string | null;
  cameroon_local: number;
}

async function getScraperStats(): Promise<{
  stats: ScraperStats[];
  totalJobs: number;
  facebookGroups: any[];
  unprocessedPosts: number;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { stats: [], totalJobs: 0, facebookGroups: [], unprocessedPosts: 0 };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get job counts by source
  const { data: jobs } = await supabase
    .from('external_jobs')
    .select('source, fetched_at, is_cameroon_local');

  const sourceMap = new Map<string, ScraperStats>();
  let totalJobs = 0;

  for (const job of (jobs || [])) {
    totalJobs++;
    const existing = sourceMap.get(job.source);
    if (existing) {
      existing.count++;
      if (job.is_cameroon_local) existing.cameroon_local++;
      if (job.fetched_at && (!existing.latest_fetched || job.fetched_at > existing.latest_fetched)) {
        existing.latest_fetched = job.fetched_at;
      }
    } else {
      sourceMap.set(job.source, {
        source: job.source,
        count: 1,
        latest_fetched: job.fetched_at || null,
        cameroon_local: job.is_cameroon_local ? 1 : 0,
      });
    }
  }

  const stats = [...sourceMap.values()].sort((a, b) => b.count - a.count);

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

  return {
    stats,
    totalJobs,
    facebookGroups: groups || [],
    unprocessedPosts: unprocessedPosts || 0,
  };
}

export default async function ScrapersPage() {
  let data;
  try {
    data = await getScraperStats();
  } catch {
    data = { stats: [], totalJobs: 0, facebookGroups: [], unprocessedPosts: 0 };
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Job Scrapers</h1>
        <span className="text-sm text-gray-400">
          {data.totalJobs.toLocaleString()} total external jobs
        </span>
      </div>

      <ScraperDashboard
        stats={data.stats}
        totalJobs={data.totalJobs}
        facebookGroups={data.facebookGroups}
        unprocessedPosts={data.unprocessedPosts}
      />
    </div>
  );
}
