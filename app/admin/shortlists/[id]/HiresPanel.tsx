'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DEFAULT_SUCCESS_FEE_PERCENT,
  formatXaf,
  introductionWindowEnd,
  PAY_PER_RESULT_BALANCE_XAF,
} from '@/lib/vetting/billing';
import type { HireRow } from '@/lib/vetting/hires';

interface ShortlistedCandidate {
  applicationId: string;
  candidateId: string;
  rank: number;
  fullName: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  no_fee: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/30',
  needs_review: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  due: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  paid: 'bg-green-500/10 text-green-400 border-green-500/30',
  waived: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  no_fee: 'Hired · no fee',
  needs_review: 'Hired · salary needed',
  due: 'Fee due',
  paid: 'Fee paid',
  waived: 'Fee waived',
};

export default function HiresPanel({
  requestId,
  billingModel,
  successFeePercent,
  deliveredAt,
  candidates,
  hires,
}: {
  requestId: string;
  billingModel: string;
  successFeePercent: number | null;
  deliveredAt: string | null;
  candidates: ShortlistedCandidate[];
  hires: HireRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ applicationId: string; salary: string; hiredAt: string } | null>(null);

  const hireByCandidate = new Map(hires.map((h) => [h.candidate_id, h]));
  const windowEnd = deliveredAt ? introductionWindowEnd(deliveredAt) : null;

  async function send(label: string, url: string, method: string, body: unknown) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setForm(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const terms =
    billingModel === 'pay_per_result'
      ? `Pay-per-result: a hire triggers the ${formatXaf(PAY_PER_RESULT_BALANCE_XAF)} balance.`
      : billingModel === 'success_fee'
        ? `Success fee: ${successFeePercent ?? DEFAULT_SUCCESS_FEE_PERCENT}% of the first month's salary per hire.`
        : billingModel === 'free'
          ? 'Free shortlist: hires are recorded without a fee.'
          : 'Paid up front: hires are recorded without a fee.';

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <h2 className="text-lg font-semibold text-white mb-1">Hires</h2>
      <p className="text-sm text-neutral-400 mb-4">
        {terms}
        {windowEnd && ` Introductions stay billable until ${windowEnd.toISOString().slice(0, 10)}.`}{' '}
        Hires the recruiter marks in their pipeline are recorded here automatically.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <ul className="space-y-2">
        {candidates.map((c) => {
          const hire = hireByCandidate.get(c.candidateId);
          const editing = form?.applicationId === c.applicationId;
          return (
            <li key={c.applicationId} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 text-center font-semibold text-primary-300">{c.rank}</span>
                <span className="flex-1 min-w-0 font-medium text-white">{c.fullName || 'Unknown candidate'}</span>
                {hire ? (
                  <>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[hire.status] ?? ''}`}>
                      {STATUS_LABELS[hire.status] ?? hire.status}
                      {hire.amount_xaf ? ` · ${formatXaf(hire.amount_xaf)}` : ''}
                    </span>
                    <span className="text-xs text-neutral-500">
                      hired {hire.hired_at} · {hire.detected_by === 'officer' ? 'recorded by officer' : 'marked by recruiter'}
                    </span>
                    {(hire.status === 'needs_review' || hire.status === 'due') && billingModel === 'success_fee' && (
                      <button
                        onClick={() => {
                          const salary = window.prompt('Monthly salary in FCFA');
                          if (salary) void send('salary', `/api/admin/shortlists/hires/${hire.id}`, 'PATCH', { action: 'salary', monthlySalary: salary });
                        }}
                        disabled={busy !== null}
                        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500"
                      >
                        {hire.monthly_salary_xaf ? 'Change salary' : 'Add salary'}
                      </button>
                    )}
                    {(hire.status === 'needs_review' || hire.status === 'due') && (
                      <button
                        onClick={() => {
                          const reason = window.prompt('Why waive this fee?');
                          if (reason && reason.trim()) void send('waive', `/api/admin/shortlists/hires/${hire.id}`, 'PATCH', { action: 'waive', reason });
                        }}
                        disabled={busy !== null}
                        className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        Waive
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() =>
                      setForm({ applicationId: c.applicationId, salary: '', hiredAt: new Date().toISOString().slice(0, 10) })
                    }
                    disabled={busy !== null}
                    className="rounded-lg border border-primary-500/40 px-3 py-1 text-xs text-primary-200 hover:bg-primary-600/15"
                  >
                    Mark hired
                  </button>
                )}
              </div>

              {editing && form && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send('hire', `/api/admin/shortlists/${requestId}/hires`, 'POST', {
                      applicationId: form.applicationId,
                      monthlySalary: form.salary || undefined,
                      hiredAt: form.hiredAt,
                    });
                  }}
                  className="mt-3 flex flex-wrap items-end gap-3"
                >
                  <label>
                    <span className="block text-xs text-neutral-400 mb-1">
                      Monthly salary (FCFA){billingModel === 'success_fee' ? '' : ', optional'}
                    </span>
                    <input
                      value={form.salary}
                      onChange={(e) => setForm({ ...form, salary: e.target.value })}
                      inputMode="numeric"
                      placeholder="150000"
                      className="w-36 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white"
                    />
                  </label>
                  <label>
                    <span className="block text-xs text-neutral-400 mb-1">Hired on</span>
                    <input
                      type="date"
                      value={form.hiredAt}
                      onChange={(e) => setForm({ ...form, hiredAt: e.target.value })}
                      className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-white"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy !== null}
                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
                  >
                    {busy === 'hire' ? 'Saving…' : 'Record hire'}
                  </button>
                  <button type="button" onClick={() => setForm(null)} className="text-sm text-neutral-400 hover:text-white">
                    Cancel
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
