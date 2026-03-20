'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PublishButton({ jobId, title }: { jobId: string; title: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handlePublish() {
    if (!confirm(`Publish "${title}" to the public jobs listing?`)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/aggregation/publish-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveredJobId: jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Publish failed');
        return;
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <span className="text-xs text-green-400 font-medium">Published</span>
    );
  }

  return (
    <button
      onClick={handlePublish}
      disabled={loading}
      className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded transition-colors"
    >
      {loading ? '...' : 'Publish'}
    </button>
  );
}

export function BulkPublishButton({ jobIds }: { jobIds: string[] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ published: number; errors: number } | null>(null);
  const router = useRouter();

  async function handleBulkPublish() {
    if (!confirm(`Publish ${jobIds.length} jobs to the public listing?`)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/aggregation/publish-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveredJobIds: jobIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Bulk publish failed');
        return;
      }
      setResult({ published: data.published, errors: data.errors });
      router.refresh();
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <span className="text-sm text-green-400">
        {result.published} published, {result.errors} errors
      </span>
    );
  }

  return (
    <button
      onClick={handleBulkPublish}
      disabled={loading || jobIds.length === 0}
      className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
    >
      {loading ? 'Publishing...' : `Publish All (${jobIds.length})`}
    </button>
  );
}

export function HideButton({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  async function handleHide() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/aggregation/hide-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discoveredJobId: jobId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Hide failed');
        return;
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <span className="text-xs text-gray-500">Hidden</span>;
  }

  return (
    <button
      onClick={handleHide}
      disabled={loading}
      className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white rounded transition-colors"
    >
      {loading ? '...' : 'Hide'}
    </button>
  );
}
