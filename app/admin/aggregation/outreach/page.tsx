import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatShortDate,
  isMissingAggregationRelationError,
} from '@/lib/aggregation/admin';
import { LogOutreachButton, StatusBadge, SourceFilter } from './OutreachActions';

type OutreachFilter = 'all' | 'new' | 'queued' | 'contacted' | 'responded';

type DiscoveredJobWithContact = {
  id: string;
  title: string;
  company_name: string | null;
  source_name: string;
  location: string | null;
  original_job_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  recruiter_name: string | null;
  trust_score: number;
  ingestion_status: string;
  discovered_at: string;
  posted_at: string | null;
  expires_at: string | null;
};

type OutreachLead = {
  id: string;
  discovered_job_id: string;
  status: string;
  channel: string;
  notes: string | null;
  last_contact_at: string | null;
  seeker_count: number;
  created_at: string;
};

const filterLabels: Record<OutreachFilter, string> = {
  all: 'All with Contacts',
  new: 'Not Contacted',
  queued: 'Queued',
  contacted: 'Contacted',
  responded: 'Responded',
};

function normalizeFilter(value: string | undefined): OutreachFilter {
  if (value === 'new' || value === 'queued' || value === 'contacted' || value === 'responded') {
    return value;
  }
  return 'all';
}

