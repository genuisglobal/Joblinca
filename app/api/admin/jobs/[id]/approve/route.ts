import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { isJobPubliclyListable, resolveJobLifecycleStatus } from '@/lib/jobs/lifecycle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id: jobId } = await params;
    const supabase = createServerSupabaseClient();
    const nowIso = new Date().toISOString();

    const { data: existingJob, error: loadError } = await supabase
      .from('jobs')
      .select('id, closes_at')
      .eq('id', jobId)
      .single();

    if (loadError || !existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const lifecycleStatus = resolveJobLifecycleStatus({
      published: true,
      approval_status: 'approved',
      closes_at: existingJob.closes_at,
      removed_at: null,
      archived_at: null,
      filled_at: null,
    });

    // Update the job
    const { data, error } = await supabase
      .from('jobs')
      .update({
        approval_status: 'approved',
        approved_at: nowIso,
        approved_by: userId,
        published: true,
        lifecycle_status: lifecycleStatus,
        rejection_reason: null,
        removed_at: null,
        removed_by: null,
        removal_reason: null,
        closed_at: lifecycleStatus === 'live' ? null : existingJob.closes_at || nowIso,
        closed_reason: lifecycleStatus === 'live' ? null : 'deadline_elapsed',
        retention_expires_at: lifecycleStatus === 'live' ? null : undefined,
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      console.error('Error approving job:', error);
      return NextResponse.json({ error: 'Failed to approve job' }, { status: 500 });
    }

    if (isJobPubliclyListable(data)) {
      try {
        await dispatchJobMatchNotifications({
          jobId: jobId,
          trigger: 'admin_job_approve',
        });
      } catch (matchError) {
        console.error('Job matching dispatch failed after approval', matchError);
      }
    }

    return NextResponse.json({ success: true, job: data });
  } catch (err) {
    console.error('Admin error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
