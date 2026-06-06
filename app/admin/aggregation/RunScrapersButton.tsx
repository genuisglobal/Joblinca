'use client';

import { useState } from 'react';
import { ADMIN_RUN_SCRAPER_SOURCE_OPTIONS } from '@/lib/scrapers/catalog';

type IngestionDetail = {
  runId: string;
  status: string;
  inserted: number;
  duplicates: number;
  suspicious: number;
};

type AggregateIngestionSummary = {
  runs: number;
  total_inserted: number;
  total_duplicates: number;
  details: IngestionDetail[];
};

type RunResult = {
  success?: boolean;
  total_jobs?: number;
  duration_ms?: number;
  errors?: string[];
  details?: string;
  sources?: Array<{
    source: string;
    jobs: number;
    duration_ms?: number;
    errors?: string[];
    queued_posts?: number;
    failed_posts?: number;
    image_assisted_posts?: number;
  }>;
  ingestion?: AggregateIngestionSummary | IngestionDetail | null;
  source?: string;
  jobs?: number;
  queued_posts?: number;
  jobs_inserted?: number;
  skipped_posts?: number;
  non_job_posts?: number;
  failed_posts?: number;
  image_assisted_posts?: number;
  error?: string;
};

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

function isFacebookRunResult(
  result: RunResult | null
): result is RunResult & { source: 'facebook' } {
  return result?.source === 'facebook';
}

function isAggregateIngestionSummary(
  value: RunResult['ingestion']
): value is AggregateIngestionSummary {
  return Boolean(value && 'runs' in value);
}

function toAggregateIngestionSummary(
  value: RunResult['ingestion']
): AggregateIngestionSummary | null {
  if (!value) {
    return null;
  }

  if (isAggregateIngestionSummary(value)) {
    return value;
  }

  return {
    runs: 1,
    total_inserted: value.inserted,
    total_duplicates: value.duplicates,
    details: [value],
  };
}

