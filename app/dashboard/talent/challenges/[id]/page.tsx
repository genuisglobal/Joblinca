'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ─── Question / answer types (mirror of lib/skillup/grader.ts) ──────────────

type QuestionType = 'mcq_single' | 'true_false' | 'numeric' | 'matching' | 'ordering';

interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  time_limit_seconds: number | null;
}

interface McqSingleQuestion extends BaseQuestion {
  type: 'mcq_single' | 'true_false';
  options: string[];
}

interface NumericQuestion extends BaseQuestion {
  type: 'numeric';
  unit_hint: string | null;
  input_kind: 'integer' | 'decimal';
}

interface MatchingQuestion extends BaseQuestion {
  type: 'matching';
  left_items: string[];
  right_items: string[];
}

interface OrderingQuestion extends BaseQuestion {
  type: 'ordering';
  items: string[];
}

type ClientQuestion =
  | McqSingleQuestion
  | NumericQuestion
  | MatchingQuestion
  | OrderingQuestion;

type AnswerValue =
  | { type: 'mcq_single' | 'true_false'; selected_index: number | null }
  | { type: 'numeric'; value: number | null }
  | { type: 'matching'; pairs: Array<[number, number]> }
  | { type: 'ordering'; order: number[] };

interface ChallengeDetailResponse {
  challenge: {
    id: string;
    title: string;
    description: string | null;
    challenge_type: 'quiz' | 'project';
    difficulty: string;
    domain: string | null;
    starts_at: string;
    ends_at: string;
    status: string;
    max_ranked_attempts: number;
    config: Record<string, unknown>;
  };
  attempts_used: number;
  my_submissions: Array<{
    id: string;
    attempt_no: number;
    status: string;
    auto_score: number | null;
    manual_score: number | null;
    final_score: number | null;
    created_at: string;
  }>;
}

// ─── Local extractor (kept loose so this page can render whatever the server
//     would also accept) ────────────────────────────────────────────────────

function extractClientQuestions(config: Record<string, unknown>): ClientQuestion[] {
  const raw = Array.isArray(config.questions)
    ? config.questions
    : Array.isArray(config.quiz_questions)
    ? (config.quiz_questions as unknown[])
    : [];
  const out: ClientQuestion[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const row = entry as Record<string, unknown>;
    const id =
      typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `q${index + 1}`;
    const prompt = typeof row.question === 'string' ? row.question.trim() : '';
    if (!prompt) return;
    const type = (typeof row.type === 'string' ? row.type : 'mcq_single') as QuestionType;
    const timeLimit =
      typeof row.time_limit_seconds === 'number' && row.time_limit_seconds > 0
        ? Math.floor(row.time_limit_seconds)
        : null;
    if (type === 'mcq_single' || type === 'true_false') {
      const options = Array.isArray(row.options)
        ? row.options.filter((o): o is string => typeof o === 'string')
        : [];
      if (options.length < 2) return;
      out.push({ id, type, prompt, time_limit_seconds: timeLimit, options });
      return;
    }
    if (type === 'numeric') {
      out.push({
        id,
        type,
        prompt,
        time_limit_seconds: timeLimit,
        unit_hint: typeof row.unit_hint === 'string' ? row.unit_hint : null,
        input_kind: row.input_kind === 'decimal' ? 'decimal' : 'integer',
      });
      return;
    }
    if (type === 'matching') {
      const left = Array.isArray(row.left_items)
        ? row.left_items.filter((o): o is string => typeof o === 'string')
        : [];
      const right = Array.isArray(row.right_items)
        ? row.right_items.filter((o): o is string => typeof o === 'string')
        : [];
      if (left.length === 0 || right.length === 0) return;
      out.push({ id, type, prompt, time_limit_seconds: timeLimit, left_items: left, right_items: right });
      return;
    }
    if (type === 'ordering') {
      const items = Array.isArray(row.items)
        ? row.items.filter((o): o is string => typeof o === 'string')
        : [];
      if (items.length < 2) return;
      out.push({ id, type, prompt, time_limit_seconds: timeLimit, items });
      return;
    }
  });
  return out;
}

