'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatSlaRemaining, isOpenStatus, slaState } from '@/lib/vetting/queue';
import type { PoolCandidate, SavedSelection, VettingRequestRow } from '@/lib/vetting/service';

interface Pick {
  applicationId: string;
  note: string;
}

const TIER_LABELS = ['Qualified', 'Review', 'Not screened', 'Failed screening'];
const TIER_STYLES = [
  'bg-green-500/10 text-green-400 border-green-500/30',
  'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  'bg-neutral-500/10 text-neutral-300 border-neutral-500/30',
  'bg-red-500/10 text-red-400 border-red-500/30',
];

export default function ShortlistBuilder({
  request,
  pool,
  initialSelection,
  currentUserId,
}: {
  request: VettingRequestRow;
  pool: PoolCandidate[];
  initialSelection: SavedSelection[];
  currentUserId: string;
}) {
  const router = useRouter();
  const editable = isOpenStatus(request.status);
  const [picks, setPicks] = useState<Pick[]>(
    initialSelection.map((s) => ({ applicationId: s.applicationId, note: s.note ?? '' }))
  );
  const [savedKey, setSavedKey] = useState(() => JSON.stringify(picks));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [notes, setNotes] = useState(request.officer_notes ?? '');

  const byApplication = useMemo(() => new Map(pool.map((c) => [c.applicationId, c])), [pool]);
  const pickedIds = new Set(picks.map((p) => p.applicationId));
  const dirty = JSON.stringify(picks) !== savedKey;
  const sla = slaState(request.due_at, request.status);

  async function call(label: string, url: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(label);
    setMessage(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((data.error as string) || 'Request failed');
      return data;
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
      return null;
    } finally {
      setBusy(null);
    }
  }

  function toggle(applicationId: string) {
    setPicks((prev) =>
      prev.some((p) => p.applicationId === applicationId)
        ? prev.filter((p) => p.applicationId !== applicationId)
        : [...prev, { applicationId, note: '' }]
    );
  }

  function move(index: number, delta: number) {
    setPicks((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function autoFill() {
    const top = pool
      .filter((c) => c.tier < 3)
      .slice(0, request.shortlist_size)
      .map((c) => ({ applicationId: c.applicationId, note: '' }));
    setPicks(top);
  }

  async function save(): Promise<boolean> {
    const data = await call('save', `/api/admin/shortlists/${request.id}/candidates`, {
      method: 'PUT',
      body: JSON.stringify({ candidates: picks }),
    });
    if (!data) return false;
    setSavedKey(JSON.stringify(picks));
    setMessage({ kind: 'ok', text: `Saved ${picks.length} candidates.` });
    router.refresh();
    return true;
  }

  async function deliver() {
    if (picks.length < request.shortlist_size) {
      const proceed = window.confirm(
        `The request is for ${request.shortlist_size} candidates and you have ${picks.length}. Deliver anyway?`
      );
      if (!proceed) return;
    }
    if (dirty && !(await save())) return;
    const data = await call('deliver', `/api/admin/shortlists/${request.id}/deliver`, { method: 'POST' });
    if (!data) return;
    setMessage({
      kind: data.whatsappSent ? 'ok' : 'error',
      text: data.whatsappSent
        ? `Delivered ${data.candidateCount} candidates. The recruiter was notified on WhatsApp.`
        : `Delivered ${data.candidateCount} candidates, but the WhatsApp message wasn't sent (no linked number). Tell the recruiter directly.`,
    });
    router.refresh();
  }

  async function patch(action: string, extra: Record<string, unknown> = {}) {
    const data = await call(action, `/api/admin/shortlists/${request.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, ...extra }),
    });
    if (data) router.refresh();
  }

  function cancel() {
    const reason = window.prompt('Why is this request being cancelled?');
    if (reason && reason.trim()) void patch('cancel', { reason });
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{request.job?.title ?? 'Unknown job'}</h1>
            <p className="text-neutral-400">
              {[request.job?.company_name, request.job?.location].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="mt-2 text-sm text-neutral-400">
              Recruiter: {request.recruiter?.full_name || '—'}
              {request.recruiter?.email ? ` · ${request.recruiter.email}` : ''}
              {request.recruiter?.phone ? ` · ${request.recruiter.phone}` : ''}
            </p>
            {request.job && (
              <a
                href={`/jobs/${request.job.public_id ?? request.job.id}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-primary-300 hover:text-primary-200"
              >
                View job ad ↗
              </a>
            )}
          </div>
          <div className="text-right space-y-2">
            <p className="text-sm text-neutral-300">
              Status: <span className="font-medium text-white">{request.status.replace('_', ' ')}</span>
            </p>
            {sla !== 'done' && (
              <p
                className={`text-sm font-medium ${
                  sla === 'overdue' ? 'text-red-400' : sla === 'due_soon' ? 'text-yellow-400' : 'text-green-400'
                }`}
              >
                {formatSlaRemaining(request.due_at)}
              </p>
            )}
            <p className="text-sm text-neutral-400">
              Officer: {request.assignee?.full_name || request.assignee?.email || 'unassigned'}
            </p>
            {editable && (
              <div className="flex flex-wrap justify-end gap-2">
                {request.assigned_to === currentUserId ? (
                  <button
                    onClick={() => patch('release')}
                    disabled={busy !== null}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
                  >
                    Release
                  </button>
                ) : (
                  <button
                    onClick={() => patch('claim')}
                    disabled={busy !== null}
                    className="rounded-lg border border-primary-500/40 px-3 py-1.5 text-xs text-primary-200 hover:bg-primary-600/15"
                  >
                    Assign to me
                  </button>
                )}
                <button
                  onClick={cancel}
                  disabled={busy !== null}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                >
                  Cancel request
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-neutral-400 mb-1">Officer notes (internal)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!editable}
            rows={2}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white disabled:opacity-60"
          />
          {editable && notes !== (request.officer_notes ?? '') && (
            <button
              onClick={() => patch('notes', { notes })}
              disabled={busy !== null}
              className="mt-2 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:border-neutral-500"
            >
              Save notes
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.kind === 'ok'
              ? 'border-green-500/30 bg-green-500/10 text-green-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Shortlist */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">
            Shortlist ({picks.length} of {request.shortlist_size})
          </h2>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={autoFill}
                disabled={busy !== null || pool.length === 0}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
              >
                Fill top {request.shortlist_size}
              </button>
              <button
                onClick={save}
                disabled={busy !== null || !dirty}
                className="rounded-lg border border-primary-500/40 px-3 py-1.5 text-sm text-primary-200 hover:bg-primary-600/15 disabled:opacity-50"
              >
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                onClick={deliver}
                disabled={busy !== null || picks.length === 0}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
              >
                {busy === 'deliver' ? 'Delivering…' : 'Deliver to recruiter'}
              </button>
            </div>
          )}
        </div>

        {picks.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Pick candidates from the pool below, or use “Fill top {request.shortlist_size}”.
          </p>
        ) : (
          <ol className="space-y-2">
            {picks.map((pick, index) => {
              const c = byApplication.get(pick.applicationId);
              return (
                <li key={pick.applicationId} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-6 text-center font-semibold text-primary-300">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white">{c?.fullName || 'Unknown candidate'}</p>
                      <input
                        value={pick.note}
                        onChange={(e) =>
                          setPicks((prev) =>
                            prev.map((p, i) => (i === index ? { ...p, note: e.target.value } : p))
                          )
                        }
                        disabled={!editable}
                        maxLength={500}
                        placeholder="Why this candidate (the recruiter sees this)"
                        className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-white disabled:opacity-60"
                      />
                    </div>
                    {editable && (
                      <div className="flex gap-1">
                        <button onClick={() => move(index, -1)} className="px-2 text-neutral-400 hover:text-white" aria-label="Move up">↑</button>
                        <button onClick={() => move(index, 1)} className="px-2 text-neutral-400 hover:text-white" aria-label="Move down">↓</button>
                        <button onClick={() => toggle(pick.applicationId)} className="px-2 text-red-400 hover:text-red-300" aria-label="Remove">✕</button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Pool */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-lg font-semibold text-white mb-1">Candidate pool ({pool.length})</h2>
        <p className="text-sm text-neutral-400 mb-4">
          All applicants, ranked: WhatsApp screening result first, then score. Rejected and hired
          applications are left out.
        </p>
        {pool.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No applications yet. Share the job in the WhatsApp channels or source candidates directly.
          </p>
        ) : (
          <div className="space-y-2">
            {pool.map((c) => {
              const picked = pickedIds.has(c.applicationId);
              return (
                <div
                  key={c.applicationId}
                  className={`rounded-lg border p-3 ${
                    picked ? 'border-primary-500/40 bg-primary-600/5' : 'border-neutral-800 bg-neutral-950'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-8 text-center text-sm text-neutral-500">#{c.autoRank}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-white">{c.fullName || 'Unknown candidate'}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${TIER_STYLES[c.tier]}`}>
                          {TIER_LABELS[c.tier]}
                        </span>
                        {c.score !== null && (
                          <span className="text-xs text-neutral-400">score {Math.round(c.score)}</span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {[c.location, c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                      </p>
                      {c.screeningSummary && (
                        <p className="mt-2 text-sm text-neutral-300">{c.screeningSummary}</p>
                      )}
                      {(c.strengths.length > 0 || c.risks.length > 0) && (
                        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                          {c.strengths.length > 0 && (
                            <p className="text-green-400/90">+ {c.strengths.slice(0, 3).join(' · ')}</p>
                          )}
                          {c.risks.length > 0 && (
                            <p className="text-red-400/90">− {c.risks.slice(0, 3).join(' · ')}</p>
                          )}
                        </div>
                      )}
                      {c.resumeUrl && /^https?:\/\//.test(c.resumeUrl) && (
                        <a
                          href={c.resumeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-block text-xs text-primary-300 hover:text-primary-200"
                        >
                          Open CV ↗
                        </a>
                      )}
                    </div>
                    {editable && (
                      <button
                        onClick={() => toggle(c.applicationId)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          picked
                            ? 'border border-neutral-700 text-neutral-300 hover:border-neutral-500'
                            : 'bg-primary-600 text-white hover:bg-primary-500'
                        }`}
                      >
                        {picked ? 'Remove' : 'Add'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
