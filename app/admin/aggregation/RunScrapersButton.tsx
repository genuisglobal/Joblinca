'use client';

import { useState } from 'react';

type IngestionDetail = {
  runId: string;
  status: string;
  inserted: number;
  duplicates: number;
  suspicious: number;
};

type RunResult = {
  total_jobs?: number;
  duration_ms?: number;
  ingestion?: {
    runs: number;
    total_inserted: number;
    total_duplicates: number;
    details: IngestionDetail[];
  } | null;
  source?: string;
  jobs?: number;
  error?: string;
};

export default function RunScrapersButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('all');

  const sources = [
    { value: 'all', label: 'All Scrapers' },
    { value: 'kamerpower', label: 'KamerPower' },
    { value: 'minajobs', label: 'MinaJobs' },
    { value: 'cameroonjobs', label: 'CameroonJobs' },
    { value: 'jobincamer', label: 'JobInCamer' },
    { value: 'emploicm', label: 'Emploi.cm' },
    { value: 'reliefweb', label: 'ReliefWeb' },
  ];

  async function handleRun() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/admin/aggregation/run-scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, maxPages: 1 }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }

      setResult(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl p-5">
      <h2 className="text-lg font-semibold text-white mb-2">Run Scrapers</h2>
      <p className="text-sm text-gray-400 mb-4">
        Manually trigger scrapers to populate aggregation runs and discovered jobs.
      </p>

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
          Scraping in progress — this may take a minute...
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-700 bg-green-900/20 p-3 text-sm text-green-300">
            Scrape complete
            {result.duration_ms ? ` in ${(result.duration_ms / 1000).toFixed(1)}s` : ''}
            {result.total_jobs != null ? ` — ${result.total_jobs} jobs found` : ''}
            {result.jobs != null ? ` — ${result.jobs} jobs found` : ''}
          </div>

          {result.ingestion && (
            <div className="rounded-lg bg-gray-900/50 p-3 text-sm">
              <p className="text-white font-medium mb-2">Aggregation Ingestion</p>
              <div className="grid grid-cols-3 gap-3 text-gray-300">
                <div>
                  <p className="text-gray-500 text-xs">Runs Created</p>
                  <p className="font-semibold">{result.ingestion.runs}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Jobs Inserted</p>
                  <p className="font-semibold">{result.ingestion.total_inserted}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Duplicates</p>
                  <p className="font-semibold">{result.ingestion.total_duplicates}</p>
                </div>
              </div>
              {result.ingestion.details && result.ingestion.details.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.ingestion.details.map((d) => (
                    <div key={d.runId} className="flex items-center justify-between text-xs text-gray-400">
                      <span className="truncate max-w-[200px]">{d.runId}</span>
                      <span className={`rounded-full border px-2 py-0.5 ${
                        d.status === 'completed' ? 'border-green-700 text-green-300' :
                        d.status === 'partial' ? 'border-yellow-700 text-yellow-300' :
                        'border-red-700 text-red-300'
                      }`}>
                        {d.status} — {d.inserted} new, {d.duplicates} dupes
                      </span>
                    </div>
                  ))}
                </div>
              )}
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
