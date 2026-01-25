'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Job = {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  employment_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  created_at: string;
};

type SavedJobCardProps = {
  savedJobId: string;
  job: Job;
  savedAt: string;
  hasApplied: boolean;
  isAvailable: boolean;
  isClosed: boolean;
};

export default function SavedJobCard({
  savedJobId,
  job,
  savedAt,
  hasApplied,
  isAvailable,
  isClosed,
}: SavedJobCardProps) {
  const router = useRouter();
  const supabase = createClient();
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRemoved, setIsRemoved] = useState(false);

  const formatSalary = () => {
    if (!job.salary_min && !job.salary_max) return null;
    const currency = job.salary_currency || 'XAF';
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });

    if (job.salary_min && job.salary_max) {
      return `${formatter.format(job.salary_min)} - ${formatter.format(job.salary_max)}`;
    }
    if (job.salary_min) return `From ${formatter.format(job.salary_min)}`;
    if (job.salary_max) return `Up to ${formatter.format(job.salary_max)}`;
    return null;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await supabase.from('saved_jobs').delete().eq('id', savedJobId);
      setIsRemoved(true);
      router.refresh();
    } catch (err) {
      console.error('Failed to remove saved job:', err);
      setIsRemoving(false);
    }
  };

  if (isRemoved) {
    return null;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Link
              href={`/jobs/${job.id}`}
              className="text-lg font-semibold text-white hover:text-blue-400 transition-colors"
            >
              {job.title}
            </Link>
            {hasApplied && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400 border border-green-700">
                Applied
              </span>
            )}
            {isClosed && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/50 text-red-400 border border-red-700">
                Closed
              </span>
            )}
            {!isAvailable && !isClosed && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-400">
                Unavailable
              </span>
            )}
          </div>

          <p className="text-gray-300">{job.company_name || 'Company not specified'}</p>

          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-400">
            {job.location && (
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                {job.location}
              </div>
            )}

            {job.employment_type && (
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                {job.employment_type.replace(/_/g, ' ')}
              </div>
            )}

            {formatSalary() && (
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {formatSalary()}
              </div>
            )}
          </div>

          <p className="text-gray-500 text-sm mt-3">Saved on {formatDate(savedAt)}</p>
        </div>

        <div className="flex flex-col gap-2">
          {isAvailable && !hasApplied && (
            <Link
              href={`/jobs/${job.id}/apply`}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors text-center"
            >
              Apply Now
            </Link>
          )}
          <Link
            href={`/jobs/${job.id}`}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors text-center"
          >
            View Job
          </Link>
          <button
            onClick={handleRemove}
            disabled={isRemoving}
            className="px-4 py-2 bg-gray-700 hover:bg-red-900/50 text-gray-400 hover:text-red-400 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            {isRemoving ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Remove
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
