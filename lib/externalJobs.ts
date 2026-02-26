/**
 * External job aggregation helpers.
 *
 * This module provides functions to fetch job listings from third-party
 * providers and normalise them into a common shape. Results from these
 * functions can be stored in the `external_jobs` table via the API route
 * `/api/refresh-external-jobs`.
 */

import { fetchRemoteJobs } from '@/lib/remoteJobs';

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
// Aggregate all providers
// ───────────────────────────────────────────────

export async function fetchAllExternalJobs(): Promise<ExternalJob[]> {
  const results: ExternalJob[] = [];
  const providers = [
    fetchRemotiveExternalJobs,
    fetchJobicyExternalJobs,
    fetchFindworkExternalJobs,
    fetchUpworkExternalJobs,
  ];

  for (const provider of providers) {
    try {
      const jobs = await provider();
      results.push(...jobs);
    } catch (err) {
      console.error('Failed to fetch external jobs from provider', provider.name, err);
    }
  }

  return results;
}
