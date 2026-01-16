import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: Get a single application
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

  const { data: application, error } = await supabase
    .from('applications')
    .select(
      `
      *,
      jobs:job_id (
        id,
        title,
        company_name,
        recruiter_id
      ),
      profiles:applicant_id (
        id,
        full_name,
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .eq('id', params.id)
    .single();

  if (error || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Check if user is the applicant or the job recruiter
  const isApplicant = application.applicant_id === user.id;
  const isRecruiter = application.jobs?.recruiter_id === user.id;

  if (!isApplicant && !isRecruiter) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  return NextResponse.json(application);
}

// PUT: Update application status (recruiters only)
export async function PUT(
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

  // Get the application to check authorization
  const { data: application, error: fetchError } = await supabase
    .from('applications')
    .select(
      `
      *,
      jobs:job_id (
        recruiter_id
      )
    `
    )
    .eq('id', params.id)
    .single();

  if (fetchError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 });
  }

  // Only the job's recruiter can update the status
  if (application.jobs?.recruiter_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();
  const { status } = body;

  const validStatuses = ['submitted', 'shortlisted', 'interviewed', 'hired', 'rejected'];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
      { status: 400 }
    );
  }

  const { data: updated, error } = await supabase
    .from('applications')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select('*')
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message || 'Failed to update application' },
      { status: 500 }
    );
  }

  return NextResponse.json(updated);
}
