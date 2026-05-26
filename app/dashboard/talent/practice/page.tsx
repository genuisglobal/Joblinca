'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface PracticeQuestion {
  challenge_id: string;
  challenge_title: string;
  domain: string | null;
  question_id: string;
  prompt: string;
  options: string[];
}

interface PracticeAnswerResult {
  was_correct: boolean;
  correct_index: number;
  explanation: string | null;
  interval_days: number;
  next_due_at: string;
  consecutive_correct: number;
}

const DOMAIN_OPTIONS = [
  { value: '', label: 'Any domain' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'admin_assistant', label: 'Admin Assistant' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'customer_service', label: 'Customer Service' },
  { value: 'field_officer', label: 'Field Officer' },
];

export default function TalentPracticePage() {
  const [domain, setDomain] = useState('');
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<PracticeAnswerResult | null>(null);

  const fetchNext = useCallback(async (domainValue: string) => {
    setLoading(true);
    setError(null);
    setSelectedAnswer(null);
    setAnswerResult(null);
    try {
      const url = domainValue
        ? `/api/skillup/practice/next?domain=${encodeURIComponent(domainValue)}`
        : '/api/skillup/practice/next';
      const response = await fetch(url, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load practice question');
      }
      setQuestion((payload?.question as PracticeQuestion) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNext(domain);
  }, [fetchNext, domain]);

  async function submitAnswer() {
    if (!question || selectedAnswer === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/skillup/practice/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: question.challenge_id,
          question_id: question.question_id,
          answer_index: selectedAnswer,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to submit answer');
      }
      setAnswerResult(payload as PracticeAnswerResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Practice</h1>
          <p className="mt-1 text-sm text-gray-400">
            Unranked, no leaderboard. Questions you miss come back sooner; questions you
            get right keep coming back at growing intervals.
          </p>
        </div>
        <Link
          href="/dashboard/talent/challenges"
          className="rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:text-white"
        >
          Back to Challenges
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-wide text-gray-500">Domain:</label>
        <select
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          {DOMAIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-700 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-10 text-center text-sm text-gray-300">
          Loading...
        </div>
      ) : !question ? (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-10 text-center">
          <p className="text-gray-300">No practice questions available yet.</p>
          <p className="text-gray-500 text-sm mt-1">
            Try a different domain, or complete a quiz challenge to seed your practice queue.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {question.challenge_title}
                {question.domain ? ` - ${question.domain}` : ''}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-white">{question.prompt}</h2>
            </div>
          </div>

          <div className="space-y-2">
            {question.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isCorrect = answerResult && answerResult.correct_index === index;
              const isWrongSelection =
                answerResult && isSelected && !answerResult.was_correct;
              let buttonClass = 'w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors ';
              if (answerResult) {
                if (isCorrect) {
                  buttonClass += 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100';
                } else if (isWrongSelection) {
                  buttonClass += 'border-rose-500/50 bg-rose-500/15 text-rose-100';
                } else {
                  buttonClass += 'border-gray-700 bg-gray-800 text-gray-400';
                }
              } else {
                buttonClass += isSelected
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-200 hover:border-blue-500/40';
              }
              return (
                <button
                  key={`${question.question_id}-opt-${index}`}
                  type="button"
                  onClick={() => {
                    if (!answerResult) setSelectedAnswer(index);
                  }}
                  disabled={Boolean(answerResult)}
                  className={buttonClass}
                >
                  <span className="mr-2 font-semibold">{String.fromCharCode(65 + index)}.</span>
                  {option}
                </button>
              );
            })}
          </div>

          {answerResult ? (
            <div
              className={
                answerResult.was_correct
                  ? 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100'
                  : 'rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100'
              }
            >
              <p className="font-semibold">
                {answerResult.was_correct ? 'Correct.' : 'Not quite.'}
              </p>
              {answerResult.explanation ? (
                <p className="mt-1 text-xs opacity-90">{answerResult.explanation}</p>
              ) : null}
              <p className="mt-2 text-xs opacity-80">
                Streak: {answerResult.consecutive_correct} | Next due in{' '}
                {answerResult.interval_days} day{answerResult.interval_days === 1 ? '' : 's'}.
              </p>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            {answerResult ? (
              <button
                type="button"
                onClick={() => void fetchNext(domain)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Next question
              </button>
            ) : (
              <button
                type="button"
                onClick={submitAnswer}
                disabled={selectedAnswer === null || submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Check answer'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
