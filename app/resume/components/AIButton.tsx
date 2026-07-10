'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Undo2 } from 'lucide-react';

interface AIButtonProps {
  field: 'summary' | 'experience' | 'skills';
  value: string;
  context?: string;
  onResult: (improved: string | string[]) => void;
  label?: string;
}

export default function AIButton({ field, value, context, onResult, label = 'Improve with AI' }: AIButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Previous value kept so the user can revert an AI rewrite (string fields only —
  // skills are merged as removable chips, so undo isn't needed there).
  const [previousValue, setPreviousValue] = useState<string | null>(null);

  async function handleClick() {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value, context }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.improved !== undefined) {
        if (field !== 'skills') setPreviousValue(value);
        onResult(data.improved);
      } else if (res.status === 429) {
        setError('AI limit reached — try again later.');
      } else if (res.status === 401) {
        setError('Sign in to use AI features.');
      } else {
        setError(data.error || 'AI improvement failed. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleUndo() {
    if (previousValue === null) return;
    onResult(previousValue);
    setPreviousValue(null);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {error && <span className="text-xs text-red-400">{error}</span>}
      {previousValue !== null && !loading && (
        <button
          type="button"
          onClick={handleUndo}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          title="Revert to your original text"
        >
          <Undo2 className="w-3.5 h-3.5" />
          Undo
        </button>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={loading || !value.trim()}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-lg hover:bg-purple-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Sparkles className="w-3.5 h-3.5" />
        )}
        {loading ? 'Improving...' : label}
      </button>
    </div>
  );
}