export default function RunScrapersButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('all');
  const [progress, setProgress] = useState('');

  const sources = [
    { value: 'all', label: 'All Scrapers' },
    ...ADMIN_RUN_SCRAPER_SOURCE_OPTIONS,
  ];
  const selectedIsFacebook = source === 'facebook';

  async function handleRun() {
    setLoading(true);
    setResult(null);
    setError(null);
    setProgress('');

    try {
      if (source === 'all') {
        const aggregateIngestion: AggregateIngestionSummary = {
          runs: 0,
          total_inserted: 0,
          total_duplicates: 0,
          details: [],
        };
        const aggregate: RunResult = {
          success: true,
          total_jobs: 0,
          duration_ms: 0,
          sources: [],
          ingestion: aggregateIngestion,
        };

        for (const [index, selectedSource] of ADMIN_RUN_SCRAPER_SOURCE_OPTIONS.entries()) {
          setProgress(`Running ${selectedSource.label} (${index + 1}/${ADMIN_RUN_SCRAPER_SOURCE_OPTIONS.length})...`);

          const res = await fetch('/api/admin/aggregation/run-scrapers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: selectedSource.value, maxPages: 1 }),
          });
          const data = await parseJsonResponse<RunResult>(res);

          if (!res.ok) {
            throw new Error(
              [selectedSource.label, data.error || `HTTP ${res.status}`, data.details]
                .filter(Boolean)
                .join(': ')
            );
          }

          aggregate.total_jobs = (aggregate.total_jobs || 0) + (data.jobs || 0);
          aggregate.duration_ms = (aggregate.duration_ms || 0) + (data.duration_ms || 0);
          aggregate.sources?.push({
            source: data.source || selectedSource.value,
            jobs: data.jobs || 0,
            duration_ms: data.duration_ms,
            errors: data.errors,
            queued_posts: data.queued_posts,
            failed_posts: data.failed_posts,
            image_assisted_posts: data.image_assisted_posts,
          });

          if (data.ingestion) {
            const normalizedIngestion = toAggregateIngestionSummary(data.ingestion);
            if (normalizedIngestion) {
              aggregateIngestion.runs += normalizedIngestion.runs;
              aggregateIngestion.total_inserted += normalizedIngestion.total_inserted;
              aggregateIngestion.total_duplicates += normalizedIngestion.total_duplicates;
              aggregateIngestion.details.push(...normalizedIngestion.details);
            }
          }
        }

        setResult(aggregate);
        return;
      }

      const res = await fetch('/api/admin/aggregation/run-scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, maxPages: 1 }),
      });
      const data = await parseJsonResponse<RunResult>(res);

      if (!res.ok) {
        setError(
          [data.error || `HTTP ${res.status}`, data.details].filter(Boolean).join(': ')
        );
        return;
      }

      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setProgress('');
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <h2 className="text-lg font-semibold text-white mb-2">Run Scrapers</h2>
      <p className="text-sm text-gray-400 mb-4">
        Manually trigger scrapers to populate aggregation runs and discovered jobs. "Duplicates" below means a row matched an existing discovered job.
      </p>
      {selectedIsFacebook && (
        <p className="text-xs text-blue-300 mb-4">
          Facebook Groups does not crawl Facebook directly here. This action only processes posts already captured by the Apify webhook and stored in the raw-post queue.
        </p>
      )}

      <div className="flex items-center gap-3 mb-4">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={loading}
          className="bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {sources.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <button
          onClick={handleRun}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? 'Running...' : 'Run Now'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-blue-300">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progress || (selectedIsFacebook
            ? 'Processing Facebook backlog; this may take a minute...'
            : source === 'all'
              ? 'Running each scraper separately to avoid request timeouts...'
              : 'Scraping in progress; this may take a minute...')}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {isFacebookRunResult(result) ? (
            <div className="rounded-lg border border-green-700 bg-green-900/20 p-3 text-sm text-green-300">
              Facebook processing complete
              {result.duration_ms ? ` in ${(result.duration_ms / 1000).toFixed(1)}s` : ''}
              {typeof result.queued_posts === 'number' && result.queued_posts > 0
                ? ` - ${result.queued_posts} queued posts, ${result.jobs ?? 0} jobs extracted`
                : ' - no pending Facebook posts in the queue'}
            </div>
          ) : (
            <div className="rounded-lg border border-green-700 bg-green-900/20 p-3 text-sm text-green-300">
              Scrape complete
              {result.duration_ms ? ` in ${(result.duration_ms / 1000).toFixed(1)}s` : ''}
              {result.total_jobs != null ? ` - ${result.total_jobs} jobs found` : ''}
              {result.jobs != null ? ` - ${result.jobs} jobs found` : ''}
            </div>
          )}

          {isFacebookRunResult(result) && (
            <div className="rounded-lg bg-gray-900/50 p-3 text-sm">
              <p className="text-white font-medium mb-2">Facebook Queue</p>
              <div className="grid grid-cols-2 gap-3 text-gray-300 md:grid-cols-3">
                <div>
                  <p className="text-gray-500 text-xs">Queued Posts</p>
                  <p className="font-semibold">{result.queued_posts ?? 0}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Jobs Extracted</p>
                  <p className="font-semibold">{result.jobs ?? 0}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Jobs Inserted</p>
                  <p className="font-semibold">{result.jobs_inserted ?? 0}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Skipped</p>
                  <p className="font-semibold">{result.skipped_posts ?? 0}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Not Job Posts</p>
                  <p className="font-semibold">{result.non_job_posts ?? 0}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Failed</p>
                  <p className="font-semibold">{result.failed_posts ?? 0}</p>
                </div>
              </div>
              {(result.image_assisted_posts ?? 0) > 0 && (
                <p className="mt-3 text-xs text-gray-400">
                  {result.image_assisted_posts} extracted jobs used image-assisted parsing.
                </p>
              )}
              {(result.queued_posts ?? 0) === 0 && (
                <p className="mt-3 text-xs text-gray-400">
                  To get Facebook jobs here, send fresh group posts into `/api/webhooks/apify` first.
                </p>
              )}
            </div>
          )}

          {toAggregateIngestionSummary(result.ingestion) && (
            <div className="rounded-lg bg-gray-900/50 p-3 text-sm">
              <p className="text-white font-medium mb-2">Aggregation Ingestion</p>
              <div className="grid grid-cols-3 gap-3 text-gray-300">
                <div>
                  <p className="text-gray-500 text-xs">Runs Created</p>
                  <p className="font-semibold">{toAggregateIngestionSummary(result.ingestion)?.runs}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Jobs Inserted</p>
                  <p className="font-semibold">{toAggregateIngestionSummary(result.ingestion)?.total_inserted}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Matched Existing</p>
                  <p className="font-semibold">{toAggregateIngestionSummary(result.ingestion)?.total_duplicates}</p>
                </div>
              </div>
              {(toAggregateIngestionSummary(result.ingestion)?.details.length || 0) > 0 && (
                <div className="mt-3 space-y-1">
                  {toAggregateIngestionSummary(result.ingestion)?.details.map((d) => (
                    <div key={d.runId} className="flex items-center justify-between text-xs text-gray-400">
                      <span className="truncate max-w-[200px]">{d.runId}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 ${
                          d.status === 'completed'
                            ? 'border-green-700 text-green-300'
                            : d.status === 'partial'
                              ? 'border-yellow-700 text-yellow-300'
                              : 'border-red-700 text-red-300'
                        }`}
                      >
                        {d.status} - {d.inserted} new, {d.duplicates} matched
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {source === 'all' && result.sources && result.sources.length > 0 && (
            <div className="rounded-lg bg-gray-900/50 p-3 text-sm">
              <p className="text-white font-medium mb-2">Source Breakdown</p>
              <div className="space-y-2">
                {result.sources.map((sourceResult) => (
                  <div
                    key={sourceResult.source}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400"
                  >
                    <span className="font-medium text-gray-200">
                      {sourceResult.source}
                    </span>
                    <span>
                      {sourceResult.jobs} jobs
                      {sourceResult.duration_ms ? ` in ${(sourceResult.duration_ms / 1000).toFixed(1)}s` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Refresh this page to see updated metrics and recent runs above.
          </p>
        </div>
      )}
    </div>
  );
}
