'use client';

export type ExplanationTone = 'positive' | 'negative' | 'neutral';

export interface ExplanationSignal {
  key: string;
  label: string;
  tone: ExplanationTone;
  value?: number;
}

export function getExplanationToneClasses(tone: ExplanationTone) {
  switch (tone) {
    case 'positive':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200';
    case 'negative':
      return 'border-red-500/20 bg-red-500/10 text-red-200';
    default:
      return 'border-gray-600 bg-gray-700/50 text-gray-300';
  }
}

export default function ExplanationPills({
  label,
  tone,
  signals,
  compact = false,
}: {
  label: string;
  tone: ExplanationTone;
  signals: ExplanationSignal[];
  compact?: boolean;
}) {
  if (!signals.length) {
    return null;
  }

  const topSignals = signals.slice(0, compact ? 2 : 4);

  if (compact) {
    return (
      <p className="text-xs text-gray-500">
        {label}: {topSignals.map((signal) => signal.label.toLowerCase()).join(', ')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getExplanationToneClasses(
            tone
          )}`}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {topSignals.map((signal) => (
          <span
            key={`${signal.key}-${signal.label}`}
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${getExplanationToneClasses(
              signal.tone
            )}`}
          >
            {signal.label}
          </span>
        ))}
      </div>
    </div>
  );
}
