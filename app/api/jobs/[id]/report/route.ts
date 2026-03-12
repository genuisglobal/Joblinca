import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';

const VALID_REASONS = [
  'scam',
  'misleading',
  'duplicate',
  'offensive',
  'wrong_info',
  'other',
] as const;

type ReportReason = (typeof VALID_REASONS)[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const supabase = createServerSupabaseClient();

  // Auth check
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Rate limit: 5 reports per hour per user
  const rateLimitResult = await rateLimit(
    getRateLimitIdentifier(request, user.id),
    { requests: 5, window: '1h' }
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many reports. Please try again later.' },
      { status: 429 }
    );
  }

  const body = await request.json();
  const reason = body.reason as ReportReason;
  const description = typeof body.description === 'string'
    ? body.description.trim().slice(0, 1000)
    : null;

  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json(
      { error: 'Invalid report reason' },
      { status: 400 }
    );
  }

  // Verify job exists
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Prevent self-reporting own job
  const { data: ownJob } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', jobId)
    .eq('recruiter_id', user.id)
    .maybeSingle();

  if (ownJob) {
    return NextResponse.json(
      { error: 'You cannot report your own job posting' },
      { status: 400 }
    );
  }

  // Insert report (unique constraint prevents duplicates)
  const { error: insertError } = await supabase.from('job_reports').insert({
    job_id: jobId,
    reporter_id: user.id,
    reason,
    description,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'You have already reported this job' },
        { status: 409 }
      );
    }
    console.error('[report] Insert failed:', insertError.message);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