function makeBlankAnswer(question: ClientQuestion): AnswerValue {
  switch (question.type) {
    case 'mcq_single':
    case 'true_false':
      return { type: question.type, selected_index: null };
    case 'numeric':
      return { type: 'numeric', value: null };
    case 'matching':
      return { type: 'matching', pairs: [] };
    case 'ordering':
      return { type: 'ordering', order: question.items.map((_, i) => i) };
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ChallengeDetailPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<ChallengeDetailResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [durations, setDurations] = useState<Record<string, number>>({});
  const questionStartRef = useRef<number>(Date.now());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Project mode state (preserved from V1)
  const [summaryText, setSummaryText] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [startedAt, setStartedAt] = useState<number>(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/skillup/challenges/${params.id}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load challenge');
      }
      setData(payload as ChallengeDetailResponse);
      setStartedAt(Date.now());
      questionStartRef.current = Date.now();
      setCurrentIndex(0);
      setAnswers({});
      setDurations({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load challenge');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const questions = useMemo(() => {
    if (!data?.challenge?.config) return [];
    return extractClientQuestions(data.challenge.config);
  }, [data?.challenge?.config]);

  const attemptsLeft = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.challenge.max_ranked_attempts - data.attempts_used);
  }, [data]);

  const current = questions[currentIndex];

  // Ensure a blank answer exists for the current question when first shown.
  useEffect(() => {
    if (!current) return;
    setAnswers((prev) => {
      if (prev[current.id]) return prev;
      return { ...prev, [current.id]: makeBlankAnswer(current) };
    });
  }, [current]);

  // Reset per-question timer when the question changes.
  useEffect(() => {
    if (!current) {
      setSecondsLeft(null);
      return;
    }
    questionStartRef.current = Date.now();
    if (current.time_limit_seconds === null) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(current.time_limit_seconds);
  }, [current]);

  // Tick the countdown each second; auto-advance on expiry.
  useEffect(() => {
    if (!current || current.time_limit_seconds === null) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - questionStartRef.current) / 1000;
      const remaining = Math.max(0, (current.time_limit_seconds as number) - elapsed);
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        advanceFromExpiry();
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function recordDuration() {
    if (!current) return;
    const elapsed = Math.max(0, (Date.now() - questionStartRef.current) / 1000);
    setDurations((prev) => ({ ...prev, [current.id]: elapsed }));
  }

  function advanceFromExpiry() {
    if (!current) return;
    setDurations((prev) => ({
      ...prev,
      [current.id]:
        current.time_limit_seconds !== null ? current.time_limit_seconds + 1 : 0,
    }));
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }

  function goNext() {
    recordDuration();
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }

  function goPrev() {
    recordDuration();
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }

  function updateAnswer(value: AnswerValue) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  async function submitQuiz() {
    if (!data) return;
    recordDuration();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const orderedAnswers = questions.map((q) => answers[q.id] ?? makeBlankAnswer(q));
      const orderedDurations = questions.map((q) => durations[q.id] ?? 0);
      const completionSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const response = await fetch(`/api/skillup/challenges/${params.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: orderedAnswers,
          question_durations: orderedDurations,
          completionSeconds,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Submission failed');
      }
      setSuccess(
        `Submission received. Score: ${payload?.score ?? payload?.submission?.final_score ?? '-'}`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSaving(false);
    }
  }

  async function submitProject() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/skillup/challenges/${params.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_submission: {
            summary_text: summaryText,
            github_url: githubUrl,
            file_url: fileUrl,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Submission failed');
      }
      setSuccess(payload?.message || 'Project submission received.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-60 bg-gray-800 rounded-xl animate-pulse" />;
  }

  if (!data) {
    return (
      <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-300">
        {error || 'Challenge not found'}
      </div>
    );
  }

  const challenge = data.challenge;
  const currentAnswer = current ? answers[current.id] : undefined;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/dashboard/talent/challenges"
          className="text-sm text-gray-400 hover:text-white"
        >
          Back to challenges
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">{challenge.title}</h1>
        <p className="text-sm text-gray-400 mt-1 capitalize">
          {challenge.challenge_type} | {challenge.difficulty}
          {challenge.domain ? ` | ${challenge.domain}` : ''}
        </p>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-2 text-sm text-gray-300">
        <p>{challenge.description || 'No challenge description provided.'}</p>
        <p>
          Window: {new Date(challenge.starts_at).toLocaleString()} -{' '}
          {new Date(challenge.ends_at).toLocaleString()}
        </p>
        <p>
          Attempts used: {data.attempts_used}/{challenge.max_ranked_attempts} (left: {attemptsLeft})
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-900/20 border border-green-700 rounded-xl p-4 text-sm text-green-300">
          {success}
        </div>
      )}

      {attemptsLeft > 0 ? (
        challenge.challenge_type === 'quiz' ? (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-5">
            {questions.length === 0 || !current ? (
              <p className="text-sm text-yellow-300">
                This quiz has no configured questions yet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    Question {currentIndex + 1} of {questions.length}
                  </p>
                  {secondsLeft !== null ? (
                    <p
                      className={
                        secondsLeft < 10
                          ? 'text-sm font-semibold text-rose-300'
                          : 'text-sm font-semibold text-amber-300'
                      }
                    >
                      Time left: {Math.ceil(secondsLeft)}s
                    </p>
                  ) : null}
                </div>

                <h2 className="text-white text-lg font-medium leading-snug">
                  {current.prompt}
                </h2>

                <QuestionRenderer
                  question={current}
                  answer={currentAnswer ?? makeBlankAnswer(current)}
                  onChange={updateAnswer}
                />

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={currentIndex === 0}
                    className="px-3 py-1.5 rounded-lg border border-gray-600 text-sm text-gray-300 hover:text-white disabled:opacity-40"
                  >
                    Previous
                  </button>
                  {currentIndex < questions.length - 1 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
                    >
                      Next question
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submitQuiz}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm"
                    >
                      {saving ? 'Submitting...' : 'Submit quiz'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4">
            <p className="text-sm text-gray-300">
              Required deliverables: summary text, GitHub URL, and file/project URL.
            </p>
            <textarea
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              placeholder="Project summary (what you built, why, impact)"
              rows={6}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white"
            />
            <input
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="GitHub URL"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white"
            />
            <input
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="File or project URL"
              className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-white"
            />
            <button
              onClick={submitProject}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
            >
              {saving ? 'Submitting...' : 'Submit Project'}
            </button>
          </div>
        )
      ) : (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded-xl p-4 text-sm text-yellow-300">
          You have reached the attempt limit for this challenge.
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
        <h2 className="text-white font-semibold mb-3">My Submission History</h2>
        {data.my_submissions.length === 0 ? (
          <p className="text-sm text-gray-400">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {data.my_submissions.map((submission) => (
              <div
                key={submission.id}
                className="flex items-center justify-between rounded-lg border border-gray-700 px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-gray-100">Attempt {submission.attempt_no}</p>
                  <p className="text-gray-500">
                    {new Date(submission.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-gray-200 capitalize">{submission.status}</p>
                  <p className="text-blue-300">
                    Score: {submission.final_score ?? submission.auto_score ?? '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Per-type renderer ──────────────────────────────────────────────────────

function QuestionRenderer({
  question,
  answer,
  onChange,
}: {
  question: ClientQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  switch (question.type) {
    case 'mcq_single':
    case 'true_false':
      return <McqRenderer question={question} answer={answer} onChange={onChange} />;
    case 'numeric':
      return <NumericRenderer question={question} answer={answer} onChange={onChange} />;
    case 'matching':
      return <MatchingRenderer question={question} answer={answer} onChange={onChange} />;
    case 'ordering':
      return <OrderingRenderer question={question} answer={answer} onChange={onChange} />;
  }
}

function McqRenderer({
  question,
  answer,
  onChange,
}: {
  question: McqSingleQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const selected =
    answer.type === question.type && 'selected_index' in answer
      ? answer.selected_index
      : null;
  return (
    <div className="space-y-2">
      {question.options.map((option, index) => {
        const isSelected = selected === index;
        return (
          <button
            key={`${question.id}-opt-${index}`}
            type="button"
            onClick={() => onChange({ type: question.type, selected_index: index })}
            className={
              isSelected
                ? 'w-full text-left rounded-lg border border-blue-500 bg-blue-500/15 px-4 py-3 text-sm text-white'
                : 'w-full text-left rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 hover:border-blue-500/40'
            }
          >
            <span className="mr-2 font-semibold">{String.fromCharCode(65 + index)}.</span>
            {option}
          </button>
        );
      })}
    </div>
  );
}

function NumericRenderer({
  question,
  answer,
  onChange,
}: {
  question: NumericQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const value =
    answer.type === 'numeric' && answer.value !== null ? String(answer.value) : '';
  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        inputMode={question.input_kind === 'decimal' ? 'decimal' : 'numeric'}
        step={question.input_kind === 'decimal' ? '0.01' : '1'}
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = raw === '' ? null : Number(raw);
          onChange({
            type: 'numeric',
            value: parsed !== null && Number.isFinite(parsed) ? parsed : null,
          });
        }}
        placeholder={question.unit_hint ? `Value in ${question.unit_hint}` : 'Numeric value'}
        className="w-48 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-white"
      />
      {question.unit_hint ? (
        <span className="text-sm text-gray-400">{question.unit_hint}</span>
      ) : null}
    </div>
  );
}

function MatchingRenderer({
  question,
  answer,
  onChange,
}: {
  question: MatchingQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const pairs = answer.type === 'matching' ? answer.pairs : [];
  const [activeLeft, setActiveLeft] = useState<number | null>(null);

  const leftToRight = new Map<number, number>();
  for (const [l, r] of pairs) leftToRight.set(l, r);

  function pickRight(rightIndex: number) {
    if (activeLeft === null) return;
    const nextPairs = pairs.filter(([l]) => l !== activeLeft);
    nextPairs.push([activeLeft, rightIndex]);
    onChange({ type: 'matching', pairs: nextPairs });
    setActiveLeft(null);
  }

  function clearLeft(leftIndex: number) {
    const nextPairs = pairs.filter(([l]) => l !== leftIndex);
    onChange({ type: 'matching', pairs: nextPairs });
    setActiveLeft(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        Tap a left item, then tap the right item it matches. Tap a paired item to clear it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          {question.left_items.map((item, index) => {
            const pairedRight = leftToRight.get(index);
            const isActive = activeLeft === index;
            return (
              <button
                key={`${question.id}-left-${index}`}
                type="button"
                onClick={() => {
                  if (pairedRight !== undefined) {
                    clearLeft(index);
                  } else {
                    setActiveLeft(index);
                  }
                }}
                className={
                  isActive
                    ? 'w-full text-left rounded-lg border-2 border-blue-500 bg-blue-500/20 px-3 py-2 text-sm text-white'
                    : pairedRight !== undefined
                    ? 'w-full text-left rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100'
                    : 'w-full text-left rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:border-blue-500/40'
                }
              >
                <span className="mr-2 font-semibold">{index + 1}.</span>
                {item}
                {pairedRight !== undefined ? (
                  <span className="ml-2 text-xs text-emerald-300">
                    ↔ {String.fromCharCode(65 + pairedRight)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {question.right_items.map((item, index) => {
            const claimed = pairs.some(([, r]) => r === index);
            return (
              <button
                key={`${question.id}-right-${index}`}
                type="button"
                disabled={activeLeft === null || claimed}
                onClick={() => pickRight(index)}
                className={
                  claimed
                    ? 'w-full text-left rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-500'
                    : activeLeft !== null
                    ? 'w-full text-left rounded-lg border border-blue-500/40 bg-blue-500/5 px-3 py-2 text-sm text-blue-100 hover:bg-blue-500/15'
                    : 'w-full text-left rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-400'
                }
              >
                <span className="mr-2 font-semibold">{String.fromCharCode(65 + index)}.</span>
                {item}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrderingRenderer({
  question,
  answer,
  onChange,
}: {
  question: OrderingQuestion;
  answer: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const order =
    answer.type === 'ordering' && Array.isArray(answer.order)
      ? answer.order
      : question.items.map((_, i) => i);

  function move(position: number, delta: number) {
    const next = [...order];
    const target = position + delta;
    if (target < 0 || target >= next.length) return;
    [next[position], next[target]] = [next[target], next[position]];
    onChange({ type: 'ordering', order: next });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        Use the up/down buttons to put the items into the correct order, top to bottom.
      </p>
      <ol className="space-y-2">
        {order.map((itemIndex, position) => (
          <li
            key={`${question.id}-order-${position}-${itemIndex}`}
            className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
          >
            <span className="text-xs font-semibold text-gray-400 w-6">{position + 1}.</span>
            <span className="flex-1 text-sm text-gray-100">{question.items[itemIndex]}</span>
            <button
              type="button"
              onClick={() => move(position, -1)}
              disabled={position === 0}
              className="px-2 py-1 text-xs rounded border border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(position, 1)}
              disabled={position === order.length - 1}
              className="px-2 py-1 text-xs rounded border border-gray-600 text-gray-200 hover:bg-gray-700 disabled:opacity-40"
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
