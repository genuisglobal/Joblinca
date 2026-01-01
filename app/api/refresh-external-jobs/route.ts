import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAllExternalJobs } from '@/lib/externalJobs';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: /api/refresh-external-jobs
 *
 * This endpoint triggers a refresh of the `external_jobs` table by
 * fetching jobs from all configured external providers and upserting
 * them into the database.  Only administrators are permitted to run
 * this endpoint.  It is intended to be called by a scheduled job or
 * manually by an admin via a management interface.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  // Authenticate the user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new NextResponse('Authentication required', { status: 401 });
  }
  // Check if the user is an admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile || profile.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  // Fetch external jobs from providers
  const jobs = await fetchAllExternalJobs();
  let inserted = 0;
  for (const job of jobs) {
    // Upsert by external_id and source to avoid duplicates
    const { error: upsertError } = await supabase.from('external_jobs').upsert(job, {
      onConflict: 'external_id,source',
    });
    if (!upsertError) {
      inserted += 1;
    }
  }
  return NextResponse.json({ total: jobs.length, inserted });
}