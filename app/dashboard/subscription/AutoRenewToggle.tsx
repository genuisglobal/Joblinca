'use client';

import { useState } from 'react';

interface AutoRenewToggleProps {
  initialValue: boolean;
}

export default function AutoRenewToggle({ initialValue }: AutoRenewToggleProps) {
  const [enabled, setEnabled] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/subscriptions/auto-renew', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRenew: !enabled }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update');
        return;
      }

      setEnabled(!enabled);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">Auto-Renew</span>
        <button
          onClick={toggle}
          disabled={loading}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-gray-600'
          } ${loading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
          aria-label={enabled ? 'Disable auto-renewal' : 'Enable auto-renewal'}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {enabled
          ? 'Your subscription will renew automatically before it expires.'
          : 'Turn on to avoid interruption when your plan expires.'}
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
