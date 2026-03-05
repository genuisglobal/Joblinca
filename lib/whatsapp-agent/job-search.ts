import { createServiceSupabaseClient } from '@/lib/supabase/service';

const jobSearchDb = createServiceSupabaseClient();

export type TimeFilter = '24h' | '7d' | '30d';

export interface SearchJobsInput {
  location: string;
  roleKeywords: string;
  timeFilter: TimeFilter;
  offset: number;
  limit: number;
}

export interface SearchJobRow {
  id: string;
  public_id: string | null;
  title: string | null;
  location: string | null;
  salary: number | null;
  company_name: string | null;
  description: string | null;
  apply_method: string | null;
  external_apply_url: string | null;
  apply_email: string | null;
  apply_phone: string | null;
  apply_whatsapp: string | null;
  created_at: string;
  closes_at: string | null;
  recruiter_id: string;
  hiring_tier: string | null;
}

function toSinceIso(timeFilter: TimeFilter): string {
  const now = Date.now();
  if (timeFilter === '24h') {
    return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }
  if (timeFilter === '7d') {
    return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function safeSearchTerm(value: string): string {
  return value
    .replace(/[%(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatSalary(salary: number | null): string {
  if (salary === null || Number.isNaN(salary)) return 'N/A';
  return `${Math.round(salary).toLocaleString('en-US')} XAF`;
}

function clip(value: string | null, max = 220): string {
  if (!value) return 'No description provided.';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

export async function searchPublishedJobs(input: SearchJobsInput): Promise<{
  jobs: SearchJobRow[];
  total: number;
}> {
  const limit = Math.max(1, Math.min(25, input.limit));
  const offset = Math.max(0, input.offset);
  const sinceIso = toSinceIso(input.timeFilter);
  const roleTerm = safeSearchTerm(input.roleKeywords);
  const locationTerm = safeSearchTerm(input.location);

  let query = jobSearchDb
    .from('jobs')
    .select(
      'id, public_id, title, location, salary, company_name, description, apply_method, external_apply_url, apply_email, apply_phone, apply_whatsapp, created_at, closes_at, recruiter_id, hiring_tier',
      { count: 'exact' }
    )
    .eq('published', true)
    .eq('approval_status', 'approved')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (locationTerm) {
    query = query.ilike('location', `%${locationTerm}%`);
  }

  if (roleTerm) {
    query = query.or(`title.ilike.%${roleTerm}%,description.ilike.%${roleTerm}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(`searchPublishedJobs failed: ${error.message}`);
  }

  const now = new Date();
  const jobs = ((data || []) as SearchJobRow[]).filter((job) => {
    if (!job.closes_at) return true;
    return new Date(job.closes_at) > now;
  });

  return {
    jobs,
    total: count || 0,
  };
}

export async function getJobByPublicId(publicId: string): Promise<SearchJobRow | null> {
  const normalized = publicId.trim().toUpperCase();
  const { data, error } = await jobSearchDb
    .from('jobs')
    .select(
      'id, public_id, title, location, salary, company_name, description, apply_method, external_apply_url, apply_email, apply_phone, apply_whatsapp, created_at, closes_at, recruiter_id, hiring_tier'
    )
    .eq('public_id', normalized)
    .eq('published', true)
    .eq('approval_status', 'approved')
    .maybeSingle();

  if (error || !data) return null;
  const job = data as SearchJobRow;

  const isOpen = !job.closes_at || new Date(job.closes_at) > new Date();
  if (!isOpen) {
    return null;
  }

  return job;
}

export function formatJobBatchMessage(params: {
  jobs: SearchJobRow[];
  visibleCount: number;
  lockedCount: number;
  hasMore: boolean;
  subscribed: boolean;
}): string {
  const lines: string[] = [];
  const visibleJobs = params.jobs.slice(0, params.visibleCount);

  if (visibleJobs.length === 0) {
    return 'No jobs found for that filter. Reply MENU to try a new search.';
  }

  lines.push(`Jobs (${visibleJobs.length}${params.lockedCount > 0 ? ` + ${params.lockedCount} locked` : ''})`);
  lines.push('');

  for (const job of visibleJobs) {
    lines.push(
      `${job.public_id || job.id.slice(0, 8)} | ${job.title || 'Untitled'} | ${job.location || 'N/A'} | ${formatSalary(job.salary)}`
    );
  }

  if (params.lockedCount > 0) {
    lines.push('');
    for (let i = 0; i < params.lockedCount; i += 1) {
      lines.push('LOCKED JOB | Subscribe / Visit website');
    }
  }

  lines.push('');
  lines.push('Reply NEXT for more.');
  lines.push('Reply DETAILS <JobID> for details.');
  lines.push('Reply APPLY <JobID> to apply.');

  if (!params.subscribed && params.lockedCount > 0) {
    lines.push('Free limit reached. Subscribe on website for full access.');
  }

  if (!params.hasMore) {
    lines.push('No more results in this search.');
  }

  return lines.join('\n');
}

export function formatJobDetailsMessage(job: SearchJobRow): string {
  const lines: string[] = [];
  lines.push(`Job ${job.public_id || job.id}`);
  lines.push(`${job.title || 'Untitled role'} at ${job.company_name || 'Unknown company'}`);
  lines.push(`Location: ${job.location || 'N/A'}`);
  lines.push(`Salary: ${formatSalary(job.salary)}`);
  lines.push('');
  lines.push(clip(job.description, 320));
  lines.push('');
  lines.push(`APPLY ${job.public_id || job.id}`);
  return lines.join('\n');
}

export function isScreeningEnabledForJob(job: SearchJobRow): boolean {
  if (!job.hiring_tier) return false;
  return ['tier2_shortlist', 'tier3_managed', 'tier4_partner'].includes(job.hiring_tier);
}
