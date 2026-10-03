/**
 * External job aggregation helpers.
 *
 * This module provides functions to fetch job listings from third-party
 * providers and normalise them into a common shape. Results from these
 * functions can be stored in the `external_jobs` table via the API route
 * `/api/refresh-external-jobs`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchRemoteJobs } from '@/lib/remoteJobs';
import { LEGACY_EXTERNAL_FEED_RETIRING_SOURCE_SLUGS } from '@/lib/scrapers/catalog';
import { runAllScrapers, deduplicateJobs, deduplicateCrossSources } from '@/lib/scrapers/registry';
import type { ScrapedJob } from '@/lib/scrapers/types';
import {
  AI_TRAINING_CATEGORY,
  AI_TRAINING_OPENINGS_SOURCE,
  fetchAiTrainingOpenings,
  refileEligibleAiTrainingJobs,
} from '@/lib/ai-training-jobs';

export interface ExternalJob {
  external_id: string;
  source: string;
  title: string;
  company_name?: string | null;
  company_logo?: string | null;
  location?: string | null;
  salary?: string | null;
  job_type?: string | null;
  category?: string | null;
  description?: string | null;
  url: string;
  fetched_at?: string;
}

export const LEGACY_EXTERNAL_FEED_RETIRING_SOURCES =
  LEGACY_EXTERNAL_FEED_RETIRING_SOURCE_SLUGS;

// ───────────────────────────────────────────────
// Smart category derivation from text signals
// ───────────────────────────────────────────────

const CATEGORY_RULES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['software', 'developer', 'engineer', 'frontend', 'backend', 'fullstack', 'full-stack', 'devops', 'sre', 'cloud', 'data engineer', 'machine learning', 'ml ', 'ai ', 'python', 'javascript', 'typescript', 'react', 'node', 'java', 'golang', 'rust', 'kubernetes', 'aws', 'azure'], category: 'Engineering' },
  { keywords: ['product manager', 'product owner', 'scrum', 'agile', 'program manager'], category: 'Product' },
  { keywords: ['design', 'ux', 'ui ', 'figma', 'graphic', 'creative', 'illustrator', 'visual'], category: 'Design' },
  { keywords: ['marketing', 'seo', 'content', 'social media', 'growth', 'digital marketing', 'copywriter', 'brand'], category: 'Marketing' },
  { keywords: ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'revenue'], category: 'Sales' },
  { keywords: ['customer support', 'customer success', 'customer service', 'helpdesk', 'help desk', 'support specialist', 'support engineer'], category: 'Customer Support' },
  { keywords: ['teacher', 'teaching', 'tutor', 'educator', 'instructor', 'esl', 'education'], category: 'Teaching' },
  { keywords: ['finance', 'accounting', 'accountant', 'bookkeeper', 'controller', 'audit', 'tax'], category: 'Finance' },
  { keywords: ['human resources', 'hr ', 'recruiter', 'recruiting', 'talent acquisition', 'people ops'], category: 'HR & Recruiting' },
  { keywords: ['data analyst', 'data scientist', 'analytics', 'business intelligence', 'tableau', 'power bi', 'sql analyst'], category: 'Data & Analytics' },
  { keywords: ['project manager', 'operations', 'coordinator', 'logistics', 'admin', 'office manager'], category: 'Operations' },
  { keywords: ['writer', 'editor', 'journalist', 'technical writer', 'documentation', 'content writer'], category: 'Writing' },
  { keywords: ['qa', 'quality assurance', 'tester', 'test engineer', 'automation test'], category: 'QA & Testing' },
  { keywords: ['security', 'cybersecurity', 'infosec', 'penetration', 'compliance'], category: 'Security' },
  { keywords: ['visa', 'sponsorship', 'sponsor'], category: 'Visa Sponsorship' },
  { keywords: ['intern', 'internship', 'trainee', 'apprentice', 'junior', 'entry level', 'entry-level', 'graduate'], category: 'Internships & Entry Level' },
];

export function deriveCategory(title: string, industry?: string, description?: string): string {
  const text = `${title} ${industry || ''} ${description || ''}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        return rule.category;
      }
    }
  }

  // Fallback to industry if provided
  if (industry) return industry;

  return 'Other';
}

// ───────────────────────────────────────────────
// Provider: Remotive
// ───────────────────────────────────────────────

export async function fetchRemotiveExternalJobs(): Promise<ExternalJob[]> {
  try {
    const { jobs } = await fetchRemoteJobs();
    return jobs.map((job) => ({
      external_id: job.id.toString(),
      source: 'remotive',
      title: job.title,
      company_name: job.company_name,
      company_logo: job.company_logo || undefined,
      location: job.candidate_required_location,
      salary: job.salary || null,
      job_type: job.job_type,
      category: job.category || deriveCategory(job.title),
      description: undefined,
      url: job.url,
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ───────────────────────────────────────────────
// Provider: Jobicy
// ───────────────────────────────────────────────

export async function fetchJobicyExternalJobs(): Promise<ExternalJob[]> {
  try {
    const endpoint = 'https://jobicy.com/api/v2/remote-jobs?count=50';
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) return [];

    const data = await res.json();
    const jobs = data && Array.isArray(data.jobs) ? data.jobs : [];

    return jobs.map((job: any) => {
      const category = deriveCategory(job.jobTitle || '', job.jobIndustry || '', job.jobDescription || '');

      let salary: string | null = null;
      if (job.annualSalaryMin && job.annualSalaryMax) {
        const currency = job.salaryCurrency || '';
        salary = `${job.annualSalaryMin}\u2013${job.annualSalaryMax} ${currency}`.trim();
      }

      return {
        external_id: String(job.id),
        source: 'jobicy',
        title: job.jobTitle,
        company_name: job.companyName,
        company_logo: job.companyLogo || undefined,
        location: job.jobGeo || null,
        salary,
        job_type: job.jobType || null,
        category,
        description: undefined,
        url: job.url,
        fetched_at: new Date().toISOString(),
      } as ExternalJob;
    });
  } catch {
    return [];
  }
}

// ───────────────────────────────────────────────
// Provider: Findwork
// ───────────────────────────────────────────────

export async function fetchFindworkExternalJobs(): Promise<ExternalJob[]> {
  const apiKey = process.env.FINDWORK_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://findwork.dev/api/jobs/?search=remote&sort_by=relevance', {
      headers: { Authorization: `Token ${apiKey}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const jobs = Array.isArray(data.results) ? data.results : [];

    return jobs.map((job: any) => ({
      external_id: String(job.id),
      source: 'findwork',
      title: job.role || job.title || 'Untitled',
      company_name: job.company_name || null,
      company_logo: job.company_logo || undefined,
      location: job.location || 'Remote',
      salary: null,
      job_type: job.employment_type || null,
      category: deriveCategory(job.role || job.title || '', '', job.text || ''),
      description: undefined,
      url: job.url,
      fetched_at: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('Failed to fetch Findwork jobs', err);
    return [];
  }
}

// ───────────────────────────────────────────────
// Provider: RemoteOK
// ───────────────────────────────────────────────

const EXTERNAL_PROVIDER_USER_AGENT =
  'Joblinca/1.0 (Cameroon Job Aggregator; contact@joblinca.com)';

export async function fetchRemoteOkExternalJobs(): Promise<ExternalJob[]> {
  try {
    const res = await fetch('https://remoteok.com/api', {
      headers: { 'User-Agent': EXTERNAL_PROVIDER_USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    // The first element is RemoteOK's API terms notice, not a job -- it has
    // no `id`/`position`, so filtering on those also skips it.
    return data
      .filter((job: any) => job && job.id && job.position)
      .map((job: any) => {
        const salary =
          job.salary_min && job.salary_max
            ? `$${Number(job.salary_min).toLocaleString()}–$${Number(job.salary_max).toLocaleString()}`
            : null;

        return {
          external_id: String(job.id),
          source: 'remoteok',
          title: job.position,
          company_name: job.company || null,
          company_logo: job.company_logo || job.logo || undefined,
          location: job.location || 'Worldwide',
          salary,
          job_type: Array.isArray(job.tags) ? job.tags.slice(0, 3).join(', ') : null,
          category: deriveCategory(job.position, '', job.description || ''),
          description: undefined,
          url: job.url || job.apply_url,
          fetched_at: new Date().toISOString(),
        } as ExternalJob;
      });
  } catch (err) {
    console.error('Failed to fetch RemoteOK jobs', err);
    return [];
  }
}

// ───────────────────────────────────────────────
// Provider: Arbeitnow (remote-flagged subset only)
// ───────────────────────────────────────────────
//
// Arbeitnow's board is mostly on-site German listings; only jobs with
// `remote: true` belong in a global-jobs feed, and those are sparse and
// scattered across pages (observed ~0-11% per page), so this paginates
// until it has a decent batch or hits the page cap -- rather than a single
// fetch like the other providers here, which would often return zero.

export async function fetchArbeitnowExternalJobs(): Promise<ExternalJob[]> {
  const jobs: ExternalJob[] = [];
  const MAX_PAGES = 8;
  const TARGET_COUNT = 60;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
        headers: { 'User-Agent': EXTERNAL_PROVIDER_USER_AGENT },
        next: { revalidate: 3600 },
      });
      if (!res.ok) break;

      const data = await res.json();
      const pageJobs = Array.isArray(data?.data) ? data.data : [];
      if (pageJobs.length === 0) break;

      for (const job of pageJobs) {
        if (!job.remote) continue;
        jobs.push({
          external_id: job.slug,
          source: 'arbeitnow',
          title: job.title,
          company_name: job.company_name || null,
          company_logo: undefined,
          location: job.location || 'Remote',
          salary: null,
          // Descriptions here are frequently German -- deriveCategory's
          // keyword list is English-oriented, so title-only avoids spurious
          // matches (same reasoning as the Cameroon providers skipping
          // French description text).
          job_type: Array.isArray(job.job_types) ? job.job_types.join(', ') : null,
          category: deriveCategory(job.title),
          description: undefined,
          url: job.url,
          fetched_at: new Date().toISOString(),
        });
      }

      if (jobs.length >= TARGET_COUNT || !data?.links?.next) break;
    }
  } catch (err) {
    console.error('Failed to fetch Arbeitnow jobs', err);
  }

  return jobs;
}

// ───────────────────────────────────────────────
// Curated: AI training & data-annotation platforms
// ───────────────────────────────────────────────
//
// These are worker marketplaces (sign up once, get assigned tasks), not job
// boards with individual postings, so there's nothing to scrape -- this is a
// small hand-curated, hand-verified list rather than a live provider. Each
// entry is reviewed for actual Cameroon/Africa eligibility (DataAnnotation.tech
// and similar US/UK/CA/AU/NZ-only platforms are deliberately excluded).
// Refresh this list occasionally -- eligibility and URLs do change.

interface AiTrainingPlatform {
  slug: string;
  platform: string;
  headline: string;
  eligibility: string;
  workType: string;
  url: string;
}

const AI_TRAINING_PLATFORMS: AiTrainingPlatform[] = [
  {
    slug: 'isahit',
    platform: 'Isahit',
    headline: "Join Isahit's AI & data annotation community",
    eligibility: 'Built for Francophone & developing-world workers',
    workType: 'Freelance · flexible hours',
    url: 'https://www.isahit.com/work-for-us',
  },
  {
    slug: 'appen',
    platform: 'Appen (CrowdGen)',
    headline: 'Become an Appen / CrowdGen crowd contributor',
    eligibility: '170+ countries — broadest reach',
    workType: 'Freelance · task-based',
    url: 'https://crowd.appen.com/',
  },
  {
    slug: 'telus-digital-ai',
    platform: 'TELUS Digital AI Community',
    headline: 'Get matched to AI data projects with TELUS Digital',
    eligibility: '100+ countries, 500+ languages',
    workType: 'Freelance · flexible hours',
    url: 'https://www.telusinternational.ai/',
  },
  {
    slug: 'outlier',
    platform: 'Outlier (Scale AI)',
    headline: 'Train AI models as an Outlier contributor',
    eligibility: '100+ countries',
    workType: 'Freelance · task-based',
    url: 'https://outlier.ai',
  },
  {
    slug: 'clickworker',
    platform: 'Clickworker',
    headline: 'Complete AI training & data tasks with Clickworker',
    eligibility: 'Global — registration opens/closes per country by demand',
    workType: 'Freelance · micro-tasks',
    url: 'https://www.clickworker.com',
  },
  {
    // RWS's individual TrainAI postings are almost all city/country-locked
    // (filtered out of the live feed), but its standing talent pool is an
    // open application for a "global talent network".
    slug: 'rws-trainai',
    platform: 'RWS TrainAI',
    headline: 'Join the RWS TrainAI global talent pool',
    eligibility: 'Global talent pool — open application',
    workType: 'Freelance · project-based',
    url: 'https://jobs.lever.co/rws',
  },
];

export { AI_TRAINING_CATEGORY };

async function fetchAiTrainingPlatformJobs(): Promise<ExternalJob[]> {
  return AI_TRAINING_PLATFORMS.map((p) => ({
    external_id: p.slug,
    source: p.slug,
    title: p.headline,
    company_name: p.platform,
    company_logo: undefined,
    location: p.eligibility,
    salary: null,
    job_type: p.workType,
    category: AI_TRAINING_CATEGORY,
    description: undefined,
    url: p.url,
    fetched_at: new Date().toISOString(),
  }));
}

// ───────────────────────────────────────────────
// Provider: Upwork (placeholder - requires OAuth)
// ───────────────────────────────────────────────

export async function fetchUpworkExternalJobs(): Promise<ExternalJob[]> {
  const clientId = process.env.UPWORK_CLIENT_ID;
  const clientSecret = process.env.UPWORK_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  try {
    // TODO: Implement OAuth flow when approved for Upwork access
    return [];
  } catch (err) {
    console.error('Failed to fetch Upwork jobs', err);
    return [];
  }
}

// ───────────────────────────────────────────────
// Aggregate all providers (remote + Cameroon local)
// ───────────────────────────────────────────────

type FeedProvider = {
  fetch: () => Promise<ExternalJob[]>;
  /**
   * Set when the provider owns exactly one source and a successful run is a
   * complete picture of it. Replacing is per source, and a source that
   * returns no jobs is otherwise left untouched — fine for big feeds, wrong
   * for a handful of openings that close daily (a closed posting would stay
   * listed with a dead link).
   */
  authoritativeSource?: string;
};

