'use client';

import { useState } from 'react';

type OutreachLead = {
  id?: string;
  status?: string;
  channel?: string;
  notes?: string;
  last_contact_at?: string;
  seeker_count?: number;
} | null;

export function LogOutreachButton({
  jobId,
  outreach,
}: {
  jobId: string;
  outreach: OutreachLead;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<string>(outreach?.channel || 'email');
  const [notes, setNotes] = useState(outreach?.notes || '');
  const [seekerCount, setSeekerCount] = useState(outreach?.seeker_count || 0);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(status: string) {
    setLoading(true);
    try {
      await fetch('/api/admin/aggregation/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discovered_job_id: jobId,
          channel,
          notes,
          status,
          seeker_count: seekerCount,
        }),
      });
      setOpen(false);
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
      >
        {outreach ? 'Update' : 'Log Outreach'}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-white mb-4">
          {outreach ? 'Update Outreach' : 'Log Recruiter Outreach'}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Channel</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="manual">Manual / In-person</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Seekers to recommend
            </label>
            <input
              type="number"
              min={0}
              value={seekerCount}
              onChange={(e) => setSeekerCount(parseInt(e.target.value) || 0)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Spoke with HR, they're open to Joblinca candidates..."
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={() => handleSubmit('queued')}
            disabled={loading}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Queue
          </button>
          <button
            onClick={() => handleSubmit('contacted')}
            disabled={loading}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm disabled:opacity-50"
          >
            Mark Contacted
          </button>
        </div>
      </div>
    </div>
  );
}

export function SourceFilter({
  sources,
  current,
  filter,
  search,
}: {
  sources: string[];
  current: string;
  filter: string;
  search: string;
}) {
  return (
    <select
      defaultValue={current}
      className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300"
      onChange={(e) => {
        const params = new URLSearchParams();
        params.set('filter', filter);
        if (e.target.value) params.set('source', e.target.value);
        if (search) params.set('search', search);
        window.location.href = `/admin/aggregation/outreach?${params.toString()}`;
      }}
    >
      <option value="">All Sources</option>
      {sources.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

export function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex rounded-full border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
        Not contacted
      </span>
    );
  }

  const styles: Record<string, string> = {
    new: 'border-gray-600 bg-gray-800 text-gray-400',
    queued: 'border-yellow-700 bg-yellow-900/30 text-yellow-300',
    contacted: 'border-blue-700 bg-blue-900/30 text-blue-300',
    responded: 'border-green-700 bg-green-900/30 text-green-300',
    converted: 'border-emerald-700 bg-emerald-900/30 text-emerald-300',
    closed: 'border-red-700 bg-red-900/30 text-red-300',
  };

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${styles[status] || styles.new}`}>
      {status}
    </span>
  );
}
