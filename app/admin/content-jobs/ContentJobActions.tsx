'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ContentStatus = 'not_started' | 'in_progress' | 'created' | 'skipped';

const actions: Array<{ status: ContentStatus; label: string; className: string }> = [
  {
    status: 'created',
    label: 'Mark Created',
    className: 'bg-green-600 hover:bg-green-700 text-white',
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    className: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  {
    status: 'skipped',
    label: 'Skip',
    className: 'bg-gray-600 hover:bg-gray-500 text-white',
  },
  {
    status: 'not_started',
    label: 'Reset',
    className: 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600',
  },
];

export default function ContentJobActions({
  jobId,
  currentStatus,
}: {
  jobId: string;
  currentStatus: ContentStatus;
}) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<ContentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(status: ContentStatus) {
    setLoadingStatus(status);
    setError(null);

    try {
      const res = await fetch('/api/admin/jobs/content-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, status }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update content status');
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update content status');
    } finally {
      setLoadingStatus(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {actions
          .filter((action) => action.status !== currentStatus)
          .map((action) => (
            <button
              key={action.status}
              type="button"
              onClick={() => updateStatus(action.status)}
              disabled={loadingStatus !== null}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${action.className}`}
            >
              {loadingStatus === action.status ? '...' : action.label}
            </button>
          ))}
      </div>
      {error && <p className="text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}
