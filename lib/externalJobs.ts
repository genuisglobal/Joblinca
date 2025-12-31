/**
 * External job aggregation helpers.
 *
 * This module provides functions to fetch job listings from third‑party
 * providers and normalise them into a common shape.  Results from these
 * functions can be stored in the `external_jobs` table via the API route
 * `/api/refresh-external-jobs`.
 */

import { fetchRemoteJobs } from '@/lib/remoteJobs';

// A normalised representation of an external job.  These fields map
// directly onto the columns of the `external_jobs` table defined in the
// migration.  Additional properties returned by providers are discarded.
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

/**
 * Fetch jobs from the Remotive API and normalise them into ExternalJob
 * structures.  Remotive primarily provides remote jobs across a wide
 * variety of categories.  Only selected fields are kept.
 */
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
      category: job.category,
      description: undefined,
      url: job.url,
      fetched_at: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Placeholder for fetching jobs from Jobicy (remote jobs feed).  Jobicy
 * provides a JSON feed of remote jobs without authentication.  Once
 * integrated, this function should fetch the feed, normalise each job
 * and return an array of ExternalJob objects.  For now this returns an
 * empty array to avoid build errors.
 */
/**
 * Fetch jobs from the Jobicy remote jobs API.  Jobicy offers a public
 * JSON feed of remote vacancies across many industries.  The feed
 * supports optional query parameters such as `count`, `geo` and
 * `industry`; we request a reasonable number of listings (50) to
 * minimise network load.  Jobs are normalised into the ExternalJob
 * structure defined above.  If a job's title or industry suggests a
 * teaching role or visa sponsorship, the category field is set
 * accordingly.  Otherwise the job's industry is used as the category.
 *
 * See Jobicy API docs for response fields【335617390489077†L72-L125】.
 */
export async function fetchJobicyExternalJobs(): Promise<ExternalJob[]> {
  try {
    const endpoint = 'https://jobicy.com/api/v2/remote-jobs?count=50';
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    const jobs = (data && Array.isArray(data.jobs)) ? data.jobs : [];
    return jobs.map((job: any) => {
      // derive category based on keywords in the title/industry/description
      const text = `${job.jobTitle || ''} ${job.jobIndustry || ''} ${job.jobDescription || ''}`.toLowerCase();
      let category: string | null = null;
      if (text.includes('teacher') || text.includes('teaching') || text.includes('tutor') || text.includes('educator') || text.includes('instructor')) {
        category = 'Teaching';
      } else if (text.includes('visa') && text.includes('sponsor')) {
        category = 'Visa Sponsorship';
      } else if (text.includes('sponsorship')) {
        category = 'Visa Sponsorship';
      } else {
        category = job.jobIndustry || null;
      }
      // build salary range string if present
      let salary: string | null = null;
      if (job.annualSalaryMin && job.annualSalaryMax) {
        const currency = job.salaryCurrency || '';
        salary = `${job.annualSalaryMin}–${job.annualSalaryMax} ${currency}`;
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

/**
 * Placeholder for fetching jobs from Findwork.  Findwork requires an API
 * key and returns a JSON payload of jobs.  Integrate when API keys are
 * available.  For now this returns an empty array.
 */
export async function fetchFindworkExternalJobs(): Promise<ExternalJob[]> {
  // TODO: implement fetch from Findwork API
  return [];
}

/**
 * Placeholder for fetching jobs from Upwork.  Upwork’s public API
 * requires OAuth credentials (client ID and client secret) and is
 * intended for use by approved partners.  When integrating, you
 * should obtain API credentials from Upwork, implement the OAuth
 * flow to acquire a bearer token and then call the appropriate
 * endpoints to fetch job listings.  See Upwork’s API docs for
 * details: https://developers.upwork.com/
 *
 * To avoid breaking the build when no credentials are provided, this
 * function simply returns an empty array.  It should only be
 * enabled when the environment variables `UPWORK_CLIENT_ID` and
 * `UPWORK_CLIENT_SECRET` are present and valid.  You can add
 * additional logic here to detect those variables and perform the
 * authentication and data fetching steps.
 */
export async function fetchUpworkExternalJobs(): Promise<ExternalJob[]> {
  // Upwork integration is optional and disabled by default.  Return
  // an empty array when credentials are missing.  Implement API
  // calls here once the project has been approved for Upwork access.
  const clientId = process.env.UPWORK_CLIENT_ID;
  const clientSecret = process.env.UPWORK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return [];
  }
  try {
    // TODO: Implement OAuth client credentials flow and fetch job
    // listings from Upwork.  Upwork requires generating an access
    // token using the client ID/secret, then calling the job
    // listings endpoint.  See Upwork API docs for details.
    return [];
  } catch (err) {
    console.error('Failed to fetch Upwork jobs', err);
    return [];
  }
}

/**
 * Fetch jobs from all configured external providers.  If additional
 * providers are added in the future (e.g. Techmap, Upwork), they should
 * be invoked here.  Duplicates (based on external_id + source) are not
 * filtered at this stage; deduplication happens in the database via
 * upsert on the `external_jobs` table.
 */
export async function fetchAllExternalJobs(): Promise<ExternalJob[]> {
  const results: ExternalJob[] = [];
  const providers = [
    fetchRemotiveExternalJobs,
    fetchJobicyExternalJobs,
    fetchFindworkExternalJobs,
    fetchUpworkExternalJobs,
    // Add new providers here
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