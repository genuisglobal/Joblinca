'use client';

import { useEffect, useMemo, useState } from 'react';

interface LeaderboardRow {
  id: string;
  challenge_id: string;
  rank: number;
  score: number;
  user_id: string;
  talent_challenges?: {
    id: string;
    title: string;
    challenge_type: string;
    domain: string | null;
  } | null;
  profiles?: {
    id: string;
    full_name: string | null;
  } | null;
}

interface LeaderboardResponse {
  week: { weekKey: string; weekStartDate: string; weekEndDate: string };
  rows: LeaderboardRow[];
}

export default function TalentLeaderboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState('');
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  async function load(requestedWeek = '') {
    setLoading(true);
    setError(null);
    try {
      const query = requestedWeek ? `?week=${encodeURIComponent(requestedWeek)}` : '';
      const response = await fetch(`/api/skillup/leaderboard${query}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load leaderboard');
      }
      setData(payload as LeaderboardResponse);
      if (!requestedWeek && payload?.week?.weekKey) {
        setWeek(payload.week.weekKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    if (!data?.rows) return [];
    const byChallenge = new Map<string, LeaderboardRow[]>();
    for (const row of data.rows) {
      const bucket = byChallenge.get(row.challenge_id) || [];
      bucket.push(row);
      byChallenge.set(row.challenge_id, bucket);
    }
    return Array.from(byChallenge.entries()).map(([challengeId, rows]) => ({
      challengeId,
      challenge: rows[0]?.talent_challenges || null,
      rows: rows.sort((a, b) => a.rank - b.rank),
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Weekly Leaderboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            Top 10 performers for each challenge window (Monday-Sunday, GMT+1).
          </p>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load(week.trim());
          }}
        >
          <input
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            placeholder="YYYY-Www"
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm text-white"
          >
            Load
          </button>
        </form>
      </div>

      {loading ? (
        <div className="h-48 bg-gray-800 rounded-xl animate-pulse" />
      ) : error ? (
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 text-center text-gray-300">
          No leaderboard snapshot available for this week yet.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section
              key={group.challengeId}
              className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">
                  {group.challenge?.title || 'Challenge'}
                </h2>
                <p className="text-xs text-gray-400 mt-1 capitalize">
                  {group.challenge?.challenge_type || 'challenge'}
                  {group.challenge?.domain ? ` | ${group.challenge.domain}` : ''}
                </p>
              </div>
              <div className="divide-y divide-gray-700">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="px-5 py-3 flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold ${
                          row.rank === 1
                            ? 'bg-yellow-600 text-black'
                            : row.rank === 2
                              ? 'bg-gray-300 text-black'
                              : row.rank === 3
                                ? 'bg-amber-600 text-black'
                                : 'bg-gray-700 text-gray-200'
                        }`}
                      >
                        {row.rank}
                      </span>
                      <span className="text-gray-200">
                        {row.profiles?.full_name || 'Anonymous Talent'}
                      </span>
                    </div>
                    <span className="text-blue-300 font-medium">{row.score}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
