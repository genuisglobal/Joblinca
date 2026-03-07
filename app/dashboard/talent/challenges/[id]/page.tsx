'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ChallengeQuestion {
  question: string;
  options: string[];
  correct_index?: number;
}

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

function extractQuestions(config: Record<string, unknown>): ChallengeQuestion[] {
  const direct = config.questions;
  const quiz = (config.quiz as Record<string, unknown> | undefined)?.questions;
  const legacy = config.quiz_questions;
  const source = Array.isArray(direct)
    ? direct
    : Array.isArray(quiz)
      ? quiz
      : Array.isArray(legacy)
        ? legacy
        : [];

  const questions: ChallengeQuestion[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    const options = Array.isArray(row.options)
      ? row.options.filter((opt): opt is string => typeof opt === 'string')
      : [];
    if (!question || options.length === 0) continue;

    questions.push({
      question,
      options,
      correct_index:
        typeof row.correct_index === 'number' ? row.correct_index : undefined,
    });
  }
  return questions;
}

export default function ChallengeDetailPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [data, setData] = useState<ChallengeDetailResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
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
    return extractQuestions(data.challenge.config);
  }, [data?.challenge?.config]);

  const attemptsLeft = useMemo(() => {
    if (!data) return 0;
    return Math.max(0, data.challenge.max_ranked_attempts - data.attempts_used);
  }, [data]);

  async function submitQuiz() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const orderedAnswers = questions.map((_, index) =>
        Number.isFinite(answers[index]) ? answers[index] : -1
      );
      const completionSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const response = await fetch(`/api/skillup/challenges/${params.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: orderedAnswers,
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
          Attempts used: {data.attempts_used}/{challenge.max_ranked_attempts} (left: {attemptsLeft}
          )
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
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-6">
            {questions.length === 0 ? (
              <p className="text-sm text-yellow-300">
                This quiz has no configured questions yet.
              </p>
            ) : (
              questions.map((question, index) => (
                <div key={index} className="space-y-3">
                  <p className="text-white font-medium">
                    {index + 1}. {question.question}
                  </p>
                  <div className="space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <label
                        key={optionIndex}
                        className="flex items-center gap-3 p-3 rounded-lg border border-gray-700 hover:border-blue-500 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name={`q-${index}`}
                          value={optionIndex}
                          checked={answers[index] === optionIndex}
                          onChange={() =>
                            setAnswers((prev) => ({ ...prev, [index]: optionIndex }))
                          }
                        />
                        <span className="text-sm text-gray-200">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
            <button
              onClick={submitQuiz}
              disabled={saving || questions.length === 0}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
            >
              {saving ? 'Submitting...' : 'Submit Quiz'}
            </button>
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
