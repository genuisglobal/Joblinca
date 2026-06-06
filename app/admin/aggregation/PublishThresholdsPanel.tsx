'use client';

import { useEffect, useState } from 'react';

interface Thresholds {
  trustMin: number;
  scamMax: number;
}

interface MaintenanceResult {
  auto_publish?: {
    eligible: number;
    published: number;
    skipped_duplicate: number;
    errors: number;
  };
  error?: string;
}

export default function PublishThresholdsPanel() {
  const [trustMin, setTrustMin] = useState(60);
  const [scamMax, setScamMax] = useState(30);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/aggregation/publish-thresholds');
        if (res.ok) {
          const data = (await res.json()) as Thresholds;
          setTrustMin(data.trustMin);
          setScamMax(data.scamMax);
        }
      } catch {
        // keep defaults
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/aggregation/publish-thresholds', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trustMin, scamMax }),
      });
      const data = (await res.json()) as Thresholds & { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTrustMin(data.trustMin);
      setScamMax(data.scamMax);
      setMessage(`Saved. New jobs auto-publish when trust ≥ ${data.trustMin} and scam < ${data.scamMax}.`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function reEvaluate() {
    setRerunning(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/admin/aggregation/pipeline-maintenance', {
        method: 'POST',
      });
      const data = (await res.json()) as MaintenanceResult;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const pub = data.auto_publish;
      setMessage(
        pub
          ? `Re-evaluated pending jobs: ${pub.published} published, ${pub.skipped_duplicate} skipped as duplicates${pub.errors ? `, ${pub.errors} errors` : ''}.`
          : 'Re-evaluation complete.',
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setRerunning(false);
    }
  }

  const busy = saving || rerunning;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Auto-Publish Thresholds</h2>
        <p className="text-sm text-gray-400">
          Scraped jobs are posted automatically when their trust score is at or above the
          minimum and their scam score is below the maximum. Anything outside the gate stays
          in the review queue.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-300">Minimum trust to publish</label>
            <span className="text-sm font-semibold text-green-300">{trustMin}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={trustMin}
            disabled={!loaded || busy}
            onChange={(e) => setTrustMin(Number(e.target.value))}
            className="w-full accent-green-500"
          />
          <p className="text-xs text-gray-500 mt-1">Higher = stricter, fewer jobs auto-posted.</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-300">Maximum scam score allowed</label>
            <span className="text-sm font-semibold text-red-300">{scamMax}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={scamMax}
            disabled={!loaded || busy}
            onChange={(e) => setScamMax(Number(e.target.value))}
            className="w-full accent-red-500"
          />
          <p className="text-xs text-gray-500 mt-1">Lower = stricter, jobs above this are held back.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={save}
          disabled={!loaded || busy}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
        >
          {saving ? 'Saving…' : 'Save Thresholds'}
        </button>
        <button
          onClick={reEvaluate}
          disabled={!loaded || busy}
          className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
          title="Re-check already-discovered jobs against the current thresholds and publish any that now qualify"
        >
          {rerunning ? 'Re-evaluating…' : 'Re-evaluate Pending Jobs Now'}
        </button>
      </div>

      {message && (
        <div className="mt-3 rounded-lg border border-green-700 bg-green-900/20 p-3 text-sm text-green-300">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-700 bg-red-900/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
