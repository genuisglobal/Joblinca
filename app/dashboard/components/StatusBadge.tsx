import React from 'react';

type StatusConfig = {
  bg: string;
  text: string;
  label: string;
};

const statusConfig: Record<string, StatusConfig> = {
  // Application statuses
  submitted: {
    bg: 'bg-blue-900/50 border-blue-700',
    text: 'text-blue-400',
    label: 'Submitted',
  },
  shortlisted: {
    bg: 'bg-yellow-900/50 border-yellow-700',
    text: 'text-yellow-400',
    label: 'Shortlisted',
  },
  interviewed: {
    bg: 'bg-purple-900/50 border-purple-700',
    text: 'text-purple-400',
    label: 'Interviewed',
  },
  hired: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    label: 'Hired',
  },
  rejected: {
    bg: 'bg-red-900/50 border-red-700',
    text: 'text-red-400',
    label: 'Rejected',
  },

  // Job statuses
  published: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    label: 'Published',
  },
  pending: {
    bg: 'bg-yellow-900/50 border-yellow-700',
    text: 'text-yellow-400',
    label: 'Pending Review',
  },
  draft: {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    label: 'Draft',
  },

  // Shared approval status
  approved: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    label: 'Approved',
  },

  // Verification statuses
  verified: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    label: 'Verified',
  },
  unverified: {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    label: 'Unverified',
  },

  // Generic
  active: {
    bg: 'bg-green-900/50 border-green-700',
    text: 'text-green-400',
    label: 'Active',
  },
  inactive: {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    label: 'Inactive',
  },
};

type StatusBadgeProps = {
  status?: string | null;
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return null;
  }

  const config =
    statusConfig[status.toLowerCase()] ??
    {
      bg: 'bg-gray-700/50 border-gray-600',
      text: 'text-gray-400',
      label: status,
    };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      {config.label}
    </span>
  );
}
