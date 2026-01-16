import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: List user's applications
export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: applications, error } = await supabase
    .from('applications')
    .select(
      `
      *,
      jobs:job_id (
        id,
        title,
        company_name,
        location,
        work_type
      )
    `
    )
    .eq('applicant_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(applications);
}

// POST: Create a new application
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { jobId, coverLetter, answers } = body;

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  // Check if the job exists and is published
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, published')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (!job.published) {
    return NextResponse.json(
      { error: 'This job is not accepting applications' },
      { status: 400 }
    );
  }

  // Check if user has already applied
  const { data: existingApp } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('applicant_id', user.id)
    .single();

  if (existingApp) {
    return NextResponse.json(
      { error: 'You have already applied to this job' },
      { status: 400 }
    );
  }

  // Create the application
  const { data: application, error } = await supabase
    .from('applications')
    .insert({
      job_id: jobId,
      applicant_id: user.id,
      cover_letter: coverLetter || null,
      answers: answers || null,
      status: 'submitted',
    })
    .select('*')
    .single();

  if (error || !application) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create application' },
      { status: 500 }
    );
  }

  return NextResponse.json(application, { status: 201 });
}
