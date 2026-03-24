import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';

/**
 * POST /api/jobs/boost
 *
 * Boosts a job listing for a specified number of days.
 * Boosted jobs appear at the top of search results.
 *
 * Body: { jobId: string, days?: number }
 * - Recruiters can boost their own jobs (requires active subscription)
 * - Admins can boost any job
 * - Default boost duration: 7 days
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const isActiveAdmin = Boolean(
    profile.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );

  const body = await request.json().catch(() => ({}));
  const { jobId, days } = body;

  if (!jobId || typeof jobId !== 'string') {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const boostDays = Math.min(Math.max(parseInt(days) || 7, 1), 30);

  // Verify the job exists and the user owns it (or is admin)
  const serviceClient = createServiceSupabaseClient();
  const { data: job, error: jobError } = await serviceClient
    .from('jobs')
    .select('id, recruiter_id, boost_until')
    .eq('id', jobId)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (!isActiveAdmin && job.recruiter_id !== user.id) {
    return NextResponse.json({ error: 'You can only boost your own jobs' }, { status: 403 });
  }

  // Calculate new boost_until: extend from current boost or from now
  const now = new Date();
  const currentBoostEnd = job.boost_until ? new Date(job.boost_until) : null;
  const baseDate = currentBoostEnd && currentBoostEnd > now ? currentBoostEnd : now;
  const boostUntil = new Date(baseDate.getTime() + boostDays * 24 * 60 * 60 * 1000);

  const { error: updateError } = await serviceClient
    .from('jobs')
    .update({
      boost_until: boostUntil.toISOString(),
      is_featured: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to boost job' }, { status: 500 });
  }

  return NextResponse.json({
    message: `Job boosted for ${boostDays} days`,
    boostUntil: boostUntil.toISOString(),
  });
}
