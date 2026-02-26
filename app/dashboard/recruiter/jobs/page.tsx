'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '../../components/StatusBadge';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  published: boolean;
  approval_status: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export default function RecruiterJobsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applicationCounts, setApplicationCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          router.replace('/auth/login');
          return;
        }

        // Fetch jobs
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('*')
          .eq('recruiter_id', user.id)
          .order('created_at', { ascending: false });

        if (!mounted) return;

        const fetchedJobs = jobsData || [];
        setJobs(fetchedJobs);

        // Get application counts for each job
        const jobIds = fetchedJobs.map((j) => j.id);
        if (jobIds.length > 0) {
          const { data: apps } = await supabase
            .from('applications')
            .select('job_id')
            .in('job_id', jobIds)
            .neq('status', 'draft');

          if (!mounted) return;

          const counts: Record<string, number> = {};
          apps?.forEach((app) => {
            counts[app.job_id] = (counts[app.job_id] || 0) + 1;
          });
          setApplicationCounts(counts);
        }

        setLoading(false);
      } catch (err) {
        console.error('Jobs load error:', err);
        if (mounted) {
          router.replace('/auth/login');
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading jobs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">My Jobs</h1>
        <Link
          href="/jobs/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Post New Job
        </Link>
      </div>

      {jobs.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">
            No jobs posted yet
          </h3>
          <p className="text-gray-400 mb-6">
            Start attracting candidates by posting your first job.
          </p>
          <Link
            href="/jobs/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Post Your First Job
          </Link>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-gray-400 font-medium">
                  Job Title
                </th>
                <th className="text-left p-4 text-gray-400 font-medium hidden md:table-cell">
                  Location
                </th>
                <th className="text-left p-4 text-gray-400 font-medium hidden lg:table-cell">
                  Posted
                </th>
                <th className="text-center p-4 text-gray-400 font-medium">
                  Applications
                </th>
                <th className="text-center p-4 text-gray-400 font-medium">
                  Status
                </th>
                <th className="text-right p-4 text-gray-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-gray-700/50 hover:bg-gray-700/30"
                >
                  <td className="p-4">
                    <Link
                      href={`/dashboard/recruiter/jobs/${job.id}`}
                      className="font-medium text-white hover:text-blue-400"
                    >
                      {job.title}
                    </Link>
                    {job.company_name && (
                      <p className="text-sm text-gray-400">{job.company_name}</p>
                    )}
                  </td>
                  <td className="p-4 text-gray-300 hidden md:table-cell">
                    {job.location || 'Not specified'}
                  </td>
                  <td className="p-4 text-gray-400 hidden lg:table-cell">
                    {new Date(job.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-center">
                    <Link
                      href={`/dashboard/recruiter/applications?job=${job.id}`}
                      className="inline-flex items-center justify-center w-8 h-8 bg-blue-600/20 text-blue-400 rounded-full font-medium hover:bg-blue-600/30 transition-colors"
                    >
                      {applicationCounts[job.id] || 0}
                    </Link>
                  </td>
                  <td className="p-4 text-center">
                    <StatusBadge
                      status={job.approval_status || (job.published ? 'published' : 'pending')}
                    />
                    {job.approval_status === 'rejected' && job.rejection_reason && (
                      <p className="text-xs text-red-400 mt-1 max-w-32 truncate" title={job.rejection_reason}>
                        {job.rejection_reason}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/recruiter/jobs/${job.id}`}
                        className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                      >
                        View
                      </Link>
                      <Link
                        href={`/jobs/${job.id}`}
                        className="px-3 py-1 text-sm bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
                        target="_blank"
                      >
                        Preview
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
