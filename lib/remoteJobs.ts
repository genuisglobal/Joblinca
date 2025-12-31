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
  company_logo_url?: string | null; // keep this optional
}

export interface RemoteJobsResponse {
  jobs: RemoteJob[];
}

export async function fetchRemoteJobs(params: { search?: string; category?: string } = {}): Promise<RemoteJobsResponse> {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.category) query.append("category", params.category);

  const url = `https://remotive.com/api/remote-jobs${query.toString() ? "?" + query.toString() : ""}`;

  try {
    // IMPORTANT: Never let build fail if this API is down
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { jobs: [] };
    return (await res.json()) as RemoteJobsResponse;
  } catch {
    return { jobs: [] };
  }
}
