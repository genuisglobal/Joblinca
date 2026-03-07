import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

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
      .select('id, approval_status, published')
      .eq('id', jobId)
      .single();

    if (loadError || !existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const nextUpdate: Record<string, unknown> = {
      published,
      updated_at: new Date().toISOString(),
    };

    // Publishing from pending/rejected should move the job to approved.
    if (published && existingJob.approval_status !== 'approved') {
      nextUpdate.approval_status = 'approved';
      nextUpdate.approved_at = new Date().toISOString();
      nextUpdate.approved_by = userId;
      nextUpdate.rejection_reason = null;
    }

    const { data, error } = await supabase
      .from('jobs')
      .update(nextUpdate)
      .eq('id', jobId)
      .select('id, title, approval_status, published, approved_at, approved_by')
      .single();

    if (error) {
      console.error('Error updating publish state:', error);
      return NextResponse.json({ error: 'Failed to update job visibility' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      job: data,
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
