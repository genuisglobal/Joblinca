'use client';

import { useState } from 'react';

interface DuplicateGroup {
  canonical: {
    id: string;
    title: string;
    company_name: string | null;
    created_at: string;
    origin_type: string | null;
  };
  duplicates: Array<{
    id: string;
    title: string;
    company_name: string | null;
    created_at: string;
    origin_type: string | null;
    similarity: number;
  }>;
}

interface DedupResult {
  groups: DuplicateGroup[];
  stats: {
    duplicate_groups: number;
    total_duplicates: number;
  };
}

export default function DedupPanel() {
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<DedupResult | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function scan() {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/aggregation/dedup');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setResult(data);
      if (data.stats.total_duplicates === 0) {
        setMessage('No duplicates found.');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function autoClean() {
    if (!confirm('This will hide all detected duplicate jobs (keeping the original). Continue?')) return;
    setCleaning(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/aggregation/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_clean' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clean failed');
      setMessage(`Cleaned ${data.hidden} duplicate job(s).`);
      setResult(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setCleaning(false);
    }
  }

  async function hideSingle(jobId: string) {
    try {
      const res = await fetch('/api/admin/aggregation/dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide', jobIds: [jobId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Hide failed');
      // Remove from UI
      if (result) {
        const updated = {
          ...result,
          groups: result.groups
            .map((g) => ({
              ...g,
              duplicates: g.duplicates.filter((d) => d.id !== jobId),
            }))
            .filter((g) => g.duplicates.length > 0),
        };
        updated.stats.total_duplicates--;
        updated.stats.duplicate_groups = updated.groups.length;
        setResult(updated);
      }
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/80 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Duplicate Detection</h3>
          <p className="text-sm text-gray-400">
            Scan published jobs for duplicates from different sources.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scan}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm"
          >
            {loading ? 'Scanning...' : 'Scan for Duplicates'}
          </button>
          {result && result.stats.total_duplicates > 0 && (
            <button
              onClick={autoClean}
              disabled={cleaning}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
            >
              {cleaning ? 'Cleaning...' : `Auto-Clean ${result.stats.total_duplicates} Duplicates`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-700 bg-red-900/20 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-lg border border-green-700 bg-green-900/20 p-3 text-green-200 text-sm">
          {message}
        </div>
      )}

      {result && result.groups.length > 0 && (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {result.groups.map((group, idx) => (
            <div key={idx} className="rounded-lg border border-gray-600 bg-gray-900/50 p-4">
              <div className="mb-3">
                <span className="text-xs text-green-400 font-medium">KEEP</span>
                <p className="text-white font-medium">{group.canonical.title}</p>
                <p className="text-sm text-gray-400">
                  {group.canonical.company_name || 'No company'} &middot;{' '}
                  {group.canonical.origin_type || 'native'}
                </p>
              </div>
              <div className="space-y-2">
                {group.duplicates.map((dup) => (
                  <div key={dup.id} className="flex items-center justify-between rounded-lg bg-gray-800 p-3">
                    <div>
                      <span className="text-xs text-red-400 font-medium">
                        DUPLICATE ({dup.similarity}% match)
                      </span>
                      <p className="text-gray-300 text-sm">{dup.title}</p>
                      <p className="text-xs text-gray-500">
                        {dup.company_name || 'No company'} &middot; {dup.origin_type || 'native'}
                      </p>
                    </div>
                    <button
                      onClick={() => hideSingle(dup.id)}
                      className="px-3 py-1 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-xs whitespace-nowrap"
                    >
                      Hide
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
