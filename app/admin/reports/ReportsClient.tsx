'use client';

import { useState } from 'react';
import Link from 'next/link';

type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned';

interface ReportRow {
  id: string;
  job_id: string;
  reporter_id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  admin_notes: string | null;
  created_at: string;
  jobs: { id: string; title: string; company_name: string | null; recruiter_id: string | null; scam_score: number | null; published: boolean; approval_status: string | null } | null;
  profiles: { id: string; full_name: string | null; email: string | null; role: string | null } | null;
}

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

const REASON_LABELS: Record<string, string> = {
  scam: 'Scam / Fraud',
  misleading: 'Misleading',
  duplicate: 'Duplicate',
  offensive: 'Offensive',
  wrong_info: 'Wrong Info',
  other: 'Other',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  reviewed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  dismissed: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
  actioned: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export default function ReportsClient({ reports }: { reports: ReportRow[] }) {
  const [filter, setFilter] = useState<'all' | ReportStatus>('all');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [updatedStatuses, setUpdatedStatuses] = useState<Record<string, ReportStatus>>({});

  const filtered = reports.filter((r) => {
    const status = updatedStatuses[r.id] || r.status;
    return filter === 'all' || status === filter;
  });

  async function handleAction(reportId: string, newStatus: ReportStatus) {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, admin_notes: actionNotes || null }),
      });
      if (res.ok) {
        setUpdatedStatuses((prev) => ({ ...prev, [reportId]: newStatus }));
        setActioningId(null);
        setActionNotes('');
      }
    } catch {
      // silent fail — user can retry
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'pending', 'reviewed', 'dismissed', 'actioned'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              filter === s
                ? 'border-primary-500/40 bg-primary-600/15 text-primary-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">
          No reports to show.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => {
            const job = normalizeSingle(report.jobs as unknown as ReportRow['jobs'] | ReportRow['jobs'][]);
            const reporter = normalizeSingle(report.profiles as unknown as ReportRow['profiles'] | ReportRow['profiles'][]);
            const status = updatedStatuses[report.id] || report.status;
            const isActioning = actioningId === report.id;

            return (
              <div
                key={report.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || ''}`}>
                        {status}
                      </span>
                      <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
                        {REASON_LABELS[report.reason] || report.reason}
                      </span>
                      {job?.scam_score != null && job.scam_score > 0 && (
                        <span className="rounded-full bg-red-500/10 border border-red-500/30 px-2.5 py-0.5 text-xs text-red-400">
                          Scam score: {job.scam_score}
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-white">
                      {job ? (
                        <Link href={`/admin/jobs/${job.id}`} className="hover:text-primary-300 transition-colors">
                          {job.title}
                        </Link>
                      ) : (
                        'Unknown job'
                      )}
                    </h3>
                    {job?.company_name && (
                      <p className="text-sm text-neutral-400">{job.company_name}</p>
                    )}

                    {report.description && (
                      <p className="mt-2 text-sm text-neutral-300 bg-neutral-800/50 rounded-lg p-3">
                        &ldquo;{report.description}&rdquo;
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-500">
                      <span>Reported by: {reporter?.full_name || reporter?.email || 'Unknown'}</span>
                      <span>{new Date(report.created_at).toLocaleDateString()}</span>
                      {job && (
                        <span>
                          Job status: {job.published ? 'live' : 'unpublished'} / {job.approval_status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {status === 'pending' && !isActioning && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleAction(report.id, 'dismissed')}
                        className="px-3 py-1.5 text-xs rounded-lg border border-neutral-700 text-neutral-400 hover:bg-neutral-800 transition-colors"
                      >
                        Dismiss
                      </button>
                      <button
                        onClick={() => setActioningId(report.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
                      >
                        Take Action
                      </button>
                    </div>
                  )}
                </div>

                {/* Action panel */}
                {isActioning && (
                  <div className="mt-4 pt-4 border-t border-neutral-800">
                    <textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="Admin notes (optional)"
                      rows={2}
                      className="w-full mb-3 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActioningId(null); setActionNotes(''); }}
                        className="px-3 py-1.5 text-xs rounded-lg border border-neutral-700 text-neutral-400 hover:bg-neutral-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAction(report.id, 'reviewed')}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                      >
                        Mark Reviewed
                      </button>
                      <button
                        onClick={() => handleAction(report.id, 'actioned')}
                        className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
                      >
                        Unpublish Job
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
