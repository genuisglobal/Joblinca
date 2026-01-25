import { createServerSupabaseClient } from '@/lib/supabase/server';
import Link from 'next/link';
import JobsTable from './JobsTable';

interface PageProps {
  searchParams: Promise<{ status?: string; search?: string }>;
}

export default async function AdminJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = createServerSupabaseClient();
  const status = params.status || 'all';

  // Build query based on status filter
  let query = supabase
    .from('jobs')
    .select(
      `
      id,
      title,
      company_name,
      location,
      approval_status,
      published,
      created_at,
      posted_by,
      recruiter_id,
      rejection_reason,
      profiles:posted_by (
        id,
        full_name,
        first_name,
        last_name,
        email
      )
    `
    )
    .order('created_at', { ascending: false });

  if (status !== 'all') {
    query = query.eq('approval_status', status);
  }

  const { data: rawJobs, error } = await query;

  // ✅ Normalize "profiles" to be a single object (not an array)
  const jobs =
    (rawJobs ?? []).map((job: any) => ({
      ...job,
      profiles: Array.isArray(job.profiles) ? job.profiles[0] ?? null : job.profiles ?? null,
    })) ?? [];

  // Get counts for tabs
  const [pendingCount, approvedCount, rejectedCount, allCount] = await Promise.all([
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('approval_status', 'approved'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('approval_status', 'rejected'),
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
  ]);

  const counts = {
    pending: pendingCount.count ?? 0,
    approved: approvedCount.count ?? 0,
    rejected: rejectedCount.count ?? 0,
    all: allCount.count ?? 0,
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Management</h1>
          <p className="text-gray-400 mt-1">Review, approve, or reject job postings</p>
        </div>
        <Link
          href="/admin/jobs/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Job
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6">
        <StatusTab href="/admin/jobs" label="All" count={counts.all} active={status === 'all'} />
        <StatusTab
          href="/admin/jobs?status=pending"
          label="Pending"
          count={counts.pending}
          active={status === 'pending'}
          color="yellow"
        />
        <StatusTab
          href="/admin/jobs?status=approved"
          label="Approved"
          count={counts.approved}
          active={status === 'approved'}
          color="green"
        />
        <StatusTab
          href="/admin/jobs?status=rejected"
          label="Rejected"
          count={counts.rejected}
          active={status === 'rejected'}
          color="red"
        />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
          <p className="text-red-400">Error loading jobs: {error.message}</p>
        </div>
      )}

      {/* ✅ Jobs Table */}
      <JobsTable jobs={jobs} />
    </div>
  );
}

function StatusTab({
  href,
  label,
  count,
  active,
  color,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  color?: 'yellow' | 'green' | 'red';
}) {
  const baseClasses = 'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2';
  const activeClasses = active
    ? 'bg-gray-700 text-white'
    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white';

  const countColors = {
    yellow: 'bg-yellow-900/50 text-yellow-400',
    green: 'bg-green-900/50 text-green-400',
    red: 'bg-red-900/50 text-red-400',
  };

  return (
    <Link href={href} className={`${baseClasses} ${activeClasses}`}>
      {label}
      <span
        className={`px-2 py-0.5 text-xs rounded-full ${
          color ? countColors[color] : 'bg-gray-600 text-gray-300'
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
