import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const CONTENT_STATUSES = ['not_started', 'in_progress', 'created', 'skipped'] as const;
type ContentStatus = (typeof CONTENT_STATUSES)[number];

function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === 'string' && CONTENT_STATUSES.includes(value as ContentStatus);
}

export async function POST(request: NextRequest) {
  let admin;

  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
  const status = body.status;
  const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  if (!isContentStatus(status)) {
    return NextResponse.json({ error: 'Invalid content status' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const update =
    status === 'not_started'
      ? {
          content_status: status,
          content_marked_by: null,
          content_marked_at: null,
          content_notes: notes,
        }
      : {
          content_status: status,
          content_marked_by: admin.userId,
          content_marked_at: now,
          content_notes: notes,
        };

  const { data: job, error } = await supabase
    .from('jobs')
    .update(update)
    .eq('id', jobId)
    .select('id, title, content_status, content_marked_at')
    .maybeSingle();

  if (error) {
    console.error('[content-status] update failed:', error);
    return NextResponse.json({ error: 'Failed to update content status' }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  try {
    await supabase.from('admin_audit_log').insert({
      action: 'admin_update_job_content_status',
      admin_id: admin.userId,
      admin_type: admin.adminType,
      target_table: 'jobs',
      target_id: job.id,
      new_values: {
        status,
        notes,
      },
    });
  } catch (auditError) {
    console.warn('[content-status] audit log failed', auditError);
  }

  return NextResponse.json({ success: true, job });
}
