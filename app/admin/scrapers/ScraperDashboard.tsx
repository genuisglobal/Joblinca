'use client';

import { useState } from 'react';

interface ScraperStats {
  source: string;
  count: number;
  latest_fetched: string | null;
  cameroon_local: number;
  count_mode: 'external_feed' | 'latest_run';
}

interface Props {
  stats: ScraperStats[];
  totalJobs: number;
  facebookGroups: any[];
  unprocessedPosts: number;
  failedPosts: number;
}

const SOURCE_LABELS: Record<string, { label: string; type: 'cameroon' | 'remote' | 'facebook' }> = {
  kamerpower: { label: 'KamerPower', type: 'cameroon' },
  minajobs: { label: 'MinaJobs', type: 'cameroon' },
  cameroonjobs: { label: 'CameroonJobs.net', type: 'cameroon' },
  jobincamer: { label: 'JobInCamer', type: 'cameroon' },
  emploicm: { label: 'Emploi.cm', type: 'cameroon' },
  reliefweb: { label: 'ReliefWeb', type: 'cameroon' },
  facebook: { label: 'Facebook Groups', type: 'facebook' },
  remotive: { label: 'Remotive', type: 'remote' },
  jobicy: { label: 'Jobicy', type: 'remote' },
  findwork: { label: 'Findwork', type: 'remote' },
  upwork: { label: 'Upwork', type: 'remote' },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function StatusBadge({ hours }: { hours: number | null }) {
  if (hours === null) return <span className="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400">No data</span>;
  if (hours < 24) return <span className="px-2 py-0.5 text-xs rounded bg-green-900 text-green-300">Healthy</span>;
  if (hours < 72) return <span className="px-2 py-0.5 text-xs rounded bg-yellow-900 text-yellow-300">Stale</span>;
  return <span className="px-2 py-0.5 text-xs rounded bg-red-900 text-red-300">Down</span>;
}

export default function ScraperDashboard({
  stats,
  totalJobs,
  facebookGroups,
  unprocessedPosts,
  failedPosts,
}: Props) {
  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const cameroonJobs = stats.filter((s) => SOURCE_LABELS[s.source]?.type === 'cameroon').reduce((sum, s) => sum + s.count, 0);
  const fbJobs = stats.filter((s) => s.source === 'facebook').reduce((sum, s) => sum + s.count, 0);
  const remoteJobs = stats.filter((s) => SOURCE_LABELS[s.source]?.type === 'remote').reduce((sum, s) => sum + s.count, 0);

  async function triggerScraper(source: string) {
    setRunningSource(source);
    setRunResult(null);
    try {
      const res = await fetch('/api/admin/scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getCronSecret()}` },
        body: JSON.stringify({ source, maxPages: 2 }),
      });
      const data = await res.json();
      setRunResult(data);
    } catch (err: any) {
      setRunResult({ error: err.message });
    }
    setRunningSource(null);
  }

  function getCronSecret(): string {
    // In prod this would come from a secure source
    return typeof window !== 'undefined'
      ? (document.querySelector('meta[name="cron-secret"]') as HTMLMetaElement)?.content || ''
      : '';
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wider">External Feed</p>
          <p className="text-3xl font-bold text-white mt-1">{totalJobs.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Cameroon Latest Run</p>
          <p className="text-3xl font-bold text-emerald-400 mt-1">{cameroonJobs.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Facebook Feed</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">{fbJobs.toLocaleString()}</p>
          {unprocessedPosts > 0 && (
            <p className="text-xs text-yellow-400 mt-1">{unprocessedPosts} unprocessed posts</p>
          )}
          {failedPosts > 0 && (
            <p className="text-xs text-red-400 mt-1">{failedPosts} failed extractions awaiting retry</p>
          )}
        </div>
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Remote/Intl Feed</p>
          <p className="text-3xl font-bold text-purple-400 mt-1">{remoteJobs.toLocaleString()}</p>
        </div>
      </div>

      {/* Scraper Status Table */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-white">Scraper Sources</h2>
          <p className="mt-1 text-xs text-gray-400">
            Remote and Facebook counts reflect current `external_jobs` rows. Cameroon counts reflect the latest aggregation run per source.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
              <th className="text-left px-4 py-2">Source</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-right px-4 py-2">Jobs</th>
              <th className="text-left px-4 py-2">Last Fetched</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const info = SOURCE_LABELS[s.source] || { label: s.source, type: 'remote' };
              const hoursSince = s.latest_fetched
                ? (Date.now() - new Date(s.latest_fetched).getTime()) / (1000 * 60 * 60)
                : null;

              return (
                <tr key={s.source} className="border-b border-gray-700/50 hover:bg-gray-750">
                  <td className="px-4 py-2 text-white font-medium">{info.label}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      info.type === 'cameroon' ? 'bg-emerald-900/50 text-emerald-300' :
                      info.type === 'facebook' ? 'bg-blue-900/50 text-blue-300' :
                      'bg-purple-900/50 text-purple-300'
                    }`}>
                      {info.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-white tabular-nums">
                    {s.count}
                    {s.count_mode === 'latest_run' && (
                      <span className="ml-2 rounded bg-gray-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-300">
                        latest run
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-300">{formatDate(s.latest_fetched)}</td>
                  <td className="px-4 py-2"><StatusBadge hours={hoursSince !== null ? Math.floor(hoursSince) : null} /></td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => triggerScraper(s.source)}
                      disabled={runningSource !== null}
                      className="text-xs px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
                    >
                      {runningSource === s.source ? 'Running...' : 'Run'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {stats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No scraper data yet. Run the cron job to populate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Run Result */}
      {runResult && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Last Run Result</h3>
          <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(runResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Facebook Groups */}
      {facebookGroups.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-white">Monitored Facebook Groups</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs uppercase tracking-wider border-b border-gray-700">
                <th className="text-left px-4 py-2">Group</th>
                <th className="text-left px-4 py-2">Language</th>
                <th className="text-right px-4 py-2">Posts</th>
                <th className="text-right px-4 py-2">Jobs</th>
                <th className="text-left px-4 py-2">Last Scraped</th>
                <th className="text-left px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {facebookGroups.map((g: any) => (
                <tr key={g.id} className="border-b border-gray-700/50">
                  <td className="px-4 py-2 text-white">{g.name}</td>
                  <td className="px-4 py-2 text-gray-300 uppercase">{g.language}</td>
                  <td className="px-4 py-2 text-right text-gray-300">{g.post_count || 0}</td>
                  <td className="px-4 py-2 text-right text-gray-300">{g.job_count || 0}</td>
                  <td className="px-4 py-2 text-gray-300">{formatDate(g.last_scraped_at)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      g.enabled ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {g.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
