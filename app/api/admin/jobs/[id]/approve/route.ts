import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { isJobPubliclyListable } from '@/lib/jobs/lifecycle';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id: jobId } = await params;

    const supabase = createServerSupabaseClient();

    // Update the job
    const { data, error } = await supabase
      .from('jobs')
      .update({
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: userId,
        published: true,
        rejection_reason: null,
        removed_at: null,
        removed_by: null,
        removal_reason: null,
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
