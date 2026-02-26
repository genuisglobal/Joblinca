import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: Get notes for an application
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Verify the user owns the job this application belongs to
  const { data: application } = await supabase
    .from('applications')
    .select('job_id, jobs:job_id(recruiter_id)')
    .eq('id', params.id)
    .single();

  if (!application || (application.jobs as any)?.recruiter_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { data: notes, error } = await supabase
    .from('application_notes')
    .select('*')
    .eq('application_id', params.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(notes);
}

// POST: Add a note to an application
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Verify the user owns the job this application belongs to
  const { data: application } = await supabase
    .from('applications')
    .select('job_id, jobs:job_id(recruiter_id)')
    .eq('id', params.id)
    .single();

  if (!application || (application.jobs as any)?.recruiter_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  const { content } = body;

  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
  }

  const { data: note, error } = await supabase
    .from('application_notes')
    .insert({
      application_id: params.id,
      recruiter_id: user.id,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log activity
  await supabase.from('application_activity').insert({
    application_id: params.id,
    actor_id: user.id,
    action: 'note_added',
    metadata: { note_id: note.id },
  });

  return NextResponse.json(note, { status: 201 });
}
