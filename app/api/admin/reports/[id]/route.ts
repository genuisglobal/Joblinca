import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkAdminStatus } from '@/lib/admin';

const VALID_STATUSES = ['pending', 'reviewed', 'dismissed', 'actioned'] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reportId } = await params;

  const { userId } = await checkAdminStatus();
  const supabase = createServerSupabaseClient();

  const body = await request.json();
  const status = body.status;
  const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes.trim() : null;

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // Load the report to get the job_id
  const { data: report, error: reportError } = await supabase
    .from('job_reports')
    .select('id, job_id, status')
    .eq('id', reportId)
    .maybeSingle();

  if (reportError || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  // Update the report
  const { error: updateError } = await supabase
    .from('job_reports')
    .update({
      status,
      admin_notes: adminNotes,
      resolved_by: userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', reportId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  // If "actioned", unpublish the reported job
  if (status === 'actioned' && report.job_id) {
    const removalReason = adminNotes || 'Removed after admin review of user report';
    await supabase
      .from('jobs')
      .update({
        published: false,
        approval_status: 'rejected',
        approved_at: new Date().toISOString(),
        approved_by: userId,
        rejection_reason: removalReason,
        removed_at: new Date().toISOString(),
        removed_by: userId,
        removal_reason: removalReason,
      })
      .eq('id', report.job_id);

    // Log admin action
    await supabase.from('admin_actions').insert({
      admin_id: userId,
      action: 'remove_reported_job',
      target_table: 'jobs',
      target_id: report.job_id,
      metadata: { report_id: reportId, admin_notes: adminNotes, removal_reason: removalReason },
    });
  }

  return NextResponse.json({ success: true });
}
