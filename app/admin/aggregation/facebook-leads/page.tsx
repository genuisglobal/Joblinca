import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { formatShortDate } from '@/lib/aggregation/admin';
import { LeadStatusSelect } from './LeadStatusSelect';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'contacted', 'responded', 'converted', 'not_relevant'] as const;
type LeadStatus = (typeof STATUSES)[number];

type PageLead = {
  id: string;
  page_url: string;
  name: string;
  categories: string[];
  intro: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  address: string | null;
  followers: number | null;
  recruiter_signal: boolean;
  status: LeadStatus;
  first_seen_at: string;
};

type LastRun = {
  kind: string;
  status: string;
  started_at: string;
  error: string | null;
  items_received: number | null;
  result_json: Record<string, unknown> | null;
};

/** One line saying what a processed run produced, e.g. "30 posts → 2 jobs · 25 not jobs". */
function runSummary(run: LastRun): string | null {
  const r = run.result_json;
  if (!r || typeof r !== 'object') return null;
  const n = (key: string) => (typeof r[key] === 'number' ? (r[key] as number) : null);
  const parts: string[] = [];
  if (run.kind === 'fb_groups') {
    parts.push(`${n('posts') ?? run.items_received ?? 0} posts → ${n('jobs_extracted') ?? 0} jobs`);
    if (n('non_job_posts')) parts.push(`${n('non_job_posts')} not jobs`);
    if (n('skipped_posts')) parts.push(`${n('skipped_posts')} too short`);
    if (n('failed_posts')) parts.push(`${n('failed_posts')} failed`);
  } else if (run.kind === 'fb_search') {
    parts.push(`${n('pages_found') ?? 0} Pages found, ${n('pages_queued') ?? 0} sent for details`);
  } else {
    parts.push(`${n('pages') ?? 0} Pages → ${n('leads_saved') ?? 0} leads`);
  }
  const reasons = r.outcome_reasons;
  if (reasons && typeof reasons === 'object') {
    const failures = Object.entries(reasons as Record<string, number>)
      .filter(([reason]) => !['not_job_post', 'text_too_short_and_no_images'].includes(reason))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([reason, count]) => `${count}× ${reason}`);
    if (failures.length) parts.push(failures.join(', '));
  }
  return parts.join(' · ');
}

function filterHref(status: string, recruitersOnly: boolean) {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (recruitersOnly) params.set('recruiters', '1');
  const qs = params.toString();
  return `/admin/aggregation/facebook-leads${qs ? `?${qs}` : ''}`;
}

export default async function FacebookLeadsPage({
  searchParams,
}: {
  searchParams?: { status?: string; recruiters?: string };
}) {
  try {
    await requireAdminType(['super', 'operations']);
  } catch {
    redirect('/admin');
  }

  const status = STATUSES.includes(searchParams?.status as LeadStatus)
    ? (searchParams!.status as LeadStatus)
    : 'all';
  const recruitersOnly = searchParams?.recruiters === '1';

  // Server-only tables (no client grants), read with the service role after
  // the admin check above.
  const supabase = createServiceSupabaseClient();
  let query = supabase
    .from('facebook_page_leads')
    .select(
      'id, page_url, name, categories, intro, email, phone, whatsapp, website, address, followers, recruiter_signal, status, first_seen_at',
    )
    .order('recruiter_signal', { ascending: false })
    .order('first_seen_at', { ascending: false })
    .limit(300);
  if (status !== 'all') query = query.eq('status', status);
  if (recruitersOnly) query = query.eq('recruiter_signal', true);

  const [{ data, error }, { data: runs }] = await Promise.all([
    query,
    supabase
      .from('apify_runs')
      .select('kind, status, started_at, error, items_received, result_json')
      .order('started_at', { ascending: false })
      .limit(10),
  ]);
  const leads = (data || []) as PageLead[];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Facebook Page leads</h1>
          <p className="mt-1 max-w-2xl text-gray-400">
            Recruitment agencies and hiring companies found on public Facebook business Pages
            each week. Contact details are what each Page publishes. Personal profiles are never
            collected.
          </p>
        </div>
        <Link
          href="/admin/aggregation/outreach"
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
        >
          Job-post contacts
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {(['all', ...STATUSES] as const).map((entry) => (
          <Link
            key={entry}
            href={filterHref(entry, recruitersOnly)}
            className={`rounded-full px-3 py-2 text-sm ${
              entry === status ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {entry.replace('_', ' ')}
          </Link>
        ))}
        <Link
          href={filterHref(status, !recruitersOnly)}
          className={`rounded-full px-3 py-2 text-sm ${
            recruitersOnly ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          Recruiters only
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-yellow-700 bg-yellow-900/20 p-4 text-yellow-200">
          Could not load leads ({error.message}). Has migration 20261108000100_facebook_apify_leads
          been applied?
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-700 bg-gray-800 p-4 text-sm text-gray-300">
          <p className="mb-2 font-medium text-white">Recent Apify runs</p>
          <ul className="space-y-1">
            {(runs as LastRun[]).map((run, i) => (
              <li key={i}>
                {formatShortDate(run.started_at)} · {run.kind} · {run.status}
                {run.status === 'processed' && runSummary(run) ? (
                  <span className="text-gray-400"> · {runSummary(run)}</span>
                ) : null}
                {run.error ? <span className="text-red-300"> · {run.error.slice(0, 120)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {leads.length === 0 && !error && (
          <p className="rounded-xl bg-gray-800 p-10 text-center text-gray-400">No leads in this view yet.</p>
        )}
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={lead.page_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-white hover:text-blue-300"
                >
                  {lead.name}
                </a>
                {lead.recruiter_signal && (
                  <span className="ml-2 rounded-full bg-emerald-900/60 px-2 py-0.5 text-xs text-emerald-300">
                    recruiter
                  </span>
                )}
                <p className="text-xs text-gray-500">
                  {[lead.categories.slice(0, 3).join(', '), lead.address, lead.followers ? `${lead.followers.toLocaleString()} followers` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <LeadStatusSelect id={lead.id} status={lead.status} />
            </div>
            {lead.intro && <p className="mt-2 line-clamp-2 text-sm text-gray-400">{lead.intro}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="text-green-400 hover:text-green-300">
                  {lead.email}
                </a>
              )}
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="text-yellow-400 hover:text-yellow-300">
                  {lead.phone}
                </a>
              )}
              {lead.whatsapp && (
                <a
                  href={`https://wa.me/${lead.whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  WhatsApp {lead.whatsapp}
                </a>
              )}
              {lead.website && (
                <a
                  href={/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-blue-400 hover:text-blue-300"
                >
                  {lead.website.replace(/^https?:\/\//i, '')}
                </a>
              )}
              <span className="text-gray-500">found {formatShortDate(lead.first_seen_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