export default async function OutreachPage({
  searchParams,
}: {
  searchParams?: { filter?: string; source?: string; search?: string };
}) {
  const filter = normalizeFilter(searchParams?.filter);
  const sourceFilter = searchParams?.source || '';
  const searchQuery = searchParams?.search || '';

  const supabase = createServerSupabaseClient();

  // Fetch discovered jobs with contact info
  let query = supabase
    .from('discovered_jobs')
    .select(
      `
      id,
      title,
      company_name,
      source_name,
      location,
      original_job_url,
      contact_email,
      contact_phone,
      contact_whatsapp,
      recruiter_name,
      trust_score,
      ingestion_status,
      discovered_at,
      posted_at,
      expires_at
      `
    )
    .or('contact_email.not.is.null,contact_phone.not.is.null,contact_whatsapp.not.is.null')
    .order('discovered_at', { ascending: false })
    .limit(200);

  if (sourceFilter) {
    query = query.eq('source_name', sourceFilter);
  }

  if (searchQuery) {
    query = query.or(
      `title.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%,contact_email.ilike.%${searchQuery}%`
    );
  }

  const { data, error } = await query;
  const migrationMissing = isMissingAggregationRelationError(error);
  const jobs = (data || []) as DiscoveredJobWithContact[];

  // Fetch outreach leads for these jobs
  const jobIds = jobs.map((j) => j.id);
  let leadsMap: Record<string, OutreachLead> = {};

  if (jobIds.length > 0) {
    const { data: leadsData } = await supabase
      .from('recruiter_outreach_leads')
      .select('id, discovered_job_id, status, channel, notes, last_contact_at, seeker_count, created_at')
      .in('discovered_job_id', jobIds);

    if (leadsData) {
      for (const lead of leadsData as OutreachLead[]) {
        leadsMap[lead.discovered_job_id] = lead;
      }
    }
  }

  // Apply filter
  let filteredJobs = jobs;
  if (filter === 'new') {
    filteredJobs = jobs.filter((j) => !leadsMap[j.id]);
  } else if (filter === 'queued') {
    filteredJobs = jobs.filter((j) => leadsMap[j.id]?.status === 'queued');
  } else if (filter === 'contacted') {
    filteredJobs = jobs.filter((j) => leadsMap[j.id]?.status === 'contacted');
  } else if (filter === 'responded') {
    filteredJobs = jobs.filter((j) => leadsMap[j.id]?.status === 'responded');
  }

  // Get unique sources for filter
  const uniqueSources = [...new Set(jobs.map((j) => j.source_name))].sort();

  // Stats
  const totalWithContacts = jobs.length;
  const notContacted = jobs.filter((j) => !leadsMap[j.id]).length;
  const contacted = jobs.filter((j) => leadsMap[j.id]?.status === 'contacted').length;
  const responded = jobs.filter((j) => leadsMap[j.id]?.status === 'responded').length;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Recruiter Outreach</h1>
          <p className="text-gray-400 mt-1">
            Contact job posters about Joblinca candidates for externally scraped jobs.
          </p>
        </div>
        <Link
          href="/admin/aggregation"
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
        >
          Back to Control Room
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <p className="text-2xl font-bold text-white">{totalWithContacts}</p>
          <p className="text-sm text-gray-400">Jobs with Contacts</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <p className="text-2xl font-bold text-yellow-400">{notContacted}</p>
          <p className="text-sm text-gray-400">Not Contacted</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <p className="text-2xl font-bold text-blue-400">{contacted}</p>
          <p className="text-sm text-gray-400">Contacted</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <p className="text-2xl font-bold text-green-400">{responded}</p>
          <p className="text-sm text-gray-400">Responded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(filterLabels) as OutreachFilter[]).map((entry) => (
            <Link
              key={entry}
              href={`/admin/aggregation/outreach?filter=${entry}${sourceFilter ? `&source=${sourceFilter}` : ''}${searchQuery ? `&search=${searchQuery}` : ''}`}
              className={`rounded-full px-3 py-2 text-sm transition-colors ${
                entry === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {filterLabels[entry]}
            </Link>
          ))}
        </div>

        {uniqueSources.length > 1 && (
          <SourceFilter sources={uniqueSources} current={sourceFilter} filter={filter} search={searchQuery} />
        )}

        <form method="GET" action="/admin/aggregation/outreach" className="flex gap-2">
          <input type="hidden" name="filter" value={filter} />
          {sourceFilter && <input type="hidden" name="source" value={sourceFilter} />}
          <input
            name="search"
            defaultValue={searchQuery}
            placeholder="Search company or email..."
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 placeholder-gray-500 w-64"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
          >
            Search
          </button>
        </form>
      </div>

      {migrationMissing && (
        <div className="mb-6 rounded-xl border border-yellow-700 bg-yellow-900/20 p-4 text-yellow-200">
          Outreach schema is not available yet. Apply the latest migration first.
        </div>
      )}

      {!migrationMissing && error && (
        <div className="mb-6 rounded-xl border border-red-700 bg-red-900/20 p-4 text-red-200">
          Failed to load data: {error.message}
        </div>
      )}

      {/* Job table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="p-4 text-left text-gray-400 font-medium">Job / Company</th>
              <th className="p-4 text-left text-gray-400 font-medium">Contact Info</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden lg:table-cell">Source</th>
              <th className="p-4 text-left text-gray-400 font-medium hidden md:table-cell">Outreach Status</th>
              <th className="p-4 text-left text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredJobs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  No jobs with contacts found in the {filterLabels[filter].toLowerCase()} filter.
                </td>
              </tr>
            )}
            {filteredJobs.map((job) => {
              const lead = leadsMap[job.id] || null;
              return (
                <tr key={job.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                  <td className="p-4">
                    <p className="text-white font-medium text-sm">{job.title}</p>
                    <p className="text-sm text-gray-400">
                      {job.company_name || 'Unknown company'}
                    </p>
                    {job.location && (
                      <p className="text-xs text-gray-500">{job.location}</p>
                    )}
                    {job.original_job_url && (
                      <a
                        href={job.original_job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        View original
                      </a>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="space-y-1">
                      {job.contact_email && (
                        <a
                          href={`mailto:${job.contact_email}`}
                          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300"
                        >
                          <EmailIcon />
                          {job.contact_email}
                        </a>
                      )}
                      {job.contact_phone && (
                        <a
                          href={`tel:${job.contact_phone}`}
                          className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300"
                        >
                          <PhoneIcon />
                          {job.contact_phone}
                        </a>
                      )}
                      {job.contact_whatsapp && (
                        <a
                          href={`https://wa.me/${job.contact_whatsapp.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300"
                        >
                          <WhatsAppIcon />
                          {job.contact_whatsapp}
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="p-4 hidden lg:table-cell">
                    <span className="text-sm text-gray-300">{job.source_name}</span>
                    <p className="text-xs text-gray-500">
                      {formatShortDate(job.discovered_at)}
                    </p>
                  </td>
                  <td className="p-4 hidden md:table-cell">
                    <StatusBadge status={lead?.status} />
                    {lead?.notes && (
                      <p className="text-xs text-gray-500 mt-1 max-w-[200px] truncate" title={lead.notes}>
                        {lead.notes}
                      </p>
                    )}
                    {lead?.last_contact_at && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        Last: {formatShortDate(lead.last_contact_at)}
                      </p>
                    )}
                  </td>
                  <td className="p-4">
                    <LogOutreachButton
                      jobId={job.id}
                      outreach={lead ? {
                        id: lead.id,
                        status: lead.status,
                        channel: lead.channel,
                        notes: lead.notes || undefined,
                        seeker_count: lead.seeker_count,
                      } : null}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmailIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
