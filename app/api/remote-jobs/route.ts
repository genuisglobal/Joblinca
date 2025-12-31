import { NextResponse, type NextRequest } from 'next/server';
import { fetchRemoteJobs } from '@/lib/remoteJobs';

/**
 * API Route: /api/remote-jobs
 *
 * Returns a list of remote jobs retrieved from the Remotive API.  Pass
 * optional `search` and `category` query parameters to filter results.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || undefined;
  const category = searchParams.get('category') || undefined;
  try {
    const data = await fetchRemoteJobs({ search, category });
    // Sanitize the description to avoid long HTML; return only summary fields
    const jobs = data.jobs.map((job) => ({
      id: job.id,
      title: job.title,
      company_name: job.company_name,
      company_logo: job.company_logo,
      category: job.category,
      tags: job.tags,
      job_type: job.job_type,
      publication_date: job.publication_date,
      candidate_required_location: job.candidate_required_location,
      salary: job.salary,
      url: job.url,
      source: 'Remotive',
    }));
    return NextResponse.json({ jobs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}