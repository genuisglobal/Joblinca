'use client';

import type { SegmentedFunnelSummary } from '@/lib/applications/ranking';

function formatRate(value: number): string {
  return `${Math.round(value)}%`;
}

export default function SegmentedFunnelComparison({
  title,
  description,
  segments,
  emptyLabel = 'No funnel activity for this window yet.',
}: {
  title: string;
  description: string;
  segments: SegmentedFunnelSummary[];
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-5">
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm text-gray-400">{description}</p>
      </div>

      {segments.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-gray-700 px-4 py-6 text-sm text-gray-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-gray-400">
              <tr className="border-b border-gray-700">
                <th className="px-3 py-2 font-medium">Segment</th>
                <th className="px-3 py-2 font-medium">Apply</th>
                <th className="px-3 py-2 font-medium">Eligible</th>
                <th className="px-3 py-2 font-medium">Interview</th>
                <th className="px-3 py-2 font-medium">Offer</th>
                <th className="px-3 py-2 font-medium">Hire</th>
                <th className="px-3 py-2 font-medium">Eligible / Apply</th>
                <th className="px-3 py-2 font-medium">Hire / Apply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-gray-200">
              {segments.map((segment) => (
                <tr key={segment.key}>
                  <td className="px-3 py-3 font-medium text-white">{segment.label}</td>
                  <td className="px-3 py-3">{segment.totals.apply}</td>
                  <td className="px-3 py-3">{segment.totals.eligible}</td>
                  <td className="px-3 py-3">{segment.totals.interview}</td>
                  <td className="px-3 py-3">{segment.totals.offer}</td>
                  <td className="px-3 py-3">{segment.totals.hire}</td>
                  <td className="px-3 py-3 text-emerald-300">
                    {formatRate(segment.conversions.eligibilityFromApply)}
                  </td>
                  <td className="px-3 py-3 text-cyan-300">
                    {formatRate(segment.conversions.hireFromApply)}
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
