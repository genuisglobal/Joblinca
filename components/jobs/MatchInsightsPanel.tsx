'use client';

import { useEffect, useState } from 'react';
import MatchScoreExplanation from '@/components/jobs/MatchScoreExplanation';

type DispatchStatus = 'pending' | 'sent' | 'failed' | 'skipped';

interface ChannelInsight {
  status: DispatchStatus;
  sentAt: string | null;
  error: string | null;
  trigger: string | null;
}

interface MatchInsight {
  userId: string;
  name: string;
  role: string | null;
  score: number;
  reason: string | null;
  reasonSignals: string[];
  lastAttemptAt: string;
  channels: {
    whatsapp: ChannelInsight | null;
    email: ChannelInsight | null;
  };
}

interface MatchInsightsResponse {
  jobId: string;
  totals: {
    channelDispatches: number;
    sent: number;
    skipped: number;
    failed: number;
    pending: number;
    matchedUsers: number;
    returnedUsers: number;
  };
  matches: MatchInsight[];
}

const STATUS_STYLE: Record<DispatchStatus, string> = {
  sent: 'text-green-400',
  skipped: 'text-yellow-300',
  failed: 'text-red-400',
  pending: 'text-gray-300',
};

function formatStatus(status: DispatchStatus | null): string {
  if (!status) return 'n/a';
  if (status === 'sent') return 'sent';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed') return 'failed';
  return 'pending';
}

function formatRole(role: string | null): string {
  if (!role) return 'unknown';
  if (role === 'job_seeker') return 'job seeker';
  return role.replace(/_/g, ' ');
}

export default function MatchInsightsPanel({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchInsightsResponse | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInsights() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/jobs/${jobId}/match-insights`, {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load match insights');
        }

        if (!isMounted) return;
        setData(payload as MatchInsightsResponse);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load match insights');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadInsights();
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">AI Match Insights</h2>
        <button
          type="button"
          onClick={() => {
            setData(null);
            setError(null);
            setLoading(true);
            fetch(`/api/jobs/${jobId}/match-insights`, { cache: 'no-store' })
              .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) {
                  throw new Error(payload?.error || 'Failed to refresh match insights');
                }
                setData(payload as MatchInsightsResponse);
              })
              .catch((refreshError) => {
                setError(
                  refreshError instanceof Error
                    ? refreshError.message
                    : 'Failed to refresh match insights'
                );
              })
              .finally(() => {
                setLoading(false);
              });
          }}
          className="px-3 py-1 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading && (
        <div className="py-8 text-center">
          <p className="text-gray-400 text-sm">Loading match insights...</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-5">
            <StatItem label="Matched users" value={String(data.totals.matchedUsers)} />
            <StatItem label="Channels sent" value={String(data.totals.sent)} />
            <StatItem label="Skipped" value={String(data.totals.skipped)} />
            <StatItem label="Failed" value={String(data.totals.failed)} />
            <StatItem label="Pending" value={String(data.totals.pending)} />
            <StatItem label="Dispatch rows" value={String(data.totals.channelDispatches)} />
          </div>

          {data.matches.length === 0 ? (
            <p className="text-sm text-gray-400">No match dispatch records yet for this job.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 pr-3 text-gray-400 font-medium">Candidate</th>
                    <th className="text-left py-2 pr-3 text-gray-400 font-medium">Score</th>
                    <th className="text-left py-2 pr-3 text-gray-400 font-medium">Match reason</th>
                    <th className="text-left py-2 pr-3 text-gray-400 font-medium">WhatsApp</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {data.matches.map((match) => (
                    <tr key={match.userId} className="border-b border-gray-700/50 align-top">
                      <td className="py-3 pr-3">
                        <p className="text-white">{match.name}</p>
                        <p className="text-xs text-gray-400">{formatRole(match.role)}</p>
                      </td>
                      <td className="py-3 pr-3 text-gray-200">
                        <p>{match.score}/100</p>
                        <div className="mt-2">
                          <MatchScoreExplanation
                            score={match.score}
                            reason={match.reason}
                            reasonSignals={match.reasonSignals}
                            compact
                          />
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-gray-300 max-w-xs">
                        <p>{match.reason || 'No reason logged'}</p>
                        <div className="mt-2">
                          <MatchScoreExplanation
                            score={match.score}
                            reason={match.reason}
                            reasonSignals={match.reasonSignals}
                          />
                        </div>
                      </td>
                      <td className="py-3 pr-3">
                        <ChannelCell channel={match.channels.whatsapp} />
                      </td>
                      <td className="py-3">
                        <ChannelCell channel={match.channels.email} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-white font-semibold">{value}</p>
    </div>
  );
}

function ChannelCell({ channel }: { channel: ChannelInsight | null }) {
  if (!channel) {
    return <p className="text-xs text-gray-500">n/a</p>;
  }

  const status = formatStatus(channel.status);
  return (
    <div>
      <p className={`text-xs uppercase ${STATUS_STYLE[channel.status]}`}>{status}</p>
      {channel.error && (
        <p className="text-xs text-red-300 mt-1 max-w-xs break-words">{channel.error}</p>
      )}
      {channel.sentAt && (
        <p className="text-xs text-gray-500 mt-1">
          {new Date(channel.sentAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
