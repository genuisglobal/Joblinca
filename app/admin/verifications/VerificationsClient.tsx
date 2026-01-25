'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface Recruiter {
  user_id: string;
  company_name: string | null;
  contact_email: string | null;
  recruiter_type: string;
  verification_status: string;
  verified_at: string | null;
  verification_notes: string | null;
  created_at: string;
  profile: Profile | null;
}

interface JobSeeker {
  user_id: string;
  headline: string | null;
  location: string | null;
  verification_status: string;
  verified_at: string | null;
  verification_notes: string | null;
  created_at: string;
  profile: Profile | null;
}

interface VerificationDoc {
  id: string;
  user_id: string;
  id_document_url: string | null;
  selfie_url: string | null;
  certificates: unknown | null;
  employer_reference: string | null;
  status: string;
  created_at: string;
}

interface Counts {
  pending: number;
  verified: number;
  rejected: number;
  unverified: number;
  total: number;
}

interface VerificationsClientProps {
  activeTab: string;
  recruiters: Recruiter[];
  jobSeekers: JobSeeker[];
  verificationDocs: VerificationDoc[];
  recruiterCounts: Counts;
  jobSeekerCounts: Counts;
}

export default function VerificationsClient({
  activeTab,
  recruiters,
  jobSeekers,
  verificationDocs,
  recruiterCounts,
  jobSeekerCounts,
}: VerificationsClientProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<{ type: 'recruiter' | 'job-seeker'; id: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const getName = (profile: Profile | null) => {
    if (!profile) return 'Unknown';
    const { first_name, last_name, full_name, email } = profile;
    if (first_name || last_name) {
      return `${first_name || ''} ${last_name || ''}`.trim();
    }
    return full_name || email || 'Unknown';
  };

  const handleVerify = async (type: 'recruiter' | 'job-seeker', userId: string) => {
    setActionLoading(userId);
    setError(null);
    try {
      const endpoint = type === 'recruiter'
        ? `/api/admin/recruiters/${userId}/verify`
        : `/api/admin/job-seekers/${userId}/verify`;

      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to verify');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!showRejectModal || !rejectionReason.trim()) {
      setError('Rejection reason is required');
      return;
    }

    setActionLoading(showRejectModal.id);
    setError(null);
    try {
      const endpoint = showRejectModal.type === 'recruiter'
        ? `/api/admin/recruiters/${showRejectModal.id}/reject`
        : `/api/admin/job-seekers/${showRejectModal.id}/reject`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject');
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

  const getVerificationDocs = (userId: string) => {
    return verificationDocs.find(doc => doc.user_id === userId);
  };

  const filteredRecruiters = recruiters.filter(r =>
    statusFilter === 'all' || r.verification_status === statusFilter
  );

  const filteredJobSeekers = jobSeekers.filter(j =>
    statusFilter === 'all' || j.verification_status === statusFilter
  );

  const counts = activeTab === 'recruiters' ? recruiterCounts : jobSeekerCounts;

  return (
    <>
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/admin/verifications?tab=recruiters"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'recruiters'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          Recruiters
          {recruiterCounts.pending > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/50 text-yellow-400">
              {recruiterCounts.pending}
            </span>
          )}
        </Link>
        <Link
          href="/admin/verifications?tab=job-seekers"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'job-seekers'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          Job Seekers
          {jobSeekerCounts.pending > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/50 text-yellow-400">
              {jobSeekerCounts.pending}
            </span>
          )}
        </Link>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6">
        {['all', 'pending', 'verified', 'rejected', 'unverified'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              statusFilter === status
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && (
              <span className="ml-1">
                ({status === 'pending' ? counts.pending :
                  status === 'verified' ? counts.verified :
                  status === 'rejected' ? counts.rejected :
                  counts.unverified})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {activeTab === 'recruiters' ? (
        <RecruitersTable
          recruiters={filteredRecruiters}
          getName={getName}
          getVerificationDocs={getVerificationDocs}
          actionLoading={actionLoading}
          onVerify={(id) => handleVerify('recruiter', id)}
          onReject={(id) => setShowRejectModal({ type: 'recruiter', id })}
        />
      ) : (
        <JobSeekersTable
          jobSeekers={filteredJobSeekers}
          getName={getName}
          actionLoading={actionLoading}
          onVerify={(id) => handleVerify('job-seeker', id)}
          onReject={(id) => setShowRejectModal({ type: 'job-seeker', id })}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">
              Reject {showRejectModal.type === 'recruiter' ? 'Recruiter' : 'Job Seeker'}
            </h3>
            <p className="text-gray-400 mb-4">
              Please provide a reason for rejecting this verification request.
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
                onClick={handleReject}
                disabled={actionLoading !== null || !rejectionReason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RecruitersTable({
  recruiters,
  getName,
  getVerificationDocs,
  actionLoading,
  onVerify,
  onReject,
}: {
  recruiters: Recruiter[];
  getName: (profile: Profile | null) => string;
  getVerificationDocs: (userId: string) => VerificationDoc | undefined;
  actionLoading: string | null;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (recruiters.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-12 text-center">
        <p className="text-gray-400">No recruiters found matching the filter.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left p-4 text-gray-400 font-medium">Recruiter</th>
            <th className="text-left p-4 text-gray-400 font-medium hidden md:table-cell">Company</th>
            <th className="text-left p-4 text-gray-400 font-medium hidden lg:table-cell">Type</th>
            <th className="text-center p-4 text-gray-400 font-medium">Status</th>
            <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {recruiters.map((recruiter) => {
            const docs = getVerificationDocs(recruiter.user_id);
            return (
              <tr key={recruiter.user_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                <td className="p-4">
                  <p className="font-medium text-white">{getName(recruiter.profile)}</p>
                  <p className="text-sm text-gray-400">{recruiter.profile?.email || recruiter.contact_email}</p>
                </td>
                <td className="p-4 hidden md:table-cell">
                  <span className="text-gray-300">{recruiter.company_name || 'N/A'}</span>
                </td>
                <td className="p-4 hidden lg:table-cell">
                  <span className="text-gray-300 capitalize">{recruiter.recruiter_type?.replace('_', ' ')}</span>
                </td>
                <td className="p-4 text-center">
                  <StatusBadge status={recruiter.verification_status} />
                  {docs && (
                    <p className="text-xs text-blue-400 mt-1">Has documents</p>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    {(recruiter.verification_status === 'pending' || recruiter.verification_status === 'unverified') && (
                      <>
                        <button
                          onClick={() => onVerify(recruiter.user_id)}
                          disabled={actionLoading === recruiter.user_id}
                          className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          {actionLoading === recruiter.user_id ? '...' : 'Verify'}
                        </button>
                        <button
                          onClick={() => onReject(recruiter.user_id)}
                          disabled={actionLoading === recruiter.user_id}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {recruiter.verification_status === 'rejected' && (
                      <button
                        onClick={() => onVerify(recruiter.user_id)}
                        disabled={actionLoading === recruiter.user_id}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        Verify
                      </button>
                    )}
                    {recruiter.verification_status === 'verified' && (
                      <span className="text-sm text-green-400">Verified</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JobSeekersTable({
  jobSeekers,
  getName,
  actionLoading,
  onVerify,
  onReject,
}: {
  jobSeekers: JobSeeker[];
  getName: (profile: Profile | null) => string;
  actionLoading: string | null;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
}) {
  if (jobSeekers.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-12 text-center">
        <p className="text-gray-400">No job seekers found matching the filter.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-700">
            <th className="text-left p-4 text-gray-400 font-medium">Job Seeker</th>
            <th className="text-left p-4 text-gray-400 font-medium hidden md:table-cell">Headline</th>
            <th className="text-left p-4 text-gray-400 font-medium hidden lg:table-cell">Location</th>
            <th className="text-center p-4 text-gray-400 font-medium">Status</th>
            <th className="text-right p-4 text-gray-400 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobSeekers.map((jobSeeker) => (
            <tr key={jobSeeker.user_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
              <td className="p-4">
                <p className="font-medium text-white">{getName(jobSeeker.profile)}</p>
                <p className="text-sm text-gray-400">{jobSeeker.profile?.email}</p>
              </td>
              <td className="p-4 hidden md:table-cell">
                <span className="text-gray-300">{jobSeeker.headline || 'N/A'}</span>
              </td>
              <td className="p-4 hidden lg:table-cell">
                <span className="text-gray-300">{jobSeeker.location || 'N/A'}</span>
              </td>
              <td className="p-4 text-center">
                <StatusBadge status={jobSeeker.verification_status} />
              </td>
              <td className="p-4">
                <div className="flex items-center justify-end gap-2">
                  {(jobSeeker.verification_status === 'pending' || jobSeeker.verification_status === 'unverified') && (
                    <>
                      <button
                        onClick={() => onVerify(jobSeeker.user_id)}
                        disabled={actionLoading === jobSeeker.user_id}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === jobSeeker.user_id ? '...' : 'Verify'}
                      </button>
                      <button
                        onClick={() => onReject(jobSeeker.user_id)}
                        disabled={actionLoading === jobSeeker.user_id}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {jobSeeker.verification_status === 'rejected' && (
                    <button
                      onClick={() => onVerify(jobSeeker.user_id)}
                      disabled={actionLoading === jobSeeker.user_id}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Verify
                    </button>
                  )}
                  {jobSeeker.verification_status === 'verified' && (
                    <span className="text-sm text-green-400">Verified</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending: {
      bg: 'bg-yellow-900/50 border-yellow-700',
      text: 'text-yellow-400',
      label: 'Pending',
    },
    verified: {
      bg: 'bg-green-900/50 border-green-700',
      text: 'text-green-400',
      label: 'Verified',
    },
    rejected: {
      bg: 'bg-red-900/50 border-red-700',
      text: 'text-red-400',
      label: 'Rejected',
    },
    unverified: {
      bg: 'bg-gray-700/50 border-gray-600',
      text: 'text-gray-400',
      label: 'Unverified',
    },
  };

  const { bg, text, label } = config[status] || config.unverified;

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${bg} ${text}`}>
      {label}
    </span>
  );
}