const EXTERNAL_FEED_PROVIDERS: FeedProvider[] = [
  { fetch: fetchRemotiveExternalJobs },
  { fetch: fetchJobicyExternalJobs },
  { fetch: fetchFindworkExternalJobs },
  { fetch: fetchRemoteOkExternalJobs },
  { fetch: fetchArbeitnowExternalJobs },
  { fetch: fetchAiTrainingPlatformJobs },
  { fetch: fetchAiTrainingOpenings, authoritativeSource: AI_TRAINING_OPENINGS_SOURCE },
  { fetch: fetchUpworkExternalJobs },
];

/**
 * Fetch the public legacy external feed, plus which authoritative sources
 * completed (and may therefore be cleared when they returned nothing).
 *
 * Cameroon aggregation sources should flow through discovered_jobs and the
 * aggregation pipeline, not back into external_jobs.
 */
export async function fetchExternalFeedJobsWithStatus(): Promise<{
  jobs: ExternalJob[];
  completedAuthoritativeSources: string[];
}> {
  const results: ExternalJob[] = [];
  const completedAuthoritativeSources: string[] = [];

  for (const provider of EXTERNAL_FEED_PROVIDERS) {
    try {
      const jobs = await provider.fetch();
      results.push(...jobs);
      if (provider.authoritativeSource) completedAuthoritativeSources.push(provider.authoritativeSource);
    } catch (err) {
      console.error('Failed to fetch external feed jobs from provider', provider.fetch.name, err);
    }
  }

  // AI-training postings that arrive through the general remote feeds and
  // pass the Cameroon eligibility rules belong in the AI tab too.
  return { jobs: refileEligibleAiTrainingJobs(results), completedAuthoritativeSources };
}

