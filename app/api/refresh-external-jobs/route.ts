import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  clearRetiredExternalFeedSources,
  fetchExternalFeedJobs,
  replaceExternalJobsBySource,
} from '@/lib/externalJobs';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: /api/refresh-external-jobs
 *
 * This endpoint refreshes the legacy `external_jobs` feed with the
 * remote/international providers only. Cameroon aggregation sources are
 * handled separately by the discovered_jobs pipeline.
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
  const jobs = await fetchExternalFeedJobs();
  let retiredCameroonSourcesCleared = true;
  let retiredCameroonSourcesError: string | null = null;

  try {
    await clearRetiredExternalFeedSources(supabase);
  } catch (err) {
    retiredCameroonSourcesCleared = false;
    retiredCameroonSourcesError = String(err);
  }

  const result = await replaceExternalJobsBySource(supabase, jobs);

  return NextResponse.json({
    total: jobs.length,
    inserted: result.inserted,
    errors: result.errors,
    sources: result.sources,
    retired_cameroon_sources: {
      cleared: retiredCameroonSourcesCleared,
      error: retiredCameroonSourcesError,
    },
  });
}
