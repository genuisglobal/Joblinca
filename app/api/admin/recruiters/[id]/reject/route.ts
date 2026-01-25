import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id: recruiterId } = await params;
    const { reason } = await request.json();

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'Rejection reason is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Update the recruiter profile
    const { data, error } = await supabase
      .from('recruiter_profiles')
      .update({
        verification_status: 'rejected',
        verified_at: new Date().toISOString(),
        verified_by: userId,
        verification_notes: reason.trim(),
      })
      .eq('user_id', recruiterId)
      .select()
      .single();

    if (error) {
      console.error('Error rejecting recruiter:', error);
      return NextResponse.json({ error: 'Failed to reject recruiter' }, { status: 500 });
    }

    // Also update the verifications table if there's a pending verification
    await supabase
      .from('verifications')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', recruiterId)
      .eq('status', 'pending');

    return NextResponse.json({ success: true, recruiter: data });
  } catch (err) {
    console.error('Admin error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
