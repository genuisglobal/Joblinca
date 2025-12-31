import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: /api/external-jobs
 *
 * Returns a list of aggregated global job opportunities stored in the
 * `external_jobs` table.  Supports optional query parameters for search,
 * category and source.  Results are ordered by most recently fetched first.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const source = searchParams.get('source');

  let query = supabase.from('external_jobs').select('*').order('fetched_at', { ascending: false });
  if (category) {
    query = query.eq('category', category);
  }
  if (source) {
    query = query.eq('source', source);
  }
  if (search) {
    // Use ilike for case‑insensitive search on the title
    query = query.ilike('title', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return NextResponse.json(data || []);
}