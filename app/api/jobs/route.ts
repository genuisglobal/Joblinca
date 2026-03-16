import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { requireActiveSubscription } from '@/lib/subscriptions';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { validateOpportunityConfiguration } from '@/lib/opportunities';
import { persistJobOpportunityMetadata } from '@/lib/opportunities-server';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';
import { checkJobForScam } from '@/lib/scam-detection';
import { isJobPubliclyListable, resolveJobLifecycleStatus } from '@/lib/jobs/lifecycle';

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Handle GET /api/jobs and POST /api/jobs
export async function GET() {
  const supabase = createServerSupabaseClient();
  // Closed jobs can remain publicly viewable on direct links, but the public
  // jobs feed should only return still-open listings.
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('published', true)
    .eq('approval_status', 'approved')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json((jobs || []).filter((job) => isJobPubliclyListable(job)));
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

    // Free first job post: count existing jobs by this recruiter.
    // If they have 0 jobs, allow posting without a subscription.
    const { count: existingJobCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('recruiter_id', user.id);

    const hasFreePost = (existingJobCount ?? 0) === 0;

    if (!hasFreePost) {
      try {
        await requireActiveSubscription(user.id, 'recruiter');
      } catch {
        return NextResponse.json(
          {
            error:
              'You have used your free job post. Activate a recruiter plan in Billing to post more jobs.',
          },
          { status: 403 }
        );
      }
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
    applyIntakeMode,
    externalApplyUrl,
    applyEmail,
    applyPhone,
    applyWhatsapp,
    closesAt,
    targetHireDate,
    waAiScreeningEnabled,
    recruiterId,
    internshipTrack,
    eligibleRoles,
    internshipRequirements,
  } = body;

  const requestedRecruiterId = normalizeOptionalId(recruiterId);

  if (!title || !description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  let normalizedClosesAt: string | null = null;
  if (typeof closesAt === 'string' && closesAt.trim()) {
    const parsed = new Date(closesAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Application deadline is invalid' }, { status: 400 });
    }
    if (parsed.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Application deadline must be in the future' },
        { status: 400 }
      );
    }
    normalizedClosesAt = parsed.toISOString();
  }

  let normalizedTargetHireDate: string | null = null;
  if (typeof targetHireDate === 'string' && targetHireDate.trim()) {
    const parsed = new Date(targetHireDate);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Target hire date is invalid' }, { status: 400 });
    }
    normalizedTargetHireDate = targetHireDate.trim();
  }

  const opportunityValidation = validateOpportunityConfiguration({
    jobType,
    visibility,
    internshipTrack,
    eligibleRoles,
    applyMethod,
    applyIntakeMode,
    internshipRequirements,
  });

  if (!opportunityValidation.valid) {
    return NextResponse.json(
      { error: opportunityValidation.errors.join(' ') },
      { status: 400 }
    );
  }

  if (!isActiveAdmin && requestedRecruiterId && requestedRecruiterId !== user.id) {
    return NextResponse.json(
      { error: 'Only admins can post jobs on behalf of another recruiter' },
      { status: 403 }
    );
  }

  let assignedRecruiterId = user.id;

  if (isActiveAdmin && requestedRecruiterId && requestedRecruiterId !== user.id) {
    const { data: recruiterUser, error: recruiterUserError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', requestedRecruiterId)
      .maybeSingle();

    if (recruiterUserError || !recruiterUser || recruiterUser.role !== 'recruiter') {
      return NextResponse.json(
        { error: 'Selected recruiter is invalid or does not have a recruiter account' },
        { status: 400 }
      );
    }

    const { data: recruiterRecord, error: recruiterRecordError } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', requestedRecruiterId)
      .maybeSingle();

    if (recruiterRecordError || !recruiterRecord) {
      return NextResponse.json(
        { error: 'Selected recruiter must complete recruiter setup before being assigned jobs' },
        { status: 400 }
      );
    }

    assignedRecruiterId = requestedRecruiterId;
  }

  if (isActiveAdmin && assignedRecruiterId === user.id) {
    const { data: recruiterProfile } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (!recruiterProfile) {
      const { error: recruiterError } = await supabase.from('recruiters').insert({
        id: user.id,
        company_name: companyName || 'Joblinca',
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

  // Scam detection: score the job content
  const scamResult = checkJobForScam(title, description || '', companyName || null);

  const shouldPublishImmediately = isActiveAdmin && !scamResult.isSuspicious;
  const approvalStatus = isActiveAdmin && !scamResult.isSuspicious ? 'approved' : 'pending';
  const lifecycleStatus = resolveJobLifecycleStatus({
    published: shouldPublishImmediately,
    approval_status: approvalStatus,
    closes_at: normalizedClosesAt,
    removed_at: null,
    archived_at: null,
    filled_at: null,
  });

  const { data: insertedJob, error } = await supabase
    .from('jobs')
    .insert({
      title,
      description,
      location,
      salary: salary ? Number(salary) : null,
      recruiter_id: assignedRecruiterId,
      published: shouldPublishImmediately,
      approval_status: approvalStatus,
      lifecycle_status: lifecycleStatus,
      scam_score: scamResult.score,
      approved_at: isActiveAdmin ? new Date().toISOString() : null,
      approved_by: isActiveAdmin ? user.id : null,
      posted_by: user.id,
      posted_by_role: isActiveAdmin ? `admin_${profile.admin_type}` : 'recruiter',
      company_name: companyName || null,
      company_logo_url: companyLogoUrl || null,
      work_type: workType || 'onsite',
      job_type: opportunityValidation.normalized.jobType,
      internship_track: opportunityValidation.normalized.internshipTrack,
      visibility: opportunityValidation.normalized.visibility,
      eligible_roles: opportunityValidation.normalized.eligibleRoles,
      custom_questions: customQuestions || null,
      apply_method: applyMethod || 'joblinca',
      apply_intake_mode: opportunityValidation.normalized.applyIntakeMode,
      external_apply_url: externalApplyUrl || null,
      apply_email: applyEmail || null,
      apply_phone: applyPhone || null,
      apply_whatsapp: applyWhatsapp || null,
      closes_at: normalizedClosesAt,
      target_hire_date: normalizedTargetHireDate,
      wa_ai_screening_enabled:
        typeof waAiScreeningEnabled === 'boolean' ? waAiScreeningEnabled : null,
    })
    .select('*')
    .single();
  if (error || !insertedJob) {
    return NextResponse.json({ error: error?.message || 'Failed to create job' }, { status: 500 });
  }

  const metadataResult = await persistJobOpportunityMetadata(
    supabase as any,
    insertedJob.id,
    opportunityValidation.normalized
  );

  if (metadataResult.error) {
    console.error('Failed to persist opportunity metadata', metadataResult.error);
    return NextResponse.json(
      { error: metadataResult.error.message || 'Failed to save internship configuration' },
      { status: 500 }
    );
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

  if (isJobPubliclyListable(insertedJob)) {
    try {
      await dispatchJobMatchNotifications({
        jobId: insertedJob.id,
        trigger: 'job_posted',
      });
    } catch (matchError) {
      console.error('Job matching dispatch failed after job create', matchError);
    }
  }

  return NextResponse.json({
    id: insertedJob.id,
    ...(scamResult.isSuspicious && {
      warning: 'This job was flagged for review due to suspicious content. It will be visible once approved by an admin.',
    }),
  }, { status: 201 });
}
