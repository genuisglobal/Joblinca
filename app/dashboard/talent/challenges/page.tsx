'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface ChallengeSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  challenge_type: 'quiz' | 'project';
  domain: string | null;
  difficulty: string;
  starts_at: string;
  ends_at: string;
  max_ranked_attempts: number;
  top_n: number;
  attempts_used: number;
  latest_submission: {
    status: string;
    final_score: number | null;
  } | null;
}

function statusBadge(challenge: ChallengeSummary): string {
  if (challenge.latest_submission?.status === 'graded') {
    return 'bg-green-600/20 text-green-300 border-green-500/30';
  }
  if (challenge.latest_submission?.status === 'submitted') {
    return 'bg-yellow-600/20 text-yellow-300 border-yellow-500/30';
  }
  return 'bg-gray-700/40 text-gray-300 border-gray-600/40';
}

export default function TalentChallengesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);

  useEffect(() => {
    let mounted = true;
    fetch('/api/skillup/challenges?status=active&limit=50')
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load challenges');
        }
        return Array.isArray(payload) ? (payload as ChallengeSummary[]) : [];
      })
      .then((rows) => {
        if (mounted) setChallenges(rows);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const challengeCountLabel = useMemo(() => {
    if (challenges.length === 1) return '1 active challenge';
    return `${challenges.length} active challenges`;
  }, [challenges.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Talent Challenges</h1>
          <p className="text-sm text-gray-400 mt-1">
            Weekly quizzes and project tasks. Top 10 performers are featured.
          </p>
        </div>
        <Link
          href="/dashboard/talent/leaderboard"
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm"
        >
          View Leaderboard
        </Link>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 text-sm text-gray-300">
        <p>
          Scoring model: quizzes are auto-graded, project challenges use manual + AI
          blended scoring.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      ) : challenges.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-10 border border-gray-700 text-center">
          <p className="text-gray-300">No active challenges right now.</p>
          <p className="text-gray-500 text-sm mt-1">Check back this week for new drops.</p>
        </div>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-gray-500">{challengeCountLabel}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {challenges.map((challenge) => {
              const attemptsLeft = Math.max(
                0,
                challenge.max_ranked_attempts - challenge.attempts_used
              );

              return (
                <div
                  key={challenge.id}
                  className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{challenge.title}</h2>
                      <p className="text-xs text-gray-400 mt-1 capitalize">
                        {challenge.challenge_type} | {challenge.difficulty}
                        {challenge.domain ? ` | ${challenge.domain}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full border ${statusBadge(challenge)}`}
                    >
                      {challenge.latest_submission?.status || 'not started'}
                    </span>
                  </div>

                  <p className="text-sm text-gray-300 line-clamp-3">
                    {challenge.description || 'No description provided.'}
                  </p>

                  <div className="text-xs text-gray-400 space-y-1">
                    <p>
                      Window: {new Date(challenge.starts_at).toLocaleDateString()} -{' '}
                      {new Date(challenge.ends_at).toLocaleDateString()}
                    </p>
                    <p>
                      Attempts: {challenge.attempts_used}/{challenge.max_ranked_attempts} used
                      ({attemptsLeft} left)
                    </p>
                    <p>Top ranking cutoff: Top {challenge.top_n}</p>
                  </div>

                  <Link
                    href={`/dashboard/talent/challenges/${challenge.id}`}
                    className="mt-auto inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-medium"
                  >
                    Open Challenge
                  </Link>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
