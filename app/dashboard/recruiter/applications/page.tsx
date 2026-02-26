'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StatusBadge from '../../components/StatusBadge';
import StatsCard from '../../components/StatsCard';

interface Job {
  id: string;
  title: string;
  company_name: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  resume_url: string | null;
  recruiter_rating: number | null;
  tags: string[];
  viewed_at: string | null;
  is_pinned: boolean;
  ranking_score: number;
  jobs: Job;
  profiles: Profile;
}

type SortOption = 'newest' | 'oldest' | 'ranking' | 'rating';
type StatusFilter = 'all' | 'submitted' | 'shortlisted' | 'interviewed' | 'hired' | 'rejected';

const STATUS_OPTIONS: { value: StatusFilter; label: string; color: string }[] = [
  { value: 'all', label: 'All', color: 'gray' },
  { value: 'submitted', label: 'New', color: 'blue' },
  { value: 'shortlisted', label: 'Shortlisted', color: 'yellow' },
  { value: 'interviewed', label: 'Interviewing', color: 'purple' },
  { value: 'hired', label: 'Hired', color: 'green' },
  { value: 'rejected', label: 'Rejected', color: 'red' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'ranking', label: 'Best Match' },
  { value: 'rating', label: 'Highest Rated' },
];

export default function RecruiterApplicationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  // State
  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Filters from URL params
  const statusFilter = (searchParams.get('status') as StatusFilter) || 'all';
  const jobFilter = searchParams.get('job') || 'all';
  const sortBy = (searchParams.get('sort') as SortOption) || 'newest';
  const searchQuery = searchParams.get('q') || '';

  // Stats counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: applications.length,
      submitted: 0,
      shortlisted: 0,
      interviewed: 0,
      hired: 0,
      rejected: 0,
    };
    applications.forEach((app) => {
      if (counts[app.status] !== undefined) {
        counts[app.status]++;
      }
    });
    return counts;
  }, [applications]);

  // Filter and sort applications
  const filteredApplications = useMemo(() => {
    let filtered = [...applications];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((app) => app.status === statusFilter);
    }

    // Job filter
    if (jobFilter !== 'all') {
      filtered = filtered.filter((app) => app.job_id === jobFilter);
    }

    // Search query (search in applicant name, job title)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((app) => {
        const applicantName = getApplicantName(app.profiles).toLowerCase();
        const jobTitle = app.jobs?.title?.toLowerCase() || '';
        return applicantName.includes(query) || jobTitle.includes(query);
      });
    }

    // Sort
    filtered.sort((a, b) => {
      // Pinned items always first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;

      switch (sortBy) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'ranking':
          return (b.ranking_score || 0) - (a.ranking_score || 0);
        case 'rating':
          return (b.recruiter_rating || 0) - (a.recruiter_rating || 0);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return filtered;
  }, [applications, statusFilter, jobFilter, sortBy, searchQuery]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace('/auth/login');
        return;
      }

      // Fetch recruiter's jobs
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('id, title, company_name')
        .eq('recruiter_id', user.id)
        .order('created_at', { ascending: false });

      setJobs(jobsData || []);

      // Fetch all applications for recruiter's jobs
      const jobIds = (jobsData || []).map((j) => j.id);

      if (jobIds.length === 0) {
        setApplications([]);
        setLoading(false);
        return;
      }

      const { data: appsData } = await supabase
        .from('applications')
        .select(
          `
          id,
          job_id,
          applicant_id,
          cover_letter,
          status,
          created_at,
          updated_at,
          resume_url,
          recruiter_rating,
          tags,
          viewed_at,
          is_pinned,
          ranking_score,
          jobs:job_id (
            id,
            title,
            company_name
          ),
          profiles:applicant_id (
            id,
            full_name,
            first_name,
            last_name,
            avatar_url
          )
        `
        )
        .in('job_id', jobIds)
        .neq('status', 'draft')
        .order('created_at', { ascending: false });

      const normalizedApps = (appsData || []).map((app: any) => ({
        ...app,
        jobs: Array.isArray(app.jobs) ? app.jobs[0] || null : app.jobs || null,
        profiles: Array.isArray(app.profiles) ? app.profiles[0] || null : app.profiles || null,
      }));

      setApplications(normalizedApps as Application[]);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load applications:', err);
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update URL params
  const updateFilters = useCallback(
    (params: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value && value !== 'all' && value !== 'newest' && value !== '') {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      });
      router.push(`/dashboard/recruiter/applications?${newParams.toString()}`);
    },
    [router, searchParams]
  );

  // Bulk status update
  const handleBulkStatusUpdate = async (newStatus: string) => {
    if (selectedIds.size === 0) return;

    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds);

      // Update each application
      for (const id of ids) {
        await fetch(`/api/applications/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      }

      // Refresh data
      await loadData();
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Bulk update failed:', err);
    } finally {
      setBulkUpdating(false);
    }
  };

  // Toggle selection
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Select all visible
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredApplications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredApplications.map((a) => a.id)));
    }
  };

  // Helper: get applicant name
  function getApplicantName(profile: Profile | null): string {
    if (!profile) return 'Unknown';
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || 'Anonymous';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-400">Loading applications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Applications</h1>
          <p className="text-gray-400 mt-1">
            Manage all applications across your job postings
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateFilters({ status: opt.value })}
            className={`text-left transition-all ${
              statusFilter === opt.value ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <StatsCard
              title={opt.label}
              value={statusCounts[opt.value] || 0}
              color={opt.color as 'blue' | 'green' | 'yellow' | 'red' | 'purple'}
            />
          </button>
        ))}
      </div>

      {/* Filters Bar */}
      <div className="bg-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
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
              <input
                type="text"
                placeholder="Search applicants or jobs..."
                value={searchQuery}
                onChange={(e) => updateFilters({ q: e.target.value })}
                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Job Filter */}
          <select
            value={jobFilter}
            onChange={(e) => updateFilters({ job: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Jobs</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => updateFilters({ sort: e.target.value })}
            className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700 flex items-center gap-4">
            <span className="text-sm text-gray-400">
              {selectedIds.size} selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBulkStatusUpdate('shortlisted')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 disabled:opacity-50"
              >
                Shortlist
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('interviewed')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Interview
              </button>
              <button
                onClick={() => handleBulkStatusUpdate('rejected')}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-sm text-gray-400 hover:text-white"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Applications List */}
      {filteredApplications.length === 0 ? (
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">
            {applications.length === 0
              ? 'No applications yet'
              : 'No matching applications'}
          </h3>
          <p className="text-gray-400 mb-6">
            {applications.length === 0
              ? 'Applications will appear here once candidates start applying to your jobs.'
              : 'Try adjusting your filters to see more results.'}
          </p>
          {applications.length > 0 && (
            <button
              onClick={() => router.push('/dashboard/recruiter/applications')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-gray-700 text-sm font-medium text-gray-400">
            <div className="col-span-1 flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredApplications.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="col-span-3">Applicant</div>
            <div className="col-span-3">Job</div>
            <div className="col-span-2">Applied</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1">Actions</div>
          </div>

          {/* Application Rows */}
          <div className="divide-y divide-gray-700/50">
            {filteredApplications.map((app) => (
              <div
                key={app.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-4 hover:bg-gray-700/30 transition-colors ${
                  app.is_pinned ? 'bg-yellow-900/10' : ''
                } ${!app.viewed_at ? 'bg-blue-900/10' : ''}`}
              >
                {/* Checkbox */}
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(app.id)}
                    onChange={() => toggleSelection(app.id)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Applicant */}
                <div className="col-span-3 flex items-center gap-3">
                  {app.profiles?.avatar_url ? (
                    <img
                      src={app.profiles.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                      {getApplicantName(app.profiles).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-white">
                      {getApplicantName(app.profiles)}
                      {!app.viewed_at && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">
                          New
                        </span>
                      )}
                      {app.is_pinned && (
                        <span className="ml-1 text-yellow-400">
                          <svg className="inline w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        </span>
                      )}
                    </p>
                    {app.recruiter_rating && (
                      <div className="flex mt-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg
                            key={star}
                            className={`w-3 h-3 ${
                              star <= app.recruiter_rating!
                                ? 'text-yellow-400'
                                : 'text-gray-600'
                            }`}
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Job */}
                <div className="col-span-3 flex items-center">
                  <div>
                    <p className="text-white">{app.jobs?.title || 'Unknown Job'}</p>
                    {app.jobs?.company_name && (
                      <p className="text-sm text-gray-400">{app.jobs.company_name}</p>
                    )}
                  </div>
                </div>

                {/* Applied Date */}
                <div className="col-span-2 flex items-center text-gray-400">
                  {new Date(app.created_at).toLocaleDateString()}
                </div>

                {/* Status */}
                <div className="col-span-2 flex items-center">
                  <StatusBadge status={app.status} />
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center">
                  <Link
                    href={`/dashboard/recruiter/applications/${app.id}`}
                    className="px-3 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
