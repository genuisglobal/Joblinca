import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { validateApiKey } from '@/lib/api-keys';
import { rateLimit } from '@/lib/rate-limit';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';

/**
 * GET /api/v1/jobs — Public API for listing published jobs
 * Requires API key via Authorization: Bearer jbl_xxx
 *
 * Query params: q, location, remote, type, limit, offset
 */
export async function GET(request: NextRequest) {
  // Extract API key
  const auth = request.headers.get('authorization');
  const apiKey = auth?.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'API key required. Pass via Authorization: Bearer <key>' },
      { status: 401 }
    );
  }

  const keyData = await validateApiKey(apiKey);
  if (!keyData) {
    return NextResponse.json({ error: 'Invalid or expired API key' }, { status: 401 });
  }

  // Check scope
  if (!keyData.scopes.includes('jobs.read')) {
    return NextResponse.json({ error: 'Insufficient scope' }, { status: 403 });
  }

  // Rate limit by key
  const rl = await rateLimit(`api:${keyData.keyId}`, {
    requests: keyData.rateLimitPerHour,
    window: '1h',
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', limit: keyData.rateLimitPerHour },
      { status: 429 }
    );
  }

  // Parse query params
  const params = request.nextUrl.searchParams;
  const q = params.get('q');
  const location = params.get('location');
  const remote = params.get('remote');
  const jobType = params.get('type');
  const limit = Math.min(parseInt(params.get('limit') || '25', 10), 100);
  const offset = parseInt(params.get('offset') || '0', 10);

  const supabase = createServiceSupabaseClient();

  let query = supabase
    .from('jobs')
    .select(
      'id, title, company_name, location, salary, job_type, work_type, description, created_at, closes_at, lifecycle_status',
      { count: 'exact' }
    )
    .eq('published', true)
    .eq('approval_status', 'approved')
    .eq('lifecycle_status', 'live')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }
  if (location) {
    query = query.ilike('location', `%${location}%`);
  }
  if (remote === '1' || remote === 'true') {
    query = query.eq('work_type', 'remote');
  }
  if (jobType) {
    query = query.eq('job_type', jobType);
  }

  const { data: jobs, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  const liveJobs = (jobs || []).filter((job) => isJobPubliclyListable(job));

  return NextResponse.json({
    data: liveJobs.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company_name,
      location: job.location,
      salary: job.salary,
      type: job.job_type,
      remote: job.work_type === 'remote',
      description: job.description?.slice(0, 500),
      postedAt: job.created_at,
      closesAt: job.closes_at,
      url: `https://joblinca.com/jobs/${job.id}`,
    })),
    pagination: {
      total: count ?? liveJobs.length,
      limit,
      offset,
      hasMore: (count ?? liveJobs.length) > offset + limit,
    },
  });
}
