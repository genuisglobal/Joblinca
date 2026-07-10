import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { rateLimit, getRateLimitIdentifier } from '@/lib/rate-limit';
import { recordCompanyEvent } from '@/lib/aggregation/company-reputation';

/** Distinct reporters needed before a job is auto-unpublished for review */
const AUTO_UNPUBLISH_THRESHOLD = 3;

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

  // ── Escalation loop (service role: reputation + auto-unpublish) ───────────
  try {
    const service = createServiceSupabaseClient();

    const { data: reportedJob } = await service
      .from('jobs')
      .select('id, published, company_name, origin_type, origin_discovered_job_id')
      .eq('id', jobId)
      .maybeSingle();

    // Scam reports count against the company's reputation
    if (reason === 'scam' && reportedJob?.company_name) {
      await recordCompanyEvent(service, reportedJob.company_name, 'scam_report');
    }

    // Enough distinct reporters → pull the job down and send it back to review
    const { count } = await service
      .from('job_reports')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .neq('status', 'dismissed');

    if ((count ?? 0) >= AUTO_UNPUBLISH_THRESHOLD && reportedJob?.published) {
      const { error: unpubErr } = await service
        .from('jobs')
        .update({ published: false, lifecycle_status: 'removed' })
        .eq('id', jobId);

      if (!unpubErr) {
        console.log(
          `[report] Job ${jobId} auto-unpublished after ${count} reports (latest: ${reason})`
        );
        if (reportedJob.origin_discovered_job_id) {
          await service
            .from('discovered_jobs')
            .update({
              verification_status: 'suspicious',
              ingestion_status: 'review_required',
            })
            .eq('id', reportedJob.origin_discovered_job_id);
        }
      }
    }
  } catch (escalationErr) {
    // The report itself succeeded — escalation is best-effort
    console.error('[report] Escalation failed (non-fatal):', escalationErr);
  }

  return NextResponse.json({ success: true });
}
