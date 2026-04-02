import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { generateAndPersistApprovedJobImage } from '@/lib/job-image-generator/service';
import { isJobPubliclyListable, resolveJobLifecycleStatus } from '@/lib/jobs/lifecycle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id: jobId } = await params;
    const body = await request.json().catch(() => ({}));
    const published = Boolean(body?.published);

    const supabase = createServerSupabaseClient();

    const { data: existingJob, error: loadError } = await supabase
      .from('jobs')
      .select('id, approval_status, published, lifecycle_status, closes_at')
      .eq('id', jobId)
      .single();

    if (loadError || !existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (
      published &&
      (existingJob.lifecycle_status === 'filled' || existingJob.lifecycle_status === 'archived')
    ) {
      return NextResponse.json(
        { error: 'Filled or archived jobs must be reposted instead of republished' },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const nextUpdate: Record<string, unknown> = {
      published,
      updated_at: nowIso,
    };
    const nextApprovalStatus =
      published || existingJob.approval_status === 'approved'
        ? 'approved'
        : existingJob.approval_status;

    // Publishing from pending/rejected should move the job to approved.
    if (published && existingJob.approval_status !== 'approved') {
      nextUpdate.approval_status = nextApprovalStatus;
      nextUpdate.approved_at = nowIso;
      nextUpdate.approved_by = userId;
      nextUpdate.rejection_reason = null;
      nextUpdate.removed_at = null;
      nextUpdate.removed_by = null;
      nextUpdate.removal_reason = null;
    }

    const lifecycleStatus = resolveJobLifecycleStatus({
      published,
      approval_status: nextApprovalStatus,
      closes_at: existingJob.closes_at,
      removed_at: null,
      archived_at: null,
      filled_at: null,
    });

    nextUpdate.lifecycle_status = lifecycleStatus;
    nextUpdate.closed_at =
      lifecycleStatus === 'live'
        ? null
        : lifecycleStatus === 'closed_reviewing'
          ? existingJob.closes_at || nowIso
          : undefined;
    nextUpdate.closed_reason =
      lifecycleStatus === 'live'
        ? null
        : lifecycleStatus === 'closed_reviewing'
          ? 'deadline_elapsed'
          : undefined;
    nextUpdate.retention_expires_at = lifecycleStatus === 'live' ? null : undefined;

    const { data, error } = await supabase
      .from('jobs')
      .update(nextUpdate)
      .eq('id', jobId)
      .select(
        'id, title, company_name, location, salary, work_type, job_type, image_url, approval_status, published, approved_at, approved_by, closes_at, lifecycle_status'
      )
      .single();

    if (error) {
      console.error('Error updating publish state:', error);
      return NextResponse.json({ error: 'Failed to update job visibility' }, { status: 500 });
    }

    let marketingImages: Awaited<ReturnType<typeof generateAndPersistApprovedJobImage>> = null;
    if (published && existingJob.approval_status !== 'approved') {
      marketingImages = await generateAndPersistApprovedJobImage({
        jobId,
        title: data.title,
        company: data.company_name,
        salary: data.salary ? String(data.salary) : null,
        location: data.location,
        type: data.work_type || data.job_type,
        jobUrl: `${new URL(request.url).origin}/jobs/${jobId}`,
      });
    }

    if (isJobPubliclyListable(data)) {
      try {
        await dispatchJobMatchNotifications({
          jobId,
          trigger: 'admin_job_publish',
        });
      } catch (matchError) {
        console.error('Job matching dispatch failed after publish', matchError);
      }
    }

    return NextResponse.json({
      success: true,
      job: data,
      marketing_images: marketingImages?.variants ?? [],
      message: published ? 'Job is now published' : 'Job is now unpublished',
    });
  } catch (err) {
    console.error('Admin publish error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
