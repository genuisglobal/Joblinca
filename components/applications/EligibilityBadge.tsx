'use client';

type EligibilityStatus = 'eligible' | 'needs_review' | 'ineligible' | null | undefined;

function getEligibilityConfig(status: EligibilityStatus) {
  switch (status) {
    case 'eligible':
      return {
        label: 'Eligible',
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      };
    case 'needs_review':
      return {
        label: 'Needs Review',
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      };
    case 'ineligible':
      return {
        label: 'Ineligible',
        className: 'border-red-500/30 bg-red-500/10 text-red-200',
      };
    default:
      return {
        label: 'No Check',
        className: 'border-gray-600 bg-gray-700/50 text-gray-300',
      };
  }
}

export default function EligibilityBadge({
  status,
  compact = false,
}: {
  status: EligibilityStatus;
  compact?: boolean;
}) {
  const config = getEligibilityConfig(status);

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${config.className} ${
        compact ? 'px-2.5 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'
      }`}
    >
      {config.label}
    </span>
  );
}