export async function fetchExternalFeedJobs(): Promise<ExternalJob[]> {
  return (await fetchExternalFeedJobsWithStatus()).jobs;
}

export async function clearRetiredExternalFeedSources(supabase: SupabaseClient) {
  const { error } = await supabase
    .from('external_jobs')
    .delete()
    .in('source', [...LEGACY_EXTERNAL_FEED_RETIRING_SOURCES]);

  if (error) {
    throw error;
  }
}

export async function replaceExternalJobsBySource(
  supabase: SupabaseClient,
  jobs: ExternalJob[],
  options: {
    /** Sources whose provider completed; cleared even when they returned no jobs. */
    clearIfEmpty?: string[];
  } = {},
) {
  let inserted = 0;
  let errors = 0;
  const bySource = new Map<string, ExternalJob[]>();

  for (const job of jobs) {
    const sourceJobs = bySource.get(job.source) || [];
    sourceJobs.push(job);
    bySource.set(job.source, sourceJobs);
  }

  // An empty entry runs the delete below with nothing to insert.
  for (const source of options.clearIfEmpty ?? []) {
    if (!bySource.has(source)) bySource.set(source, []);
  }

  for (const [source, sourceJobs] of bySource) {
    const { error: deleteError } = await supabase
      .from('external_jobs')
      .delete()
      .eq('source', source);

    if (deleteError) {
      console.error(`[externalJobs] Delete ${source} error:`, deleteError.message);
      errors += sourceJobs.length;
      continue;
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < sourceJobs.length; i += BATCH_SIZE) {
      const batch = sourceJobs.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabase
        .from('external_jobs')
        .insert(batch);

      if (insertError) {
        console.error(`[externalJobs] Insert ${source} batch error:`, insertError.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }
  }

  return {
    inserted,
    errors,
    sources: Object.fromEntries(
      [...bySource.entries()].map(([source, sourceJobs]) => [source, sourceJobs.length])
    ) as Record<string, number>,
  };
}

/** Convert a ScrapedJob (from Cameroon scrapers) to ExternalJob for DB insertion. */
function scrapedToExternal(job: ScrapedJob): ExternalJob {
  return {
    external_id: job.external_id,
    source: job.source,
    title: job.title,
    company_name: job.company_name,
    company_logo: job.company_logo,
    location: job.location,
    salary: job.salary,
    job_type: job.job_type,
    category: job.category,
    description: job.description,
    url: job.url,
    fetched_at: job.fetched_at,
    // Extra fields for Cameroon jobs (stored if DB columns exist)
    ...(job.region ? { region: job.region } : {}),
    ...(job.language ? { language: job.language } : {}),
    ...(job.is_cameroon_local ? { is_cameroon_local: job.is_cameroon_local } : {}),
    ...(job.posted_at ? { posted_at: job.posted_at } : {}),
    ...(job.closing_at ? { closing_at: job.closing_at } : {}),
  } as ExternalJob;
}

export async function fetchAllExternalJobs(): Promise<ExternalJob[]> {
  const results = await fetchExternalFeedJobs();

  // 2. Cameroon local scrapers from the shared scraper catalog.
  try {
    console.log('[externalJobs] Running Cameroon scrapers...');
    const aggregate = await runAllScrapers();
    const sameSourceDeduped = deduplicateJobs(aggregate.results);

    // 3. Cross-source dedup (same job on multiple platforms)
    const crossDedup = deduplicateCrossSources(sameSourceDeduped);
    const cameroonJobs = crossDedup.unique.map(scrapedToExternal);
    results.push(...cameroonJobs);

    console.log(
      `[externalJobs] Cameroon scrapers: ${aggregate.total_jobs} raw → ${sameSourceDeduped.length} same-source deduped → ${crossDedup.unique.length} cross-source deduped (${crossDedup.stats.duplicates_removed} dupes removed) in ${aggregate.duration_ms}ms`
    );
  } catch (err) {
    console.error('[externalJobs] Cameroon scrapers failed:', err);
  }

  return results;
}
