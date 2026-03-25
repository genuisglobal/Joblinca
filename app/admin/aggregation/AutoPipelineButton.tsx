'use client';

import { useState } from 'react';

const PIPELINE_SOURCES = [
  { value: 'reliefweb', label: 'ReliefWeb' },
  { value: 'kamerpower', label: 'KamerPower' },
  { value: 'minajobs', label: 'MinaJobs' },
  { value: 'cameroonjobs', label: 'CameroonJobs' },
  { value: 'jobincamer', label: 'JobInCamer' },
  { value: 'emploicm', label: 'Emploi.cm' },
] as const;

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

interface ScraperIngestionResult {
  runId: string;
  status: string;
  inserted: number;
  duplicates: number;
  suspicious: number;
}

interface SingleScraperResult {
  success?: boolean;
  source?: string;
  jobs?: number;
  duration_ms?: number;
  ingestion?: ScraperIngestionResult | null;
  error?: string;
}

interface PipelineMaintenanceResult {
  success?: boolean;
  auto_publish?: PipelineResult['auto_publish'];
  dedup_cleanup?: PipelineResult['dedup_cleanup'];
  stale_cleanup?: PipelineResult['stale_cleanup'];
  total_duration_ms?: number;
  error?: string;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
}

export default function AutoPipelineButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  async function runPipeline() {
    setLoading(true);
    setResult(null);
    setError('');
    setProgress('Preparing pipeline...');

    try {
      const startedAt = Date.now();
      const aggregate: PipelineResult = {
        scraping: {
          sources_run: 0,
          total_jobs_fetched: 0,
          duration_ms: 0,
        },
        ingestion: {
          runs: 0,
          inserted: 0,
          duplicates: 0,
          suspicious: 0,
        },
        auto_publish: {
          eligible: 0,
          published: 0,
          deduplicated: 0,
          skipped_duplicate: 0,
          errors: 0,
        },
        dedup_cleanup: {
          groups_found: 0,
          duplicates_hidden: 0,
        },
        stale_cleanup: {
          expired: 0,
        },
        total_duration_ms: 0,
      };

      for (const [index, source] of PIPELINE_SOURCES.entries()) {
        setProgress(`Scraping ${source.label} (${index + 1}/${PIPELINE_SOURCES.length})...`);

        const scraperRes = await fetch('/api/admin/aggregation/run-scrapers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: source.value, maxPages: 2 }),
        });
        const scraperData = await parseJsonResponse<SingleScraperResult>(scraperRes);

        if (!scraperRes.ok) {
          throw new Error(`${source.label}: ${scraperData.error || `HTTP ${scraperRes.status}`}`);
        }

        aggregate.scraping.sources_run += 1;
        aggregate.scraping.total_jobs_fetched += scraperData.jobs || 0;
        aggregate.scraping.duration_ms += scraperData.duration_ms || 0;

        if (scraperData.ingestion) {
          aggregate.ingestion.runs += 1;
          aggregate.ingestion.inserted += scraperData.ingestion.inserted || 0;
          aggregate.ingestion.duplicates += scraperData.ingestion.duplicates || 0;
          aggregate.ingestion.suspicious += scraperData.ingestion.suspicious || 0;
        }
      }

      setProgress('Publishing trustworthy jobs and cleaning duplicates...');

      const maintenanceRes = await fetch('/api/admin/aggregation/pipeline-maintenance', {
        method: 'POST',
      });
      const maintenanceData = await parseJsonResponse<PipelineMaintenanceResult>(maintenanceRes);

      if (!maintenanceRes.ok) {
        throw new Error(maintenanceData.error || `HTTP ${maintenanceRes.status}`);
      }

      aggregate.auto_publish = maintenanceData.auto_publish || aggregate.auto_publish;
      aggregate.dedup_cleanup = maintenanceData.dedup_cleanup || aggregate.dedup_cleanup;
      aggregate.stale_cleanup = maintenanceData.stale_cleanup || aggregate.stale_cleanup;
      aggregate.total_duration_ms = Date.now() - startedAt;

      setResult(aggregate);
    } catch (err) {
      setError(String(err));
    } finally {
      setProgress('');
      setLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Auto Pipeline</h2>
          <p className="text-sm text-gray-400">
            Runs each source separately to avoid request timeouts, then auto-publishes trustworthy jobs and cleans duplicates.
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
          {progress || 'Running full pipeline...'}
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
              stats={[{ label: 'Archived', value: result.stale_cleanup.expired }]}
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
      {stats.map((stat) => (
        <div key={stat.label} className="flex justify-between text-sm">
          <span className="text-gray-500">{stat.label}</span>
          <span className="text-white font-medium">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}
