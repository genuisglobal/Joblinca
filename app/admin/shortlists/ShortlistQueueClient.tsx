'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatSlaRemaining, slaState, type SlaState } from '@/lib/vetting/queue';
import type { VettingRequestRow } from '@/lib/vetting/service';

const SLA_STYLES: Record<SlaState, string> = {
  on_track: 'bg-green-500/10 text-green-400 border-green-500/30',
  due_soon: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  overdue: 'bg-red-500/10 text-red-400 border-red-500/30',
  done: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  in_review: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  delivered: 'bg-green-500/10 text-green-400 border-green-500/30',
  completed: 'bg-green-500/10 text-green-400 border-green-500/30',
  cancelled: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
};

const BILLING_LABELS: Record<string, string> = {
  prepaid: 'Prepaid',
  pay_per_result: 'Pay-per-result',
  success_fee: 'Success fee',
  free: 'Free',
};

type RequestType = 'free_trial' | 'manual' | 'success_fee';

const SOURCE_LABELS: Record<string, string> = {
  payment: 'Paid',
  backfill: 'Paid (earlier)',
  free_trial: 'Free trial',
  manual: 'Manual',
};

export default function ShortlistQueueClient({
  open,
  done,
  currentUserId,
}: {
  open: VettingRequestRow[];
  done: VettingRequestRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<'open' | 'mine' | 'done'>('open');
  const [jobRef, setJobRef] = useState('');
  const [source, setSource] = useState<RequestType>('free_trial');
  const [feePercent, setFeePercent] = useState(50);
  const [size, setSize] = useState(3);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows =
    view === 'done' ? done : view === 'mine' ? open.filter((r) => r.assigned_to === currentUserId) : open;

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobRef,
          source: source === 'free_trial' ? 'free_trial' : 'manual',
          billingModel: source === 'success_fee' ? 'success_fee' : 'prepaid',
          successFeePercent: source === 'success_fee' ? feePercent : undefined,
          shortlistSize: size,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the request');
      router.push(`/admin/shortlists/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={createRequest}
        className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 flex flex-wrap items-end gap-3"
      >
        <label className="flex-1 min-w-[16rem]">
          <span className="block text-xs text-neutral-400 mb-1">New request: job ID, public ID or link</span>
          <input
            value={jobRef}
            onChange={(e) => setJobRef(e.target.value)}
            required
            placeholder="https://joblinca.com/jobs/…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label>
          <span className="block text-xs text-neutral-400 mb-1">Type</span>
          <select
            value={source}
            onChange={(e) => {
              const next = e.target.value as RequestType;
              setSource(next);
              setSize(next === 'free_trial' ? 3 : 5);
            }}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            <option value="free_trial">Free first shortlist</option>
            <option value="manual">Manual (paid offline)</option>
            <option value="success_fee">Success fee (pay on hire)</option>
          </select>
        </label>
        {source === 'success_fee' && (
          <label>
            <span className="block text-xs text-neutral-400 mb-1">% of first month</span>
            <input
              type="number"
              min={1}
              max={100}
              value={feePercent}
              onChange={(e) => setFeePercent(Number(e.target.value))}
              className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </label>
        )}
        <label>
          <span className="block text-xs text-neutral-400 mb-1">Candidates</span>
          <input
            type="number"
            min={1}
            max={20}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-20 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
        {error && <p className="w-full text-sm text-red-400">{error}</p>}
      </form>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['open', `Open (${open.length})`],
            ['mine', 'Assigned to me'],
            ['done', 'Delivered & closed'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              view === key
                ? 'border-primary-500/40 bg-primary-600/15 text-primary-200'
                : 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-neutral-500">Nothing here.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const sla = slaState(r.due_at, r.status);
            return (
              <Link
                key={r.id}
                href={`/admin/shortlists/${r.id}`}
                className="block rounded-xl border border-neutral-800 bg-neutral-900 p-5 hover:border-neutral-600 transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? ''}`}>
                    {r.status.replace('_', ' ')}
                  </span>
                  {sla !== 'done' && (
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${SLA_STYLES[sla]}`}>
                      {formatSlaRemaining(r.due_at)}
                    </span>
                  )}
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
                    {SOURCE_LABELS[r.source] ?? r.source}
                  </span>
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
                    {r.shortlist_size} candidates
                  </span>
                  <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
                    {BILLING_LABELS[r.billing_model] ?? r.billing_model}
                    {r.billing_model === 'success_fee' && r.success_fee_percent ? ` · ${r.success_fee_percent}%` : ''}
                  </span>
                </div>
                <h3 className="font-semibold text-white">{r.job?.title ?? 'Unknown job'}</h3>
                <p className="text-sm text-neutral-400">
                  {[r.job?.company_name, r.job?.location].filter(Boolean).join(' · ') || '—'}
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  Recruiter: {r.recruiter?.full_name || r.recruiter?.email || 'unknown'}
                  {' · '}
                  {r.assignee ? `Officer: ${r.assignee.full_name || r.assignee.email}` : 'Unassigned'}
                  {r.cancelled_reason ? ` · Cancelled: ${r.cancelled_reason}` : ''}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
