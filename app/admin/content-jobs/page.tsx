import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import RunScrapersButton from '@/app/admin/aggregation/RunScrapersButton';
import ContentJobActions from './ContentJobActions';

type ContentStatus = 'not_started' | 'in_progress' | 'created' | 'skipped';
type SmartFilter = 'all' | 'needs_content' | 'scraped' | 'no_logo' | 'external_apply' | 'recent';

type ContentJob = {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  published: boolean;
  approval_status: string;
  created_at: string;
  company_logo_url: string | null;
  origin_type: string | null;
  external_apply_url: string | null;
  external_url: string | null;
  content_status: ContentStatus;
  content_marked_at: string | null;
  content_notes: string | null;
  content_owner: {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

const PAGE_SIZE = 50;
const contentStatuses: Array<{ value: ContentStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'created', label: 'Created' },
  { value: 'skipped', label: 'Skipped' },
];

const smartFilters: Array<{ value: SmartFilter; label: string }> = [
  { value: 'all', label: 'All Jobs' },
  { value: 'needs_content', label: 'Needs Content' },
  { value: 'scraped', label: 'Scraped' },
  { value: 'no_logo', label: 'Missing Logo' },
  { value: 'external_apply', label: 'External Apply' },
  { value: 'recent', label: 'Recent' },
];

function normalizeContentStatus(value: string | undefined): ContentStatus | 'all' {
  if (value === 'not_started' || value === 'in_progress' || value === 'created' || value === 'skipped') {
    return value;
  }
  return 'all';
}

function normalizeSmartFilter(value: string | undefined): SmartFilter {
  if (value === 'needs_content' || value === 'scraped' || value === 'no_logo' || value === 'external_apply' || value === 'recent') {
    return value;
  }
  return 'all';
}

function applyFilters<T>(
  query: T,
  filters: {
    status: ContentStatus | 'all';
    smart: SmartFilter;
    listing: string;
    approval: string;
    search: string;
  }
): T {
  const q = query as any;

  if (filters.status !== 'all') {
    q.eq('content_status', filters.status);
  }

  if (filters.listing === 'live') q.eq('published', true);
  if (filters.listing === 'unpublished') q.eq('published', false);
  if (filters.approval !== 'all') q.eq('approval_status', filters.approval);

  if (filters.smart === 'needs_content') {
    q.eq('published', true).neq('content_status', 'created');
  } else if (filters.smart === 'scraped') {
    q.in('origin_type', ['admin_import', 'scraped', 'external']);
  } else if (filters.smart === 'no_logo') {
    q.is('company_logo_url', null);
  } else if (filters.smart === 'external_apply') {
    q.not('external_apply_url', 'is', null);
  } else if (filters.smart === 'recent') {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    q.gte('created_at', since);
  }

  if (filters.search) {
    const safeSearch = filters.search.replace(/[%(),]/g, ' ').trim();
    if (safeSearch) {
      q.or(`title.ilike.%${safeSearch}%,company_name.ilike.%${safeSearch}%,location.ilike.%${safeSearch}%`);
    }
  }

  return query;
}

function statusBadgeClass(status: ContentStatus) {
  if (status === 'created') return 'bg-green-900/40 border-green-700 text-green-300';
  if (status === 'in_progress') return 'bg-blue-900/40 border-blue-700 text-blue-300';
  if (status === 'skipped') return 'bg-gray-700 border-gray-600 text-gray-300';
  return 'bg-yellow-900/40 border-yellow-700 text-yellow-300';
}

function statusLabel(status: ContentStatus) {
  return contentStatuses.find((entry) => entry.value === status)?.label || status;
}

function ownerName(job: ContentJob) {
  const owner = job.content_owner;
  if (!owner) return null;
  if (owner.first_name || owner.last_name) {
    return `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim();
  }
  return owner.full_name || owner.email;
}

export default async function AdminContentJobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    smart?: string;
    listing?: string;
    approval?: string;
    search?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const status = normalizeContentStatus(params.status);
  const smart = normalizeSmartFilter(params.smart);
  const listing = params.listing === 'live' || params.listing === 'unpublished' ? params.listing : 'all';
  const approval = params.approval === 'pending' || params.approval === 'approved' || params.approval === 'rejected' ? params.approval : 'all';
  const search = params.search?.trim() || '';
  const pageParam = Number(params.page);
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const supabase = createServerSupabaseClient();

  const filters = { status, smart, listing, approval, search };

  const countResults = await Promise.all(
    contentStatuses.map((entry) => {
      let countQuery = supabase.from('jobs').select('id', { count: 'exact', head: true });
      if (entry.value !== 'all') countQuery = countQuery.eq('content_status', entry.value);
      return countQuery;
    })
  );
  const counts = Object.fromEntries(
    contentStatuses.map((entry, index) => [entry.value, countResults[index].count ?? 0])
  ) as Record<ContentStatus | 'all', number>;

  const filteredCount = await applyFilters(
    supabase.from('jobs').select('id', { count: 'exact', head: true }),
    filters
  );

  const { data, error } = await applyFilters(
    supabase
      .from('jobs')
      .select(
        `
        id,
        title,
        company_name,
        location,
        published,
        approval_status,
        created_at,
        company_logo_url,
        origin_type,
        external_apply_url,
        external_url,
        content_status,
        content_marked_at,
        content_notes,
        content_owner:content_marked_by (
          full_name,
          first_name,
          last_name,
          email
        )
        `
      ),
    filters
  )
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const jobs = ((data || []) as any[]).map((job) => ({
    ...job,
    content_owner: Array.isArray(job.content_owner) ? job.content_owner[0] ?? null : job.content_owner ?? null,
  })) as ContentJob[];

  const total = filteredCount.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (next: Partial<typeof filters> & { page?: number }) => {
    const query = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextSmart = next.smart ?? smart;
    const nextListing = next.listing ?? listing;
    const nextApproval = next.approval ?? approval;
    const nextSearch = next.search ?? search;
    const nextPage = next.page ?? 1;

    if (nextStatus !== 'all') query.set('status', nextStatus);
    if (nextSmart !== 'all') query.set('smart', nextSmart);
    if (nextListing !== 'all') query.set('listing', nextListing);
    if (nextApproval !== 'all') query.set('approval', nextApproval);
    if (nextSearch) query.set('search', nextSearch);
    if (nextPage > 1) query.set('page', String(nextPage));

    const serialized = query.toString();
    return serialized ? `/admin/content-jobs?${serialized}` : '/admin/content-jobs';
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Jobs</h1>
          <p className="mt-1 text-gray-400">
            Create content from jobs, track handled listings, scrape sources, and publish vetted opportunities.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/jobs/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Post Job
          </Link>
          <Link href="/admin/aggregation/discovered-jobs" className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600">
            Publish Scraped
          </Link>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl bg-gray-800 p-4">
          <form className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px_120px]">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search title, company, or location"
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select name="listing" defaultValue={listing} className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white">
              <option value="all">All listings</option>
              <option value="live">Live</option>
              <option value="unpublished">Unpublished</option>
            </select>
            <select name="approval" defaultValue={approval} className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white">
              <option value="all">Any approval</option>
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
            </select>
            {status !== 'all' && <input type="hidden" name="status" value={status} />}
            {smart !== 'all' && <input type="hidden" name="smart" value={smart} />}
            <button className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600">
              Filter
            </button>
          </form>

          <div className="mb-4 flex flex-wrap gap-2">
            {contentStatuses.map((entry) => (
              <Link
                key={entry.value}
                href={hrefFor({ status: entry.value })}
                className={`rounded-full px-3 py-2 text-sm transition-colors ${
                  entry.value === status ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {entry.label}
                <span className={`ml-1.5 ${entry.value === status ? 'text-blue-200' : 'text-gray-500'}`}>
                  {counts[entry.value]}
                </span>
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {smartFilters.map((entry) => (
              <Link
                key={entry.value}
                href={hrefFor({ smart: entry.value })}
                className={`rounded-full px-3 py-2 text-sm transition-colors ${
                  entry.value === smart ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {entry.label}
              </Link>
            ))}
          </div>
        </div>

        <RunScrapersButton />
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-700 bg-red-900/20 p-4 text-red-200">
          Failed to load content jobs: {error.message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl bg-gray-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left font-medium text-gray-400">Job</th>
              <th className="hidden p-4 text-left font-medium text-gray-400 md:table-cell">Signals</th>
              <th className="p-4 text-left font-medium text-gray-400">Content</th>
              <th className="p-4 text-right font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr>
                <td colSpan={4} className="p-10 text-center text-gray-400">
                  No jobs match these filters.
                </td>
              </tr>
            )}
            {jobs.map((job) => {
              const owner = ownerName(job);
              return (
                <tr key={job.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <Link href={`/admin/jobs/${job.id}`} className="font-medium text-white hover:text-blue-400">
                      {job.title}
                    </Link>
                    <p className="text-sm text-gray-400">{job.company_name || 'Unknown company'}</p>
                    <p className="text-xs text-gray-500">{job.location || 'No location'} - {new Date(job.created_at).toLocaleDateString()}</p>
                    {(job.external_apply_url || job.external_url) && (
                      <a
                        href={job.external_apply_url || job.external_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-blue-400 hover:text-blue-300"
                      >
                        Original source
                      </a>
                    )}
                  </td>
                  <td className="hidden p-4 md:table-cell">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full border px-2 py-1 text-xs ${job.published ? 'border-green-700 bg-green-900/30 text-green-300' : 'border-gray-600 bg-gray-700 text-gray-300'}`}>
                        {job.published ? 'Live' : 'Unpublished'}
                      </span>
                      <span className="rounded-full border border-gray-600 bg-gray-700 px-2 py-1 text-xs text-gray-300">
                        {job.approval_status}
                      </span>
                      {job.origin_type && (
                        <span className="rounded-full border border-purple-700 bg-purple-900/30 px-2 py-1 text-xs text-purple-200">
                          {job.origin_type}
                        </span>
                      )}
                      {!job.company_logo_url && (
                        <span className="rounded-full border border-yellow-700 bg-yellow-900/30 px-2 py-1 text-xs text-yellow-300">
                          No logo
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-xs ${statusBadgeClass(job.content_status)}`}>
                      {statusLabel(job.content_status)}
                    </span>
                    {owner && (
                      <p className="mt-1 text-xs text-gray-400">
                        {owner}
                        {job.content_marked_at ? ` - ${new Date(job.content_marked_at).toLocaleDateString()}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="mb-2 flex justify-end gap-2">
                      <Link href={`/jobs/${job.id}`} className="rounded bg-gray-700 px-2.5 py-1 text-xs text-white hover:bg-gray-600">
                        Public
                      </Link>
                      <Link href={`/admin/jobs/${job.id}/edit`} className="rounded bg-gray-700 px-2.5 py-1 text-xs text-white hover:bg-gray-600">
                        Edit
                      </Link>
                    </div>
                    <ContentJobActions jobId={job.id} currentStatus={job.content_status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={hrefFor({ page: page - 1 })} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                Previous
              </Link>
            ) : (
              <span className="rounded-lg bg-gray-800/50 px-4 py-2 text-sm text-gray-600">Previous</span>
            )}
            <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
            {page < totalPages ? (
              <Link href={hrefFor({ page: page + 1 })} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700">
                Next
              </Link>
            ) : (
              <span className="rounded-lg bg-gray-800/50 px-4 py-2 text-sm text-gray-600">Next</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
