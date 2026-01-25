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
    const { reason } = await request.json();

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Update the job
    const { data, error } = await supabase
      .from('jobs')
      .update({
        approval_status: 'rejected',
        approved_at: new Date().toISOString(),
        approved_by: userId,
        published: false,
        rejection_reason: reason.trim(),
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      console.error('Error rejecting job:', error);
      return NextResponse.json({ error: 'Failed to reject job' }, { status: 500 });
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
