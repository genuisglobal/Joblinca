'use client';

import ExplanationPills, {
  type ExplanationSignal,
  type ExplanationTone,
} from '@/components/applications/ExplanationPills';

function splitReason(
  reason: string | null | undefined,
  reasonSignals?: string[] | null
): string[] {
  if (Array.isArray(reasonSignals) && reasonSignals.length > 0) {
    return reasonSignals.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }

  if (!reason) return [];

  return reason
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function inferTone(label: string): ExplanationTone {
  const normalized = label.toLowerCase();

  if (
    normalized.includes('keyword overlap') ||
    normalized.includes('location preference') ||
    normalized.includes('remote opportunity') ||
    normalized.includes('alignment') ||
    normalized.includes('strong profile') ||
    normalized.includes('high recruiter') ||
    normalized.includes('strong past') ||
    normalized.includes('clean ats') ||
    normalized.includes('strong prior')
  ) {
    return 'positive';
  }

  if (normalized.includes('review')) {
    return 'neutral';
  }

  return 'neutral';
}

function summarize(score: number, reason: string | null | undefined, reasonSignals?: string[] | null) {
  const rawSignals = splitReason(reason, reasonSignals);
  const signals: ExplanationSignal[] = rawSignals.map((label, index) => ({
    key: `${index}`,
    label,
    tone: inferTone(label),
  }));

  let tone: ExplanationTone = 'neutral';
  let label = 'Moderate match';

  if (score >= 70) {
    tone = 'positive';
    label = 'High match';
  } else if (score < 40) {
    tone = 'negative';
    label = 'Low match';
  }

  return { label, tone, signals };
}

export default function MatchScoreExplanation({
  score,
  reason,
  reasonSignals,
  compact = false,
}: {
  score: number;
  reason: string | null | undefined;
  reasonSignals?: string[] | null;
  compact?: boolean;
}) {
  const explanation = summarize(score, reason, reasonSignals);

  if (explanation.signals.length === 0) {
    return null;
  }

  return (
    <ExplanationPills
      label={explanation.label}
      tone={explanation.tone}
      signals={explanation.signals}
      compact={compact}
    />
  );
}
