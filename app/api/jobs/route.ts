import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// Handle GET /api/jobs and POST /api/jobs
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  // Ensure the user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  // Parse request body
  const body = await request.json();
  const { title, description, location, salary } = body;
  if (!title || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Insert job with published=false by default; admin will approve later
  const { data: insertedJob, error } = await supabase.from('jobs').insert({
    title,
    description,
    location,
    salary: salary ? Number(salary) : null,
    recruiter_id: user.id,
    published: false,
  }).select('*').single();
  if (error || !insertedJob) {
    return NextResponse.json({ error: error?.message || 'Failed to create job' }, { status: 500 });
  }
  return NextResponse.json({ id: insertedJob.id }, { status: 201 });
}