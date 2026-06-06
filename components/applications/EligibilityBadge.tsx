'use client';

import { useTranslation } from '@/lib/i18n/context';

type EligibilityStatus = 'eligible' | 'needs_review' | 'ineligible' | null | undefined;

function getEligibilityConfig(
  status: EligibilityStatus,
  t: (key: string) => string
) {
  switch (status) {
    case 'eligible':
      return {
        label: t('eligibility.eligible'),
        className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
      };
    case 'needs_review':
      return {
        label: t('eligibility.needsReview'),
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      };
    case 'ineligible':
      return {
        label: t('eligibility.ineligible'),
        className: 'border-red-500/30 bg-red-500/10 text-red-200',
      };
    default:
      return {
        label: t('eligibility.noCheck'),
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
  const { t } = useTranslation();
  const config = getEligibilityConfig(status, t);

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
