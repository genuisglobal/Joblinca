import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { validateOpportunityConfiguration } from '@/lib/opportunities';
import { persistJobOpportunityMetadata } from '@/lib/opportunities-server';

export async function POST(request: Request) {
  try {
    const { userId, adminType } = await requireAdmin();

    const body = await request.json();
    const {
      title,
      companyName,
      companyLogoUrl,
      location,
      salary,
      workType,
      jobType,
      visibility,
      applyIntakeMode,
      description,
      autoApprove = true,
      published = true,
      customQuestions,
      recruiterId,
      internshipTrack,
      eligibleRoles,
      internshipRequirements,
    } = body;

    // Validate required fields
    if (!title || !description || !companyName) {
      return NextResponse.json(
        { error: 'Title, company name, and description are required' },
        { status: 400 }
      );
    }

    const opportunityValidation = validateOpportunityConfiguration({
      jobType,
      visibility,
      internshipTrack,
      eligibleRoles,
      applyIntakeMode,
      internshipRequirements,
    });

    if (!opportunityValidation.valid) {
      return NextResponse.json(
        { error: opportunityValidation.errors.join(' ') },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const requestedRecruiterId =
      typeof recruiterId === 'string' && recruiterId.trim().length > 0
        ? recruiterId.trim()
        : null;
    let assignedRecruiterId = userId;

    if (requestedRecruiterId && requestedRecruiterId !== userId) {
      const { data: recruiterProfile, error: recruiterProfileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', requestedRecruiterId)
        .maybeSingle();

      if (recruiterProfileError || !recruiterProfile || recruiterProfile.role !== 'recruiter') {
        return NextResponse.json(
          { error: 'Selected recruiter is invalid or does not have recruiter role' },
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
          { error: 'Selected recruiter must complete recruiter setup before assignment' },
          { status: 400 }
        );
      }

      assignedRecruiterId = requestedRecruiterId;
    }

    // First check if admin has a recruiter profile when posting for Joblinca/self
    const { data: recruiterProfile } = await supabase
      .from('recruiters')
      .select('id')
      .eq('id', assignedRecruiterId)
      .maybeSingle();

    // If posting as self and no recruiter profile exists, create a minimal one
    if (!recruiterProfile && assignedRecruiterId === userId) {
      await supabase.from('recruiters').insert({
        id: userId,
        company_name: companyName,
        verified: true,
      });
    }

    // Create the job
    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        recruiter_id: assignedRecruiterId,
        title,
        description,
        location: location || null,
        salary: salary || null,
        company_name: companyName,
        company_logo_url: companyLogoUrl || null,
        work_type: workType || 'onsite',
        job_type: opportunityValidation.normalized.jobType,
        internship_track: opportunityValidation.normalized.internshipTrack,
        visibility: opportunityValidation.normalized.visibility,
        eligible_roles: opportunityValidation.normalized.eligibleRoles,
        apply_intake_mode: opportunityValidation.normalized.applyIntakeMode,
        custom_questions: customQuestions || null,
        published: autoApprove ? published : false,
        approval_status: autoApprove ? 'approved' : 'pending',
        approved_at: autoApprove ? new Date().toISOString() : null,
        approved_by: autoApprove ? userId : null,
        posted_by: userId,
        posted_by_role: `admin_${adminType}`,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    }

    const metadataResult = await persistJobOpportunityMetadata(
      supabase as any,
      job.id,
      opportunityValidation.normalized
    );

    if (metadataResult.error) {
      console.error('Failed to persist admin job opportunity metadata:', metadataResult.error);
      return NextResponse.json(
        { error: metadataResult.error.message || 'Failed to save internship configuration' },
        { status: 500 }
      );
    }

    if (
      job.published === true &&
      (job.approval_status === 'approved' || job.approval_status === null)
    ) {
      try {
        await dispatchJobMatchNotifications({
          jobId: job.id,
          trigger: 'admin_job_create',
        });
      } catch (matchError) {
        console.error('Job matching dispatch failed after admin create', matchError);
      }
    }

    return NextResponse.json({ success: true, id: job.id, job });
  } catch (err) {
    console.error('Admin error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    );
  }
}
