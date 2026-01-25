'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  published: boolean;
  created_at: string;
  posted_by: string | null;
  recruiter_id: string;
  rejection_reason: string | null;
  profiles: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface JobsTableProps {
  jobs: Job[];
}

export default function JobsTable({ jobs }: JobsTableProps) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (jobId: string) => {
    setActionLoading(jobId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/approve`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve job');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (jobId: string) => {
    if (!rejectionReason.trim()) {
      setError('Rejection reason is required');
      return;
    }
    setActionLoading(jobId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jobs/${jobId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject job');
      }
      setShowRejectModal(null);
      setRejectionReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const getPostedByName = (job: Job) => {
    if (job.profiles) {
      const { first_name, last_name, full_name, email } = job.profiles;
      if (first_name || last_name) {
        return `${first_name || ''} ${last_name || ''}`.trim();
      }
      return full_name || email || 'Unknown';
    }
    return 'Unknown';
  };

  if (jobs.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-12 text-center">
        <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <h3 className="text-xl font-semibold text-white mb-2">No jobs found</h3>
        <p className="text-gray-400">No jobs match the selected filter.</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left p-4 text-gray-400 font-medium">Job</th>
              <th className="text-left p-4 text-gray-400 font-medium hidden md:table-cell">Posted By</th>
              <th className="text-left p-4 text-gray-400 font-medium hidden lg:table-cell">Created</th>
              <th className="text-center p-4 text-gray-400 font-medium">Status</th>
              <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="p-4">
                  <Link href={`/admin/jobs/${job.id}`} className="font-medium text-white hover:text-blue-400">
                    {job.title}
                  </Link>
                  {job.company_name && (
                    <p className="text-sm text-gray-400">{job.company_name}</p>
                  )}
                  {job.location && (
                    <p className="text-xs text-gray-500">{job.location}</p>
                  )}
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className="text-gray-300">{getPostedByName(job)}</span>
                </td>
                <td className="p-4 text-gray-400 hidden lg:table-cell">
                  {new Date(job.created_at).toLocaleDateString()}
                </td>
                <td className="p-4 text-center">
                  <StatusBadge status={job.approval_status} />
                  {job.rejection_reason && (
                    <p className="text-xs text-red-400 mt-1 max-w-32 truncate" title={job.rejection_reason}>
                      {job.rejection_reason}
                    </p>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/admin/jobs/${job.id}`}
                      className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                      View
                    </Link>
                    {job.approval_status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(job.id)}
                          disabled={actionLoading === job.id}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === job.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(job.id)}
                          disabled={actionLoading === job.id}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {job.approval_status === 'rejected' && (
                      <button
                        onClick={() => handleApprove(job.id)}
                        disabled={actionLoading === job.id}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === job.id ? '...' : 'Approve'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Reject Job</h3>
            <p className="text-gray-400 mb-4">
              Please provide a reason for rejecting this job posting. This will be visible to the recruiter.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              rows={4}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectionReason('');
                  setError(null);
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={actionLoading === showRejectModal || !rejectionReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading === showRejectModal ? 'Rejecting...' : 'Reject Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const config = {
    pending: {
      bg: 'bg-yellow-900/50 border-yellow-700',
      text: 'text-yellow-400',
      label: 'Pending',
    },
    approved: {
      bg: 'bg-green-900/50 border-green-700',
      text: 'text-green-400',
      label: 'Approved',
    },
    rejected: {
      bg: 'bg-red-900/50 border-red-700',
      text: 'text-red-400',
      label: 'Rejected',
    },
  };

  const { bg, text, label } = config[status];

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${bg} ${text}`}>
      {label}
    </span>
  );
}
