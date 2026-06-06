'use client';

import { useTranslation } from '@/lib/i18n/context';

type StatusConfig = {
  bg: string;
  text: string;
  label: string;
};

const statusConfig: Record<string, Omit<StatusConfig, 'label'> & { labelKey: string }> = {
  // Application statuses
  submitted: {
    bg: 'bg-blue-900/50 border-blue-700',
    text: 'text-blue-400',
    labelKey: 'status.submitted',
  },
  shortlisted: {
    bg: 'bg-yellow-900/50 border-yellow-700',
    text: 'text-yellow-400',
    labelKey: 'status.shortlisted',
  },
  interviewed: {
    bg: 'bg-purple-900/50 border-purple-700',
    text: 'text-purple-400',
    labelKey: 'status.interviewed',
  },
  hired: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    labelKey: 'status.hired',
  },
  rejected: {
    bg: 'bg-red-900/50 border-red-700',
    text: 'text-red-400',
    labelKey: 'status.rejected',
  },

  // Job statuses
  published: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    labelKey: 'status.published',
  },
  pending: {
    bg: 'bg-yellow-900/50 border-yellow-700',
    text: 'text-yellow-400',
    labelKey: 'status.pendingReview',
  },
  draft: {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    labelKey: 'status.draft',
  },
  live: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    labelKey: 'status.live',
  },
  closed_reviewing: {
    bg: 'bg-amber-900/50 border-amber-700',
    text: 'text-amber-300',
    labelKey: 'status.closed',
  },
  on_hold: {
    bg: 'bg-slate-700/50 border-slate-600',
    text: 'text-slate-300',
    labelKey: 'status.onHold',
  },
  filled: {
    bg: 'bg-emerald-900/50 border-emerald-700',
    text: 'text-emerald-300',
    labelKey: 'status.filled',
  },
  archived: {
    bg: 'bg-stone-700/50 border-stone-600',
    text: 'text-stone-300',
    labelKey: 'status.archived',
  },
  removed: {
    bg: 'bg-red-900/50 border-red-700',
    text: 'text-red-400',
    labelKey: 'status.removed',
  },

  // Shared approval status
  approved: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    labelKey: 'status.approved',
  },

  // Verification statuses
  verified: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    labelKey: 'status.verified',
  },
  unverified: {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    labelKey: 'status.unverified',
  },

  // Generic
  active: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    labelKey: 'status.active',
  },
  inactive: {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    labelKey: 'status.inactive',
  },
};

type StatusBadgeProps = {
  status?: string | null;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  if (!status) {
    return null;
  }

  const resolvedConfig =
    statusConfig[status.toLowerCase()] ??
    {
      bg: 'bg-gray-700/50 border-gray-600',
      text: 'text-gray-400',
      labelKey: '',
    };
  const label = resolvedConfig.labelKey ? t(resolvedConfig.labelKey) : status;

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${resolvedConfig.bg} ${resolvedConfig.text}`}
    >
      {label}
    </span>
  );
}
