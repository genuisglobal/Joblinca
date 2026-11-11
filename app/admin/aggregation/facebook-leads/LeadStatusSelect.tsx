'use client';

import { useState } from 'react';

const OPTIONS = ['new', 'contacted', 'responded', 'converted', 'not_relevant'];

export function LeadStatusSelect({ id, status }: { id: string; status: string }) {
  const [value, setValue] = useState(status);
  const [state, setState] = useState<'idle' | 'saving' | 'error'>('idle');

  async function update(next: string) {
    const previous = value;
    setValue(next);
    setState('saving');
    try {
      const res = await fetch(`/api/admin/facebook-leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('idle');
    } catch {
      setValue(previous);
      setState('error');
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs text-gray-400">
      <span className="sr-only">Lead status</span>
      <select
        value={value}
        disabled={state === 'saving'}
        onChange={(event) => update(event.target.value)}
        className="min-h-11 rounded-lg border border-gray-600 bg-gray-900 px-2 text-sm text-gray-200"
      >
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option.replace('_', ' ')}
          </option>
        ))}
      </select>
      {state === 'error' && <span className="text-red-300">Not saved</span>}
    </label>
  );
}
