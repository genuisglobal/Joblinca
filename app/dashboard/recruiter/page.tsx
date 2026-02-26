'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';

interface Job {
  id: string;
  title: string;
  location: string;
  published: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface Application {
  id: string;
  status: string;
  created_at: string;
  job_id: string;
  viewed_at: string | null;
  profiles: Profile | null;
  jobs: { title: string } | null;
}

interface Verification {
  status: string;
}

export default function RecruiterDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardData() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!mounted) return;

        if (authError || !user) {
          router.replace('/auth/login');
          return;
        }

        // Fetch recruiter's jobs
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('*')
          .eq('recruiter_id', user.id)
          .order('created_at', { ascending: false });

        if (!mounted) return;

        const fetchedJobs = jobsData || [];
        setJobs(fetchedJobs);

        // Fetch applications for recruiter's jobs
        const jobIds = fetchedJobs.map((j) => j.id);
        if (jobIds.length > 0) {
          const { data: appsData } = await supabase
            .from('applications')
            .select(`
              id,
              status,
              created_at,
              job_id,
              viewed_at,
              profiles:applicant_id (
                id,
                full_name,
                first_name,
                last_name
              ),
              jobs:job_id (
                title
              )
            `)
            .in('job_id', jobIds)
            .neq('status', 'draft')
            .order('created_at', { ascending: false });

          if (!mounted) return;
          const normalizedApps = (appsData || []).map((app: any) => ({
            ...app,
            jobs: Array.isArray(app.jobs) ? app.jobs[0] || null : app.jobs || null,
            profiles: Array.isArray(app.profiles) ? app.profiles[0] || null : app.profiles || null,
          }));
          setApplications(normalizedApps as Application[]);
        }

        // Fetch verification status
        const { data: verificationData } = await supabase
          .from('verifications')
          .select('status')
          .eq('user_id', user.id)
          .single();

        if (!mounted) return;
        setVerification(verificationData);

        setLoading(false);
      } catch (err) {
        console.error('Dashboard load error:', err);
        if (mounted) {
          router.replace('/auth/login');
        }
      }
    }

    loadDashboardData();

    return () => {
      mounted = false;
    };
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const totalJobs = jobs.length;
  const publishedJobs = jobs.filter((j) => j.published).length;
  const totalApplications = applications.length;
  const newApplications = applications.filter((a) => a.status === 'submitted' && !a.viewed_at).length;
  const shortlistedApplications = applications.filter((a) => a.status === 'shortlisted').length;
  const hiredApplications = applications.filter((a) => a.status === 'hired').length;
  const recentJobs = jobs.slice(0, 5);
  const recentApplications = applications.slice(0, 5);

  function getApplicantName(profile: Profile | null): string {
    if (!profile) return 'Unknown';
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || 'Anonymous';
  }

  return (
    <div className="space-y-8">
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Jobs Posted"
          value={totalJobs}
          color="blue"
          icon={
            <svg
              className="w-6 h-6 text-blue-400"
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
          }
        />
        <StatsCard
          title="Published Jobs"
          value={publishedJobs}
          color="green"
          icon={
            <svg
              className="w-6 h-6 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Total Applications"
          value={totalApplications}
          color="purple"
          icon={
            <svg
              className="w-6 h-6 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <Link href="/dashboard/recruiter/applications?status=submitted">
          <StatsCard
            title="New Applications"
            value={newApplications}
            color="yellow"
            icon={
              <svg
                className="w-6 h-6 text-yellow-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            }
          />
        </Link>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/dashboard/recruiter/applications?status=shortlisted">
          <StatsCard
            title="Shortlisted"
            value={shortlistedApplications}
            color="yellow"
          />
        </Link>
        <Link href="/dashboard/recruiter/applications?status=hired">
          <StatsCard
            title="Hired"
            value={hiredApplications}
            color="green"
          />
        </Link>
        <Link href="/dashboard/recruiter/applications">
          <div className="rounded-xl border p-6 bg-blue-600/20 text-blue-400 border-blue-600/30 hover:bg-blue-600/30 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 font-medium">View All Applications</p>
                <p className="text-3xl font-bold text-white mt-2">{totalApplications}</p>
              </div>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
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
        <Link
          href="/dashboard/recruiter/jobs"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          View All Jobs
        </Link>
        {!verification && (
          <Link
            href="/dashboard/recruiter/verification"
            className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
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
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
            Get Verified
          </Link>
        )}
      </div>

      {/* Recent Jobs */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Recent Jobs</h2>
          <Link
            href="/dashboard/recruiter/jobs"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View All
          </Link>
        </div>
        {recentJobs.length === 0 ? (
          <p className="text-gray-400">No jobs posted yet.</p>
        ) : (
          <div className="space-y-4">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-white">{job.title}</h3>
                  <p className="text-sm text-gray-400">
                    {job.location || 'Location not specified'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge
                    status={job.published ? 'published' : 'pending'}
                  />
                  <Link
                    href={`/dashboard/recruiter/jobs/${job.id}`}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Applications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Recent Applications
          </h2>
          <Link
            href="/dashboard/recruiter/applications"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            View All
          </Link>
        </div>
        {recentApplications.length === 0 ? (
          <div className="text-center py-8">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-400">No applications received yet.</p>
            <p className="text-sm text-gray-500 mt-1">
              Applications will appear here once candidates apply to your jobs.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentApplications.map((app) => (
              <Link
                key={app.id}
                href={`/dashboard/recruiter/applications/${app.id}`}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                    {getApplicantName(app.profiles).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {getApplicantName(app.profiles)}
                      {!app.viewed_at && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">
                          New
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400">
                      {app.jobs?.title || 'Job'} • {new Date(app.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <StatusBadge status={app.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
