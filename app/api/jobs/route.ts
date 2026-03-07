import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscriptions';

const ACTIVE_ADMIN_TYPES = ['super', 'operations'];

// Handle GET /api/jobs and POST /api/jobs
export async function GET() {
  const supabase = createServerSupabaseClient();
  // Only return jobs that are both published AND approved
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('published', true)
    .eq('approval_status', 'approved')
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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Unable to verify posting permissions' }, { status: 403 });
  }

  const isRecruiter = profile.role === 'recruiter';
  const isActiveAdmin = Boolean(
    profile.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );

  if (!isRecruiter && !isActiveAdmin) {
    return NextResponse.json({ error: 'Recruiter or admin access required' }, { status: 403 });
  }

  if (isRecruiter) {
    const { data: recruiterProfile, error: recruiterLookupError } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (recruiterLookupError || !recruiterProfile) {
      return NextResponse.json(
        { error: 'Recruiter account profile required before posting jobs' },
        { status: 403 }
      );
    }

    try {
      await requireActiveSubscription(user.id, 'recruiter');
    } catch {
      return NextResponse.json(
        {
          error:
            'Basic recruiter verification is required before posting jobs. Activate a recruiter plan in Billing.',
        },
        { status: 403 }
      );
    }
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
    jobType,
    visibility,
    customQuestions,
    applyMethod,
    externalApplyUrl,
    applyEmail,
    applyPhone,
    applyWhatsapp,
    closesAt,
    waAiScreeningEnabled,
  } = body;
  if (!title || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (isActiveAdmin) {
    const { data: recruiterProfile } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!recruiterProfile) {
      const { error: recruiterError } = await supabase.from('recruiters').insert({
        id: user.id,
        company_name: companyName || 'Admin Posted Job',
        verified: true,
      });

      if (recruiterError) {
        return NextResponse.json(
          { error: recruiterError.message || 'Unable to prepare admin posting profile' },
          { status: 500 }
        );
      }
    }
  }

  const shouldPublishImmediately = isActiveAdmin;
  const approvalStatus = isActiveAdmin ? 'approved' : 'pending';

  const { data: insertedJob, error } = await supabase
    .from('jobs')
    .insert({
      title,
      description,
      location,
      salary: salary ? Number(salary) : null,
      recruiter_id: user.id,
      published: shouldPublishImmediately,
      approval_status: approvalStatus,
      approved_at: isActiveAdmin ? new Date().toISOString() : null,
      approved_by: isActiveAdmin ? user.id : null,
      posted_by: user.id,
      posted_by_role: isActiveAdmin ? `admin_${profile.admin_type}` : 'recruiter',
      company_name: companyName || null,
      company_logo_url: companyLogoUrl || null,
      work_type: workType || 'onsite',
      job_type: jobType || 'job',
      visibility: visibility || 'public',
      custom_questions: customQuestions || null,
      apply_method: applyMethod || 'joblinca',
      external_apply_url: externalApplyUrl || null,
      apply_email: applyEmail || null,
      apply_phone: applyPhone || null,
      apply_whatsapp: applyWhatsapp || null,
      closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      wa_ai_screening_enabled:
        typeof waAiScreeningEnabled === 'boolean' ? waAiScreeningEnabled : null,
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
