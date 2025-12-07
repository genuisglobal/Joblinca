/**
 * Remote jobs integration.
 *
 * This module fetches remote job listings from the Remotive public API.  The
 * API returns work‑from‑home and remote jobs world‑wide.  In order to comply
 * with Remotive’s terms of service you must link back to their job pages and
 * mention Remotive as the source【32704738240961†L20-L31】.  Jobs are delayed by
 * up to 24 hours and should not be cached too aggressively【32704738240961†L16-L18】.
 */

export interface RemoteJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  company_logo: string | null;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
  company_logo_url?: string | null;
}

export interface RemoteJobsResponse {
  jobs: RemoteJob[];
}

/**
 * Fetch remote jobs from the Remotive API.  Accepts optional query parameters
 * such as `search` and `category` but defaults to all jobs.  Because the API is
 * rate‑limited, avoid frequent calls and consider caching results for a few
 * hours.
 */
export async function fetchRemoteJobs(params: { search?: string; category?: string } = {}): Promise<RemoteJobsResponse> {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.category) query.append('category', params.category);
  const url = `https://remotive.com/api/remote-jobs${query.toString() ? '?' + query.toString() : ''}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Failed to fetch remote jobs: ${res.status}`);
  }
  const data = await res.json();
  return data as RemoteJobsResponse;
}