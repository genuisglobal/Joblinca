import Link from 'next/link';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { runCoverageSentinel } from '@/lib/scrapers/coverage-sentinel';

export const dynamic = 'force-dynamic';

function formatWhen(iso: string | null): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const hours = Math.round((Date.now() - t) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function statusBadge(status: string | null) {
  if (status === 'completed') return 'bg-green-900/30 border-green-700 text-green-300';
  if (status === 'partial') return 'bg-yellow-900/30 border-yellow-700 text-yellow-300';
  if (status === 'failed') return 'bg-red-900/30 border-red-700 text-red-300';
  return 'bg-gray-700/50 border-gray-600 text-gray-400';
}

export default async function CoverageDashboardPage() {
  const supabase = createServiceSupabaseClient();
  const report = await runCoverageSentinel(supabase);

  const critical = report.anomalies.filter((a) => a.severity === 'critical');
  const warnings = report.anomalies.filter((a) => a.severity === 'warning');
  const totalFetched24h = report.sources.reduce((s, src) => s + src.fetched_24h, 0);
  const totalInserted24h = report.sources.reduce((s, src) => s + src.inserted_24h, 0);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Coverage</h1>
          <p className="text-gray-400 mt-1">
            Is anything slipping past us? Each source is compared to its own 7-day baseline —
            silent scraper failures show up here (and in the daily WhatsApp digest).
          </p>
        </div>
        <Link
          href="/admin/aggregation"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
        >
          Back to Control Room
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div
          className={`rounded-xl border p-4 ${
            critical.length > 0
              ? 'border-red-700 bg-red-900/20'
              : 'border-gray-700 bg-gray-800'
          }`}
        >
          <p className="text-2xl font-bold text-white">{critical.length}</p>
          <p className="text-sm text-gray-400">Critical issues</p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            warnings.length > 0
              ? 'border-yellow-700 bg-yellow-900/20'
              : 'border-gray-700 bg-gray-800'
          }`}
        >
          <p className="text-2xl font-bold text-white">{warnings.length}</p>
          <p className="text-sm text-gray-400">Warnings</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-2xl font-bold text-white">
            {totalFetched24h}
            <span className="text-base font-normal text-gray-400"> / {totalInserted24h} new</span>
          </p>
          <p className="text-sm text-gray-400">Jobs fetched last 24h</p>
        </div>
        <Link
          href="/admin/aggregation/discovered-jobs?queue=review"
          className="rounded-xl border border-gray-700 bg-gray-800 p-4 hover:border-blue-500/50 transition-colors"
        >
          <p className="text-2xl font-bold text-white">
            {report.review_queue.needs_review}
            <span className="text-base font-normal text-gray-400">
              {' '}
              + {report.review_queue.suspicious} suspicious
            </span>
          </p>
          <p className="text-sm text-gray-400">
            Review queue
            {report.review_queue.oldest_review_days !== null &&
              report.review_queue.oldest_review_days >= 3 && (
                <span className="text-yellow-400"> — oldest {report.review_queue.oldest_review_days}d</span>
              )}
          </p>
        </Link>
      </div>

      {/* Anomalies */}
      {report.anomalies.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="text-sm font-medium text-white mb-3">Active anomalies</p>
          <ul className="space-y-2">
            {[...critical, ...warnings].map((a, i) => (
              <li key={`${a.source}-${a.type}-${i}`} className="flex items-start gap-2 text-sm">
                <span
                  className={`shrink-0 mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-xs ${
                    a.severity === 'critical'
                      ? 'bg-red-900/30 border-red-700 text-red-300'
                      : 'bg-yellow-900/30 border-yellow-700 text-yellow-300'
                  }`}
                >
                  {a.type}
                </span>
                <span className="text-gray-300">{a.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-source table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Source</th>
              <th className="p-4 text-left text-gray-400 font-medium">Last run</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Baseline / run</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">24h fetched</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">48h new</th>
              <th className="p-4 text-left text-gray-400 font-medium">Health</th>
            </tr>
          </thead>
          <tbody>
            {report.sources.map((src) => (
              <tr key={src.slug} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="p-4">
                  <p className="text-white font-medium">{src.label}</p>
                  <p className="text-xs text-gray-500">{src.runs_7d} runs in 7d</p>
                </td>
                <td className="p-4">
                  <p className="text-gray-300 text-sm">{formatWhen(src.last_run_at)}</p>
                  {src.last_run_status && (
                    <span
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs ${statusBadge(src.last_run_status)}`}
                    >
                      {src.last_run_status}
                      {src.last_run_fetched !== null && ` · ${src.last_run_fetched} jobs`}
                    </span>
                  )}
                </td>
                <td className="p-4 text-gray-300 hidden md:table-cell">
                  {src.baseline_fetched_per_run > 0 ? `~${src.baseline_fetched_per_run}` : '—'}
                </td>
                <td className="p-4 text-gray-300 hidden md:table-cell">{src.fetched_24h}</td>
                <td className="p-4 text-gray-300 hidden lg:table-cell">{src.inserted_48h}</td>
                <td className="p-4">
                  {src.anomalies.length === 0 ? (
                    <span className="inline-flex rounded-full border border-green-700 bg-green-900/30 px-2 py-1 text-xs text-green-300">
                      healthy
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {src.anomalies.map((a) => (
                        <span
                          key={a.type}
                          title={a.message}
                          className={`inline-flex rounded-full border px-2 py-1 text-xs ${
                            a.severity === 'critical'
                              ? 'bg-red-900/30 border-red-700 text-red-300'
                              : 'bg-yellow-900/30 border-yellow-700 text-yellow-300'
                          }`}
                        >
                          {a.type}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Generated {new Date(report.generated_at).toLocaleString()} · Sources:{' '}
        <Link href="/admin/aggregation/career-pages" className="text-blue-400 hover:text-blue-300">
          manage career pages
        </Link>{' '}
        ·{' '}
        <Link href="/admin/scrapers" className="text-blue-400 hover:text-blue-300">
          run scrapers
        </Link>
      </p>
    </div>
  );
}
