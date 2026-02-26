import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: /api/external-jobs
 *
 * Returns aggregated external job listings from the `external_jobs` table.
 * Supports search, category, source, job_type filters and pagination.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const source = searchParams.get('source');
  const jobType = searchParams.get('job_type');
  const limit = parseInt(searchParams.get('limit') || '200', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('external_jobs')
    .select('*', { count: 'exact' })
    .order('fetched_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (category && category !== 'All') {
    query = query.eq('category', category);
  }
  if (source) {
    query = query.eq('source', source);
  }
  if (jobType) {
    query = query.ilike('job_type', `%${jobType}%`);
  }
  if (search) {
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data || [], total: count || 0 });
}

/**
 * Returns the distinct categories available in external_jobs.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await request.json().catch(() => ({}));

  if (body.action === 'categories') {
    const { data, error } = await supabase
      .from('external_jobs')
      .select('category')
      .not('category', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const categories = [...new Set((data || []).map((r: any) => r.category).filter(Boolean))].sort();
    return NextResponse.json({ categories });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
