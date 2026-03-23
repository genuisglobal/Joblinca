'use client';

import { useState } from 'react';

interface PipelineResult {
  scraping: {
    sources_run: number;
    total_jobs_fetched: number;
    duration_ms: number;
  };
  ingestion: {
    runs: number;
    inserted: number;
    duplicates: number;
    suspicious: number;
  };
  auto_publish: {
    eligible: number;
    published: number;
    deduplicated: number;
    skipped_duplicate: number;
    errors: number;
  };
  dedup_cleanup: {
    groups_found: number;
    duplicates_hidden: number;
  };
  stale_cleanup: {
    expired: number;
  };
  total_duration_ms: number;
}

export default function AutoPipelineButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState('');

  async function runPipeline() {
    setLoading(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/admin/aggregation/auto-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxPages: 2 }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        setError(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
        return;
      }

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
    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Auto Pipeline</h2>
          <p className="text-sm text-gray-400">
            Scrape all sources, ingest, auto-publish trustworthy jobs, and clean duplicates — all in one click.
          </p>
        </div>
        <button
          onClick={runPipeline}
          disabled={loading}
          className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all whitespace-nowrap"
        >
          {loading ? 'Running Pipeline...' : 'Run Full Pipeline'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-blue-300">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Running full pipeline — scraping, ingesting, publishing, deduplicating... this may take 2-3 minutes.
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-700 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-green-700 bg-green-900/20 p-3 text-sm text-green-300">
            Pipeline complete in {(result.total_duration_ms / 1000).toFixed(1)}s
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StepCard
              title="1. Scraping"
              stats={[
                { label: 'Sources', value: result.scraping.sources_run },
                { label: 'Jobs Fetched', value: result.scraping.total_jobs_fetched },
              ]}
              color="blue"
            />
            <StepCard
              title="2. Ingestion"
              stats={[
                { label: 'Inserted', value: result.ingestion.inserted },
                { label: 'Duplicates', value: result.ingestion.duplicates },
                { label: 'Suspicious', value: result.ingestion.suspicious },
              ]}
              color="yellow"
            />
            <StepCard
              title="3. Auto-Publish"
              stats={[
                { label: 'Eligible', value: result.auto_publish.eligible },
                { label: 'Published', value: result.auto_publish.published },
                { label: 'Skipped (dup)', value: result.auto_publish.skipped_duplicate },
              ]}
              color="green"
            />
            <StepCard
              title="4. Dedup Cleanup"
              stats={[
                { label: 'Groups Found', value: result.dedup_cleanup.groups_found },
                { label: 'Hidden', value: result.dedup_cleanup.duplicates_hidden },
              ]}
              color="purple"
            />
            <StepCard
              title="5. Expired"
              stats={[
                { label: 'Archived', value: result.stale_cleanup.expired },
              ]}
              color="blue"
            />
          </div>

          <p className="text-xs text-gray-500">
            Thresholds: auto-publish when trust {'>='} 60 and scam {'<'} 30. Jobs below threshold stay in the review queue.
          </p>
        </div>
      )}
    </div>
  );
}

function StepCard({
  title,
  stats,
  color,
}: {
  title: string;
  stats: Array<{ label: string; value: number }>;
  color: 'blue' | 'yellow' | 'green' | 'purple';
}) {
  const border = {
    blue: 'border-blue-700/50',
    yellow: 'border-yellow-700/50',
    green: 'border-green-700/50',
    purple: 'border-purple-700/50',
  }[color];

  return (
    <div className={`rounded-lg border ${border} bg-gray-900/50 p-3`}>
      <p className="text-xs text-gray-400 mb-2 font-medium">{title}</p>
      {stats.map((s) => (
        <div key={s.label} className="flex justify-between text-sm">
          <span className="text-gray-500">{s.label}</span>
          <span className="text-white font-medium">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
