'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

interface RefItem {
  id: string;
  challenge_id: string;
  challenge_title: string | null;
  challenge_domain: string | null;
  question_id: string;
  question_prompt: string | null;
  target_course:
    | {
        id: string;
        title: string;
        external_provider: string | null;
        external_url: string | null;
        is_free: boolean;
      }
    | null;
  external_provider: string | null;
  external_url: string | null;
  status: 'pending' | 'approved' | 'rejected';
  suggested_by: 'ai' | 'admin';
  suggested_at: string;
  confidence: number | null;
  rationale: string | null;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

export default function StudyRefsClient() {
  const [items, setItems] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [actingId, setActingId] = useState<string | null>(null);
  const [suggestRunning, setSuggestRunning] = useState(false);
  const [suggestChallengeId, setSuggestChallengeId] = useState('');
  const [suggestFeedback, setSuggestFeedback] = useState<string | null>(null);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/skillup/question-refs?status=${filter}&limit=200`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load refs');
      }
      setItems(Array.isArray(payload?.items) ? (payload.items as RefItem[]) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load refs');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void fetchRefs();
  }, [fetchRefs]);

  const groups = useMemo(() => {
    const byChallenge = new Map<string, RefItem[]>();
    for (const item of items) {
      const list = byChallenge.get(item.challenge_id) || [];
      list.push(item);
      byChallenge.set(item.challenge_id, list);
    }
    return Array.from(byChallenge.entries()).map(([challengeId, refs]) => ({
      challengeId,
      challengeTitle: refs[0]?.challenge_title || challengeId,
      challengeDomain: refs[0]?.challenge_domain || null,
      refs,
    }));
  }, [items]);

  async function act(refId: string, status: 'approved' | 'rejected') {
    setActingId(refId);
    try {
      const response = await fetch(`/api/admin/skillup/question-refs/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to update');
      }
      setItems((current) => current.filter((row) => row.id !== refId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setActingId(null);
    }
  }

  async function runSuggest() {
    if (!suggestChallengeId.trim()) {
      setSuggestFeedback('Enter a challenge id first.');
      return;
    }
    setSuggestRunning(true);
    setSuggestFeedback(null);
    try {
      const response = await fetch('/api/admin/skillup/suggest-refs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: suggestChallengeId.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to run suggester');
      }
      setSuggestFeedback(
        `Inserted ${payload.suggestions_inserted ?? 0} pending refs (model: ${payload.ai_model ?? 'n/a'}).`
      );
      await fetchRefs();
    } catch (err) {
      setSuggestFeedback(err instanceof Error ? err.message : 'Failed to run');
    } finally {
      setSuggestRunning(false);
    }
  }

  const filterButtonClass = (current: StatusFilter): string =>
    filter === current
      ? 'px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium'
      : 'px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 text-xs font-medium';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">Run AI suggester</h2>
        <p className="text-xs text-gray-400">
          Generates pending refs for every question that doesn&apos;t yet have an
          approved ref. Costs OpenAI tokens.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={suggestChallengeId}
            onChange={(event) => setSuggestChallengeId(event.target.value)}
            placeholder="challenge_id (uuid)"
            className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={runSuggest}
            disabled={suggestRunning}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {suggestRunning ? 'Running...' : 'Suggest refs'}
          </button>
        </div>
        {suggestFeedback ? (
          <p className="text-xs text-gray-300">{suggestFeedback}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-gray-500 mr-1">Status:</span>
        {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={filterButtonClass(status)}
          >
            {status}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void fetchRefs()}
          className="ml-auto rounded-lg bg-gray-700 hover:bg-gray-600 px-3 py-1.5 text-xs text-gray-100"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-700 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 text-sm text-gray-300">
          Loading...
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-10 text-center">
          <p className="text-gray-300">No refs match the current filter.</p>
        </div>
      ) : (
        groups.map((group) => (
          <div
            key={group.challengeId}
            className="rounded-xl border border-gray-700 bg-gray-800"
          >
            <div className="border-b border-gray-700 p-4">
              <h3 className="text-base font-semibold text-white">{group.challengeTitle}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                domain: {group.challengeDomain || 'n/a'} | challenge_id: {group.challengeId}
              </p>
            </div>
            <div className="divide-y divide-gray-700">
              {group.refs.map((ref) => (
                <div key={ref.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs uppercase tracking-wide text-gray-500">
                        Question {ref.question_id}
                      </p>
                      <p className="text-sm text-gray-100">
                        {ref.question_prompt || '(prompt missing from config)'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={
                          ref.status === 'pending'
                            ? 'text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                            : ref.status === 'approved'
                            ? 'text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                            : 'text-[10px] uppercase tracking-wide rounded-full border px-2 py-0.5 bg-rose-500/10 text-rose-300 border-rose-500/40'
                        }
                      >
                        {ref.status}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500">
                        by {ref.suggested_by}
                        {typeof ref.confidence === 'number'
                          ? ` | conf ${ref.confidence.toFixed(2)}`
                          : ''}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 space-y-1.5">
                    {ref.target_course ? (
                      <div className="space-y-0.5">
                        <p className="text-sm text-gray-100">
                          {ref.target_course.title}{' '}
                          {ref.target_course.is_free ? (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-300">
                              free
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-gray-400">
                          {ref.target_course.external_provider || 'in-house course'}
                          {ref.target_course.external_url ? (
                            <>
                              {' '}|{' '}
                              <a
                                href={ref.target_course.external_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline"
                              >
                                open course
                              </a>
                            </>
                          ) : null}
                        </p>
                      </div>
                    ) : ref.external_url ? (
                      <p className="text-sm">
                        <span className="text-gray-400 mr-2">
                          {ref.external_provider || 'external'}:
                        </span>
                        <a
                          href={ref.external_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline break-all"
                        >
                          {ref.external_url}
                        </a>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400">(no target set)</p>
                    )}
                    {ref.rationale ? (
                      <p className="text-xs text-gray-300 italic">
                        Rationale: {ref.rationale}
                      </p>
                    ) : null}
                  </div>

                  {ref.status === 'pending' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={actingId === ref.id}
                        onClick={() => void act(ref.id, 'approved')}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actingId === ref.id}
                        onClick={() => void act(ref.id, 'rejected')}
                        className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
