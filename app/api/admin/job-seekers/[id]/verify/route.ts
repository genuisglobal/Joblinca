import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAdmin();
    const { id: jobSeekerId } = await params;

    // Get optional notes from request body
    let notes = null;
    try {
      const body = await request.json();
      notes = body.notes;
    } catch {
      // No body or invalid JSON is fine
    }

    const supabase = createServerSupabaseClient();

    // Update the job seeker profile
    const { data, error } = await supabase
      .from('job_seeker_profiles')
      .update({
        verification_status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by: userId,
        verification_notes: notes,
      })
      .eq('user_id', jobSeekerId)
      .select()
      .single();

    if (error) {
      console.error('Error verifying job seeker:', error);
      return NextResponse.json({ error: 'Failed to verify job seeker' }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobSeeker: data });
  } catch (err) {
    console.error('Admin error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
