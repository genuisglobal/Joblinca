'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AddCareerPageForm() {
  const [companyName, setCompanyName] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/aggregation/career-pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, url, notes: notes || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to add page');
        return;
      }
      setCompanyName('');
      setUrl('');
      setNotes('');
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-700 bg-gray-800/80 p-4 space-y-3">
      <p className="text-sm font-medium text-white">Add a career page</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company (e.g. MTN Cameroon)"
          required
          className="px-3 py-2 bg-gray-900 text-gray-100 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://company.com/careers"
          required
          className="px-3 py-2 bg-gray-900 text-gray-100 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="px-3 py-2 bg-gray-900 text-gray-100 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
      >
        {loading ? 'Adding...' : 'Add page'}
      </button>
    </form>
  );
}

export function CareerPageRowActions({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/aggregation/career-pages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled: !enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Update failed');
        return;
      }
      router.refresh();
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/aggregation/career-pages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Delete failed');
        return;
      }
      router.refresh();
    } catch (err) {
      alert(String(err));
    } finally {
      setLoading(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
          enabled
            ? 'bg-yellow-600/20 text-yellow-300 border border-yellow-600/40 hover:bg-yellow-600/30'
            : 'bg-green-600/20 text-green-300 border border-green-600/40 hover:bg-green-600/30'
        }`}
      >
        {enabled ? 'Disable' : 'Enable'}
      </button>
      <button
        onClick={handleDelete}
        disabled={loading}
        className={`px-2 py-1 text-xs rounded transition-colors disabled:opacity-50 ${
          confirmingDelete
            ? 'bg-red-600 text-white hover:bg-red-700'
            : 'bg-red-600/20 text-red-300 border border-red-600/40 hover:bg-red-600/30'
        }`}
      >
        {confirmingDelete ? 'Confirm?' : 'Delete'}
      </button>
    </div>
  );
}
