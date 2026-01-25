import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST - Save a job
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: jobId } = await context.params;
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check if already saved
  const { data: existing } = await supabase
    .from('saved_jobs')
    .select('id')
    .eq('job_id', jobId)
    .eq('user_id', user.id)
    .single();

  if (existing) {
    return NextResponse.json({ saved: true, message: 'Job already saved' });
  }

  const { error } = await supabase.from('saved_jobs').insert({
    job_id: jobId,
    user_id: user.id,
  });

  if (error) {
    console.error('Save job error:', error);
    return NextResponse.json({ error: 'Failed to save job' }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}

// DELETE - Unsave a job
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id: jobId } = await context.params;
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { error } = await supabase
    .from('saved_jobs')
    .delete()
    .eq('job_id', jobId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Unsave job error:', error);
    return NextResponse.json({ error: 'Failed to unsave job' }, { status: 500 });
  }

  return NextResponse.json({ saved: false });
}
