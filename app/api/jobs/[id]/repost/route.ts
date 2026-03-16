import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin';
import { requireActiveSubscription } from '@/lib/subscriptions';
import { checkJobForScam } from '@/lib/scam-detection';
import { isJobPubliclyListable, resolveJobLifecycleStatus } from '@/lib/jobs/lifecycle';
import { validateOpportunityConfiguration } from '@/lib/opportunities';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import {
  loadJobOpportunityMetadata,
  persistJobOpportunityMetadata,
} from '@/lib/opportunities-server';

async function getAuthorizedJobManager(jobId: string) {
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
      .select(
        `
        id,
        recruiter_id,
        posted_by,
        title,
        description,
        location,
        salary,
        company_name,
        company_logo_url,
        work_type,
        job_type,
        internship_track,
        eligible_roles,
        visibility,
        apply_method,
        apply_intake_mode,
        external_apply_url,
        apply_email,
        apply_phone,
        apply_whatsapp,
        custom_questions,
        closes_at,
        target_hire_date,
        wa_ai_screening_enabled,
        approval_status,
        lifecycle_status,
        removed_at
      `
      )
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
        { error: 'Only the posting admin, assigned recruiter, or a super admin can repost jobs.' },
        { status: 403 }
      ),
    };
  }

  return {
    serviceClient,
    userId: user.id,
    adminType: profile?.admin_type || null,
    isActiveAdmin,
    job,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const access = await getAuthorizedJobManager(jobId);

  if ('error' in access) {
    return access.error;
  }

  if (!access.isActiveAdmin) {
    try {
      await requireActiveSubscription(access.userId, 'recruiter');
    } catch {
      return NextResponse.json(
        {
          error:
            'An active recruiter plan is required to repost a listing. Upgrade your recruiter subscription and try again.',
        },
        { status: 403 }
      );
    }
  }

  if ((access.job.lifecycle_status === 'removed' || access.job.approval_status === 'rejected') && !access.isActiveAdmin) {
    return NextResponse.json(
      { error: 'Removed jobs can only be reposted by an admin after review.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const closesAtInput =
    typeof body?.closesAt === 'string' && body.closesAt.trim().length > 0
      ? body.closesAt.trim()
      : null;
  const targetHireDateInput =
    typeof body?.targetHireDate === 'string' && body.targetHireDate.trim().length > 0
      ? body.targetHireDate.trim()
      : null;

  let normalizedClosesAt: string | null = null;
  if (closesAtInput) {
    const parsed = new Date(closesAtInput);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Application deadline must be a valid future date.' },
        { status: 400 }
      );
    }
    normalizedClosesAt = parsed.toISOString();
  } else if (access.job.closes_at) {
    const existingDeadline = new Date(access.job.closes_at);
    if (!Number.isNaN(existingDeadline.getTime()) && existingDeadline.getTime() > Date.now()) {
      normalizedClosesAt = existingDeadline.toISOString();
    }
  }

  let normalizedTargetHireDate: string | null = access.job.target_hire_date || null;
  if (targetHireDateInput) {
    const parsed = new Date(targetHireDateInput);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: 'Target hire date must be a valid date.' },
        { status: 400 }
      );
    }

    normalizedTargetHireDate = targetHireDateInput;
  }

  const scamResult = checkJobForScam(
    access.job.title,
    access.job.description || '',
    access.job.company_name || null
  );

  const autoApprove = access.isActiveAdmin && !scamResult.isSuspicious;
  const lifecycleStatus = resolveJobLifecycleStatus({
    published: autoApprove,
    approval_status: autoApprove ? 'approved' : 'pending',
    closes_at: normalizedClosesAt,
    removed_at: null,
    archived_at: null,
    filled_at: null,
  });
  const sourceMetadata = await loadJobOpportunityMetadata(access.serviceClient as any, jobId);

  if (sourceMetadata.error) {
    console.error('Job repost metadata load error:', sourceMetadata.error);
    return NextResponse.json(
      { error: sourceMetadata.error.message || 'Failed to load source internship configuration.' },
      { status: 500 }
    );
  }

  const { internshipTrack: metadataTrack, ...internshipRequirements } = sourceMetadata.data || {};
  const opportunityValidation = validateOpportunityConfiguration({
    jobType: access.job.job_type,
    visibility: access.job.visibility,
    internshipTrack: metadataTrack || access.job.internship_track,
    eligibleRoles: access.job.eligible_roles,
    applyMethod: access.job.apply_method,
    applyIntakeMode: access.job.apply_intake_mode,
    internshipRequirements: sourceMetadata.data ? internshipRequirements : null,
  });

  if (!opportunityValidation.valid) {
    return NextResponse.json(
      { error: `Unable to repost this job until its opportunity settings are corrected. ${opportunityValidation.errors.join(' ')}` },
      { status: 400 }
    );
  }

  const { data: repostedJob, error } = await access.serviceClient
    .from('jobs')
    .insert({
      recruiter_id: access.job.recruiter_id,
      title: access.job.title,
      description: access.job.description,
      location: access.job.location,
      salary: access.job.salary,
      company_name: access.job.company_name,
      company_logo_url: access.job.company_logo_url,
      work_type: access.job.work_type,
      job_type: opportunityValidation.normalized.jobType,
      internship_track: opportunityValidation.normalized.internshipTrack,
      eligible_roles: opportunityValidation.normalized.eligibleRoles,
      visibility: opportunityValidation.normalized.visibility,
      apply_method: access.job.apply_method,
      apply_intake_mode: opportunityValidation.normalized.applyIntakeMode,
      external_apply_url: access.job.external_apply_url,
      apply_email: access.job.apply_email,
      apply_phone: access.job.apply_phone,
      apply_whatsapp: access.job.apply_whatsapp,
      custom_questions: access.job.custom_questions,
      closes_at: normalizedClosesAt,
      target_hire_date: normalizedTargetHireDate,
      wa_ai_screening_enabled: access.job.wa_ai_screening_enabled,
      scam_score: scamResult.score,
      published: autoApprove,
      approval_status: autoApprove ? 'approved' : 'pending',
      lifecycle_status: lifecycleStatus,
      approved_at: autoApprove ? new Date().toISOString() : null,
      approved_by: autoApprove ? access.userId : null,
      posted_by: access.userId,
      posted_by_role: access.isActiveAdmin
        ? `admin_${access.adminType}`
        : 'recruiter',
      reposted_from_job_id: access.job.id,
    })
    .select('*')
    .single();

  if (error || !repostedJob) {
    console.error('Job repost error:', error);
    return NextResponse.json({ error: 'Failed to repost job.' }, { status: 500 });
  }

  const metadataResult = await persistJobOpportunityMetadata(
    access.serviceClient as any,
    repostedJob.id,
    opportunityValidation.normalized
  );

  if (metadataResult.error) {
    console.error('Job repost metadata error:', metadataResult.error);
    return NextResponse.json(
      { error: metadataResult.error.message || 'Failed to copy internship configuration.' },
      { status: 500 }
    );
  }

  if (isJobPubliclyListable(repostedJob)) {
    try {
      await dispatchJobMatchNotifications({
        jobId: repostedJob.id,
        trigger: 'job_reposted',
      });
    } catch (matchError) {
      console.error('Job matching dispatch failed after repost', matchError);
    }
  }

  return NextResponse.json({
    success: true,
    id: repostedJob.id,
    job: repostedJob,
  });
}
