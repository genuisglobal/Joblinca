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
  const {
    title,
    description,
    location,
    salary,
    companyName,
    companyLogoUrl,
    workType,
  } = body;
  if (!title || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Insert job with published=false by default; admin will approve later
  const { data: insertedJob, error } = await supabase
    .from('jobs')
    .insert({
      title,
      description,
      location,
      salary: salary ? Number(salary) : null,
      recruiter_id: user.id,
      published: false,
      company_name: companyName || null,
      company_logo_url: companyLogoUrl || null,
      work_type: workType || 'onsite',
    })
    .select('*')
    .single();
  if (error || !insertedJob) {
    return NextResponse.json({ error: error?.message || 'Failed to create job' }, { status: 500 });
  }
  // Generate a shareable image for the job.  We invoke our own API
  // route rather than duplicating image generation logic here.  If
  // generation fails, the image_url will remain null.  Use the
  // request URL to compute the absolute path to the image route.
  let imageUrl: string | null = null;
  try {
    const url = new URL('/api/generate-job-image', request.url);
    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        companyName,
        salary: salary ? String(salary) : undefined,
        location,
        workType: workType || 'onsite',
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.imageUrl) {
        imageUrl = data.imageUrl as string;
      }
    }
  } catch (err) {
    console.error('Failed to generate job image', err);
  }
  // Update the job record with the generated image URL if available
  if (imageUrl) {
    await supabase
      .from('jobs')
      .update({ image_url: imageUrl })
      .eq('id', insertedJob.id);
  }
  return NextResponse.json({ id: insertedJob.id }, { status: 201 });
}