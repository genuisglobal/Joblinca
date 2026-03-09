'use client';

import { getStageTone } from '@/lib/hiring-pipeline/presentation';

interface StageBadgeProps {
  label?: string | null;
  stageType?: string | null;
  className?: string;
}

export default function StageBadge({
  label,
  stageType,
  className = '',
}: StageBadgeProps) {
  if (!label) {
    return null;
  }

  const tone = getStageTone(stageType);

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tone.bg} ${tone.text} ${tone.border} ${className}`}
    >
      {label}
    </span>
  );
}
