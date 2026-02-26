'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';

interface AIButtonProps {
  field: 'summary' | 'experience' | 'skills';
  value: string;
  context?: string;
  onResult: (improved: string | string[]) => void;
  label?: string;
}

export default function AIButton({ field, value, context, onResult, label = 'Improve with AI' }: AIButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!value.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value, context }),
      });
      const data = await res.json();
      if (res.ok && data.improved !== undefined) {
        onResult(data.improved);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
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
  );
}
