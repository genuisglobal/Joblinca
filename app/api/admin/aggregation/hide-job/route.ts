import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { recordCompanyEvent } from '@/lib/aggregation/company-reputation';

const REJECT_REASONS = ['scam', 'duplicate', 'expired', 'low_quality', 'other'] as const;
type RejectReason = (typeof REJECT_REASONS)[number];

/**
 * POST /api/admin/aggregation/hide-job
 *
 * Hides/rejects a discovered job so it won't appear in review queues.
 * Body: { "discoveredJobId": "uuid", "reason"?: "scam"|"duplicate"|"expired"|"low_quality"|"other", "note"?: string }
 *
 * The reason feeds the company reputation registry: 'scam' counts as a scam
 * report, every reasoned rejection counts against the company, and repeat
 * offenders get auto-escalated to watch/blocked.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  try {
    const body = await request.json();
    const discoveredJobId = body?.discoveredJobId as string | undefined;
    const reason = REJECT_REASONS.includes(body?.reason) ? (body.reason as RejectReason) : null;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) : null;

    if (!discoveredJobId) {
      return NextResponse.json({ error: 'discoveredJobId required' }, { status: 400 });
    }

    const { data: job } = await supabase
      .from('discovered_jobs')
      .select('id, company_name')
      .eq('id', discoveredJobId)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ error: 'Discovered job not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('discovered_jobs')
      .update({
        ingestion_status: 'hidden',
        hidden_at: new Date().toISOString(),
        verification_status: 'rejected',
        rejected_reason: reason,
        rejected_note: note,
      })
      .eq('id', discoveredJobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Feed the company reputation registry. Duplicates and expirations are
    // not the company's fault — only quality/fraud rejections count.
    let reputation = null;
    if (reason === 'scam') {
      reputation = await recordCompanyEvent(supabase, job.company_name, 'scam_report');
    } else if (reason === 'low_quality' || reason === 'other') {
      reputation = await recordCompanyEvent(supabase, job.company_name, 'rejection');
    }

    return NextResponse.json({
      success: true,
      company_status: reputation?.status ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
