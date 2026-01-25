'use client';

type ApplicationStatus =
  | 'submitted'
  | 'shortlisted'
  | 'interviewed'
  | 'hired'
  | 'rejected';

type JobStatus = 'published' | 'pending' | 'draft';

interface StatusBadgeProps {
  status: ApplicationStatus | JobStatus | string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  const statusConfig: Record<
    string,
    { bg: string; text: string; label: string }
  > = {
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
    approved: {
      bg: 'bg-green-900/50 border-green-700',
      text: 'text-green-400',
      label: 'Approved',
    },
    draft: {
      bg: 'bg-gray-700/50 border-gray-600',
      text: 'text-gray-400',
      label: 'Draft',
    },
    // Verification statuses
    approved: {
      bg: 'bg-green-900/50 border-green-700',
      text: 'text-green-400',
      label: 'Approved',
    },
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

  const config = statusConfig[status] || {
    bg: 'bg-gray-700/50 border-gray-600',
    text: 'text-gray-400',
    label: status.charAt(0).toUpperCase() + status.slice(1),
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bg} ${config.text} ${sizeClasses[size]}`}
    >
      {config.label}
    </span>
  );
}
