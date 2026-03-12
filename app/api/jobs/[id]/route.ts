import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { validateOpportunityConfiguration } from '@/lib/opportunities';
import {
  loadJobOpportunityMetadata,
  persistJobOpportunityMetadata,
} from '@/lib/opportunities-server';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';

interface RouteContext {
  params: {
    id: string;
  };
}

function sanitizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function sanitizeOptionalBoolean(
  value: unknown
): boolean | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'inherit' || lower === 'default' || lower === 'null') return null;
  }
  return undefined;
}

function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getAuthorizedJobEditor(jobId: string) {
  const supabase = createServerSupabaseClient();
  const serviceClient = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const [{ data: profile }, { data: job }] = await Promise.all([
    serviceClient
      .from('profiles')
      .select('id, admin_type')
      .eq('id', user.id)
      .maybeSingle(),
    serviceClient
      .from('jobs')
      .select('id, posted_by, recruiter_id')
      .eq('id', jobId)
      .maybeSingle(),
  ]);

  if (!job) {
    return {
      error: NextResponse.json({ error: 'Job not found' }, { status: 404 }),
    };
  }

  const isActiveAdmin = Boolean(
    profile?.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );
  const isSuperAdmin = profile?.admin_type === 'super';
  const isPoster = job.posted_by === user.id;
  const isAssignedRecruiter = job.recruiter_id === user.id;

  if (!isPoster && !isAssignedRecruiter && !isSuperAdmin) {
    return {
      error: NextResponse.json(
        {
          error:
            'Only the posting admin, the assigned recruiter, or a super admin can edit this job.',
        },
        { status: 403 }
      ),
    };
  }

  return {
    serviceClient,
    userId: user.id,
    isActiveAdmin,
    isPoster,
    isAssignedRecruiter,
    isSuperAdmin,
  };
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedJobEditor(params.id);

  if ('error' in access) {
    return access.error;
  }

  const { data: job, error } = await access.serviceClient
    .from('jobs')
    .select(
      `
      id,
      posted_by,
      recruiter_id,
      title,
      company_name,
      company_logo_url,
      location,
      salary,
      work_type,
      job_type,
      internship_track,
      eligible_roles,
      apply_intake_mode,
      visibility,
      description,
      closes_at,
      target_hire_date,
      lifecycle_status,
      reopen_count,
      last_reopened_at,
      wa_ai_screening_enabled
    `
    )
    .eq('id', params.id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const metadata = await loadJobOpportunityMetadata(access.serviceClient as any, params.id);

  return NextResponse.json({
    job: {
      ...job,
      internship_requirements: metadata.data,
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedJobEditor(params.id);

  if ('error' in access) {
    return access.error;
  }

  const body = await request.json();
  const title = sanitizeText(body.title);
  const companyName = sanitizeText(body.companyName);
  const description = sanitizeText(body.description);
  const companyLogoUrl = sanitizeText(body.companyLogoUrl);
  const location = sanitizeText(body.location);
  const workType = sanitizeText(body.workType) || 'onsite';
  const jobType = sanitizeText(body.jobType) || 'job';
  const visibility = sanitizeText(body.visibility) || 'public';
  const waAiScreeningEnabled = sanitizeOptionalBoolean(body.waAiScreeningEnabled);
  const recruiterIdInput = body.recruiterId;
  const closesAtInput = body.closesAt;
  const targetHireDateInput = body.targetHireDate;
  let recruiterIdUpdate: string | undefined;

  if (!title || !companyName || !description) {
    return NextResponse.json(
      { error: 'Title, company name, and description are required.' },
      { status: 400 }
    );
  }

  if (body.waAiScreeningEnabled !== undefined && waAiScreeningEnabled === undefined) {
    return NextResponse.json(
      { error: 'waAiScreeningEnabled must be true, false, or null.' },
      { status: 400 }
    );
  }

  const [{ data: currentJob, error: currentJobError }, currentMetadata] = await Promise.all([
    access.serviceClient
      .from('jobs')
      .select('id, apply_method, apply_intake_mode')
      .eq('id', params.id)
      .single(),
    loadJobOpportunityMetadata(access.serviceClient as any, params.id),
  ]);

  if (currentJobError || !currentJob) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const opportunityValidation = validateOpportunityConfiguration({
    jobType,
    visibility,
    internshipTrack: body.internshipTrack,
    eligibleRoles: body.eligibleRoles,
    applyMethod: body.applyMethod || currentJob.apply_method,
    applyIntakeMode: body.applyIntakeMode ?? currentJob.apply_intake_mode,
    internshipRequirements:
      body.internshipRequirements === undefined
        ? currentMetadata.data
        : body.internshipRequirements,
  });

  if (!opportunityValidation.valid) {
    return NextResponse.json(
      { error: opportunityValidation.errors.join(' ') },
      { status: 400 }
    );
  }

  if (recruiterIdInput !== undefined) {
    if (!access.isActiveAdmin) {
      return NextResponse.json(
        { error: 'Only admins can reassign recruiter management for this job.' },
        { status: 403 }
      );
    }

    const requestedRecruiterId = normalizeOptionalId(recruiterIdInput);
    if (!requestedRecruiterId) {
      return NextResponse.json(
        { error: 'recruiterId must be a valid user id when provided.' },
        { status: 400 }
      );
    }

    if (requestedRecruiterId !== access.userId) {
      const { data: recruiterProfile, error: recruiterProfileError } = await access.serviceClient
        .from('profiles')
        .select('id, role')
        .eq('id', requestedRecruiterId)
        .maybeSingle();

      if (
        recruiterProfileError ||
        !recruiterProfile ||
        recruiterProfile.role !== 'recruiter'
      ) {
        return NextResponse.json(
          { error: 'Selected recruiter is invalid or does not have recruiter role.' },
          { status: 400 }
        );
      }
    }

    const { data: recruiterRecord, error: recruiterRecordError } = await access.serviceClient
      .from('recruiters')
      .select('id')
      .eq('id', requestedRecruiterId)
      .maybeSingle();

    if (!recruiterRecord && requestedRecruiterId === access.userId) {
      const { error: createRecruiterError } = await access.serviceClient
        .from('recruiters')
        .insert({
          id: access.userId,
          company_name: companyName || 'Joblinca',
          verified: true,
        });

      if (createRecruiterError) {
        return NextResponse.json(
          { error: createRecruiterError.message || 'Unable to prepare admin recruiter profile.' },
          { status: 500 }
        );
      }
    } else if (recruiterRecordError || !recruiterRecord) {
      return NextResponse.json(
        { error: 'Selected recruiter must complete recruiter setup before assignment.' },
        { status: 400 }
      );
    }

    recruiterIdUpdate = requestedRecruiterId;
  }

  let salary: number | null = null;
  if (body.salary !== undefined && body.salary !== null && body.salary !== '') {
    const parsedSalary = Number(body.salary);

    if (Number.isNaN(parsedSalary) || parsedSalary < 0) {
      return NextResponse.json(
        { error: 'Salary must be a valid non-negative number.' },
        { status: 400 }
      );
    }

    salary = parsedSalary;
  }

  let closesAtUpdate: string | null | undefined;
  if (closesAtInput !== undefined) {
    if (closesAtInput === null || closesAtInput === '') {
      closesAtUpdate = null;
    } else if (typeof closesAtInput === 'string') {
      const parsed = new Date(closesAtInput);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Application deadline must be a valid date.' },
          { status: 400 }
        );
      }
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: 'Application deadline must be in the future.' },
          { status: 400 }
        );
      }
      closesAtUpdate = parsed.toISOString();
    } else {
      return NextResponse.json(
        { error: 'Application deadline must be a valid date.' },
        { status: 400 }
      );
    }
  }

  let targetHireDateUpdate: string | null | undefined;
  if (targetHireDateInput !== undefined) {
    if (targetHireDateInput === null || targetHireDateInput === '') {
      targetHireDateUpdate = null;
    } else if (typeof targetHireDateInput === 'string') {
      const parsed = new Date(targetHireDateInput);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: 'Target hire date must be a valid date.' },
          { status: 400 }
        );
      }
      targetHireDateUpdate = targetHireDateInput.trim();
    } else {
      return NextResponse.json(
        { error: 'Target hire date must be a valid date.' },
        { status: 400 }
      );
    }
  }

  const { data: job, error } = await access.serviceClient
    .from('jobs')
    .update({
      title,
      company_name: companyName,
      company_logo_url: companyLogoUrl,
      location,
      salary,
      work_type: workType,
      job_type: opportunityValidation.normalized.jobType,
      internship_track: opportunityValidation.normalized.internshipTrack,
      visibility: opportunityValidation.normalized.visibility,
      eligible_roles: opportunityValidation.normalized.eligibleRoles,
      apply_intake_mode: opportunityValidation.normalized.applyIntakeMode,
      description,
      closes_at: closesAtUpdate === undefined ? undefined : closesAtUpdate,
      target_hire_date:
        targetHireDateUpdate === undefined ? undefined : targetHireDateUpdate,
      recruiter_id: recruiterIdUpdate,
      wa_ai_screening_enabled:
        waAiScreeningEnabled === undefined ? undefined : waAiScreeningEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select(
      `
      id,
      posted_by,
      recruiter_id,
      title,
      company_name,
      company_logo_url,
      location,
      salary,
      work_type,
      job_type,
      internship_track,
      eligible_roles,
      apply_intake_mode,
      visibility,
      description,
      closes_at,
      target_hire_date,
      lifecycle_status,
      reopen_count,
      last_reopened_at,
      wa_ai_screening_enabled
    `
    )
    .single();

  if (error || !job) {
    console.error('Job update error:', error);
    return NextResponse.json({ error: 'Failed to update job.' }, { status: 500 });
  }

  const metadataResult = await persistJobOpportunityMetadata(
    access.serviceClient as any,
    params.id,
    opportunityValidation.normalized
  );

  if (metadataResult.error) {
    console.error('Job internship metadata update error:', metadataResult.error);
    return NextResponse.json(
      { error: metadataResult.error.message || 'Failed to update internship configuration.' },
      { status: 500 }
    );
  }

  const refreshedMetadata = await loadJobOpportunityMetadata(access.serviceClient as any, params.id);

  return NextResponse.json({
    success: true,
    job: {
      ...job,
      internship_requirements: refreshedMetadata.data,
    },
  });
}
