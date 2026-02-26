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
  company_name: string;
  location: string;
}

interface Application {
  id: string;
  status: string;
  created_at: string;
  jobs: Job | null;
}

export default function JobSeekerDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);

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

        // Fetch user's applications
        const { data: apps } = await supabase
          .from('applications')
          .select(`
            *,
            jobs:job_id (
              id,
              title,
              company_name,
              location
            )
          `)
          .eq('applicant_id', user.id)
          .order('created_at', { ascending: false });

        if (!mounted) return;

        setApplications(apps || []);
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

  // Calculate stats
  const totalApplications = applications.length;
  const interviewsCount = applications.filter((a) => a.status === 'interviewed').length;
  const shortlistedCount = applications.filter((a) => a.status === 'shortlisted').length;
  const offersCount = applications.filter((a) => a.status === 'hired').length;
  const recentApplications = applications.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Applications Sent"
          value={totalApplications}
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Shortlisted"
          value={shortlistedCount}
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
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Interviews"
          value={interviewsCount}
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
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Offers"
          value={offersCount}
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
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-4">
        <Link
          href="/dashboard/job-seeker/browse"
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
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Browse Jobs
        </Link>
        <Link
          href="/dashboard/job-seeker/applications"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          View All Applications
        </Link>
        <Link
          href="/dashboard/job-seeker/profile"
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          Edit Profile
        </Link>
      </div>

      {/* Recent Applications */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Recent Applications
          </h2>
          <Link
            href="/dashboard/job-seeker/applications"
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-gray-400 mb-4">No applications yet.</p>
            <Link
              href="/dashboard/job-seeker/browse"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Start Exploring Jobs
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {recentApplications.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-white">
                    {app.jobs?.title || 'Job'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {app.jobs?.company_name || 'Company'} •{' '}
                    {app.jobs?.location || 'Location not specified'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Applied {new Date(app.created_at).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skill Up Quick Action Card */}
      <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl p-6 border border-blue-700/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-xl">
              <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Skill Up</h3>
              <p className="text-sm text-gray-300">Learn new skills with micro-courses to boost your career</p>
            </div>
          </div>
          <Link
            href="/dashboard/skillup"
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Start Learning
          </Link>
        </div>
      </div>

      {/* Tips Section */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold text-white mb-4">
          Tips for Success
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center mb-3">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">
              Keep Resume Updated
            </h3>
            <p className="text-sm text-gray-400">
              Make sure your resume reflects your latest experience and skills.
            </p>
          </div>
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center mb-3">
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">
              Personalize Applications
            </h3>
            <p className="text-sm text-gray-400">
              Tailor your cover letter to each job for better results.
            </p>
          </div>
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center mb-3">
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
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            <h3 className="font-medium text-white mb-1">Stay Active</h3>
            <p className="text-sm text-gray-400">
              Check back regularly for new opportunities matching your profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
