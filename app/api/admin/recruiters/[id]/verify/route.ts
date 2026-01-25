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

    // Get optional notes from request body
    let notes = null;
    try {
      const body = await request.json();
      notes = body.notes;
    } catch {
      // No body or invalid JSON is fine
    }

    const supabase = createServerSupabaseClient();

    // Update the recruiter profile
    const { data, error } = await supabase
      .from('recruiter_profiles')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: userId,
        verification_notes: notes,
      })
      .eq('user_id', recruiterId)
      .select()
      .single();

    if (error) {
      console.error('Error verifying recruiter:', error);
      return NextResponse.json({ error: 'Failed to verify recruiter' }, { status: 500 });
    }

    // Also update the verifications table if there's a pending verification
    await supabase
      .from('verifications')
      .update({
        status: 'approved',
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
