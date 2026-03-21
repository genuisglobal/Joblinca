'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  applicationDashboardHrefForRole,
  canRoleApplyToOpportunity,
  describeEligibleRoles,
  getOpportunityTypeLabel,
} from '@/lib/opportunities';

type ApplyMethod = 'joblinca' | 'external_url' | 'email' | 'phone' | 'whatsapp' | 'multiple';

type Job = {
  id: string;
  title: string;
  company_name: string | null;
  recruiter_id: string | null;
  job_type: string | null;
  internship_track: string | null;
  visibility: string | null;
  eligible_roles: string[] | null;
  apply_method: ApplyMethod;
  external_apply_url: string | null;
  apply_email: string | null;
  apply_phone: string | null;
  apply_whatsapp: string | null;
  closes_at: string | null;
  origin_type: string | null;
  source_name: string | null;
};

type ExistingApplication = {
  id: string;
  status: string;
  is_draft?: boolean;
  created_at: string;
} | null;

type ApplyOptionsProps = {
  job: Job;
  isAuthenticated: boolean;
  userRole: string | null;
  existingApplication: ExistingApplication;
  isSaved: boolean;
  isClosed: boolean;
};

export default function ApplyOptions({
  job,
  isAuthenticated,
  userRole,
  existingApplication,
  isSaved: initialIsSaved,
  isClosed,
}: ApplyOptionsProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isSaved, setIsSaved] = useState(initialIsSaved);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportStatus, setReportStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const canApply = isAuthenticated &&
    canRoleApplyToOpportunity(
      userRole,
      job.eligible_roles,
      job.job_type,
      job.internship_track,
      job.visibility
    ) &&
    !isClosed;
  const hasApplied = existingApplication && !existingApplication.is_draft;
  const hasDraft = existingApplication?.is_draft;
  const eligibleRoleSummary = describeEligibleRoles(
    job.eligible_roles,
    job.job_type,
    job.internship_track,
    job.visibility
  );
  const opportunityLabel = getOpportunityTypeLabel(job.job_type, job.internship_track).toLowerCase();
  const applicationsHref = applicationDashboardHrefForRole(userRole);
  const companyName = job.company_name || 'the company';
  const isExternalJob = job.origin_type === 'admin_import' || job.origin_type === 'claimed_discovered';

  const trackExternalClick = async (method: string) => {
    try {
      await supabase.from('external_apply_clicks').insert({
        job_id: job.id,
        method,
      });
    } catch (err) {
      console.error('Failed to track click:', err);
    }
  };

  const handleSaveJob = async () => {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/jobs/${job.id}`);
      return;
    }

    setIsSaving(true);
    try {
      if (isSaved) {
        await supabase.from('saved_jobs').delete().eq('job_id', job.id);
        setIsSaved(false);
      } else {
        await supabase.from('saved_jobs').insert({ job_id: job.id });
        setIsSaved(true);
      }
    } catch (err) {
      console.error('Failed to save job:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExternalApply = async () => {
    if (job.external_apply_url) {
      await trackExternalClick('external_url');
      window.open(job.external_apply_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleEmailApply = async () => {
    if (job.apply_email) {
      await trackExternalClick('email');
      window.location.href = `mailto:${job.apply_email}?subject=Application for ${encodeURIComponent(job.title)} at ${encodeURIComponent(companyName)}`;
    }
  };

  const handlePhoneApply = async () => {
    if (job.apply_phone) {
      await trackExternalClick('phone');
      window.location.href = `tel:${job.apply_phone}`;
    }
  };

  const handleWhatsAppApply = async () => {
    if (job.apply_whatsapp) {
      await trackExternalClick('whatsapp');
      const message = encodeURIComponent(
        `Hi, I'm interested in the ${job.title} position at ${companyName}. I found this job on JobLinca.`
      );
      window.open(
        `https://wa.me/${job.apply_whatsapp.replace(/[^0-9]/g, '')}?text=${message}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    await trackExternalClick('copy_link');
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const showJobLincaApply =
    job.apply_method === 'joblinca' || job.apply_method === 'multiple';
  const showExternalUrl =
    job.external_apply_url &&
    (job.apply_method === 'external_url' || job.apply_method === 'multiple');
  const showEmail =
    job.apply_email && (job.apply_method === 'email' || job.apply_method === 'multiple');
  const showPhone =
    job.apply_phone && (job.apply_method === 'phone' || job.apply_method === 'multiple');
  const showWhatsApp =
    job.apply_whatsapp && (job.apply_method === 'whatsapp' || job.apply_method === 'multiple');

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      submitted: { text: 'Application Submitted', color: 'text-blue-400' },
      shortlisted: { text: 'Shortlisted', color: 'text-yellow-400' },
      interviewed: { text: 'Interview Scheduled', color: 'text-purple-400' },
      hired: { text: 'Hired', color: 'text-green-400' },
      rejected: { text: 'Not Selected', color: 'text-red-400' },
    };
    return labels[status] || { text: status, color: 'text-gray-400' };
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Apply for this {opportunityLabel}</h3>

      {/* Already Applied Status */}
      {hasApplied && (
        <div className="mb-4 p-4 bg-gray-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-green-400 font-medium">Applied</span>
          </div>
          <p className={`text-sm ${getStatusLabel(existingApplication!.status).color}`}>
            Status: {getStatusLabel(existingApplication!.status).text}
          </p>
          <Link
            href={applicationsHref}
            className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
          >
            View your applications
          </Link>
        </div>
      )}

      {/* Draft Notice */}
      {hasDraft && (
        <div className="mb-4 p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg">
          <p className="text-yellow-400 text-sm">
            You have a draft application for this job.
          </p>
          <Link
            href={`/jobs/${job.id}/apply`}
            className="text-yellow-300 hover:text-yellow-200 text-sm font-medium mt-1 inline-block"
          >
            Continue application
          </Link>
        </div>
      )}

      {/* Closed Notice */}
      {isClosed && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-red-400 text-sm">This job is no longer accepting applications.</p>
        </div>
      )}

      {/* Apply Buttons */}
      {!hasApplied && !isClosed && (
        <div className="space-y-3">
          {isAuthenticated && !canApply && (
            <div className="p-3 bg-gray-700/50 rounded-lg text-center text-gray-300 text-sm">
              This opportunity is currently open to {eligibleRoleSummary.toLowerCase()}.
            </div>
          )}
          {/* JobLinca Apply */}
          {showJobLincaApply && (
            <>
              {isAuthenticated ? (
                canApply ? (
                  <Link
                    href={`/jobs/${job.id}/apply`}
                    className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {hasDraft ? 'Continue Application' : 'Apply with JobLinca'}
                  </Link>
                ) : (
                  <div className="p-3 bg-gray-700/50 rounded-lg text-center text-gray-400 text-sm">
                    Switch to an eligible profile to apply here
                  </div>
                )
              ) : (
                <Link
                  href={`/auth/login?redirect=/jobs/${job.id}/apply`}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  Sign in to Apply
                </Link>
              )}
            </>
          )}

          {/* External URL Apply */}
          {showExternalUrl && (!isAuthenticated || canApply) && (
            <button
              onClick={handleExternalApply}
              className="w-full px-6 py-3 bg-orange-600/80 hover:bg-orange-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              {isExternalJob
                ? `Apply on Original Source${job.source_name ? ` (${job.source_name})` : ''}`
                : 'Apply on Company Website'}
            </button>
          )}

          {/* Email Apply */}
          {showEmail && (!isAuthenticated || canApply) && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Email your application</span>
                <button
                  onClick={() => copyToClipboard(job.apply_email!, 'email')}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  {copiedField === 'email' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button
                onClick={handleEmailApply}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                {job.apply_email}
              </button>
            </div>
          )}

          {/* Phone Apply */}
          {showPhone && (!isAuthenticated || canApply) && (
            <div className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Call to apply</span>
                <button
                  onClick={() => copyToClipboard(job.apply_phone!, 'phone')}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  {copiedField === 'phone' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <button
                onClick={handlePhoneApply}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
                {job.apply_phone}
              </button>
            </div>
          )}

          {/* WhatsApp Apply */}
          {showWhatsApp && (!isAuthenticated || canApply) && (
            <button
              onClick={handleWhatsAppApply}
              className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Apply via WhatsApp
            </button>
          )}
        </div>
      )}

      {/* Save Job Button */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <button
          onClick={handleSaveJob}
          disabled={isSaving}
          className={`w-full px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 ${
            isSaved
              ? 'bg-yellow-900/30 text-yellow-400 hover:bg-yellow-900/50'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {isSaving ? (
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill={isSaved ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          )}
          {isSaved ? 'Saved' : 'Save Job'}
        </button>
      </div>

      {/* Share Section */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <p className="text-gray-400 text-sm mb-3">Share this job</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url);
              setCopiedField('share');
              setTimeout(() => setCopiedField(null), 2000);
            }}
            className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors text-sm flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {copiedField === 'share' ? 'Copied!' : 'Copy Link'}
          </button>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out this job: ${job.title} at ${job.company_name}`)}&url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Message Recruiter */}
      {isAuthenticated && job.recruiter_id && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={() => {
              const msg = `Hi, I'm interested in the "${job.title}" position.`;
              fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiverId: job.recruiter_id, message: msg, jobId: job.id }),
              }).then((r) => {
                if (r.ok) {
                  router.push('/dashboard/job-seeker/messages');
                }
              });
            }}
            className="w-full px-4 py-2.5 text-sm text-neutral-300 hover:text-white border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Message Recruiter
          </button>
        </div>
      )}

      {/* Report Job */}
      {isAuthenticated && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={() => setShowReport(true)}
            className="w-full px-4 py-2 text-sm text-neutral-500 hover:text-red-400 transition-colors flex items-center justify-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            Report this job
          </button>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
            <h3 className="text-lg font-semibold text-white mb-1">Report Job Posting</h3>
            <p className="text-sm text-neutral-400 mb-4">
              Help us keep Joblinca safe. Select a reason for reporting this job.
            </p>

            {reportStatus === 'sent' ? (
              <div className="text-center py-4">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white font-medium">Report submitted</p>
                <p className="text-sm text-neutral-400 mt-1">Our team will review this posting.</p>
                <button
                  onClick={() => { setShowReport(false); setReportStatus('idle'); setReportReason(''); setReportDescription(''); }}
                  className="mt-4 px-4 py-2 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full mb-3 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm text-neutral-200"
                >
                  <option value="">Select a reason</option>
                  <option value="scam">Scam or fraud</option>
                  <option value="misleading">Misleading information</option>
                  <option value="duplicate">Duplicate posting</option>
                  <option value="offensive">Offensive content</option>
                  <option value="wrong_info">Incorrect information</option>
                  <option value="other">Other</option>
                </select>

                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Add details (optional)"
                  rows={3}
                  maxLength={1000}
                  className="w-full mb-4 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 resize-none"
                />

                {reportStatus === 'error' && (
                  <p className="text-sm text-red-400 mb-3">Failed to submit. You may have already reported this job.</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowReport(false); setReportStatus('idle'); }}
                    className="flex-1 px-4 py-2 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!reportReason || reportStatus === 'sending'}
                    onClick={async () => {
                      setReportStatus('sending');
                      try {
                        const res = await fetch(`/api/jobs/${job.id}/report`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ reason: reportReason, description: reportDescription }),
                        });
                        if (res.ok) {
                          setReportStatus('sent');
                        } else {
                          setReportStatus('error');
                        }
                      } catch {
                        setReportStatus('error');
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {reportStatus === 'sending' ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
