import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveApplicationPayload } from '@/lib/applications/server';

type QuestionAnswer = {
  questionId: string;
  answer: string | string[] | boolean;
};

function normalizeAnswers(value: unknown): QuestionAnswer[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (typeof record.questionId !== 'string') {
        return null;
      }

      const answer = record.answer;
      if (
        typeof answer === 'string' ||
        typeof answer === 'boolean' ||
        (Array.isArray(answer) && answer.every((entry) => typeof entry === 'string'))
      ) {
        return {
          questionId: record.questionId,
          answer,
        } as QuestionAnswer;
      }

      return null;
    })
    .filter(Boolean) as QuestionAnswer[];

  return normalized.length > 0 ? normalized : null;
}

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

// POST: Create or finalize a native application
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid application payload' }, { status: 400 });
  }

  const jobId = typeof body.jobId === 'string' ? body.jobId : '';
  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  const resolved = await resolveApplicationPayload(supabase, user.id, user.email, jobId, body);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { applicantRole, preview, contactInfo, resumeUrl, candidateSnapshot } = resolved.data;
  const coverLetter =
    typeof body.coverLetter === 'string' && body.coverLetter.trim().length > 0
      ? body.coverLetter.trim()
      : null;
  const answers = normalizeAnswers(body.answers);
  const applicationChannel =
    typeof body.applicationChannel === 'string' && body.applicationChannel.trim().length > 0
      ? body.applicationChannel.trim()
      : 'native_apply';
  const draftApplicationId =
    typeof body.draftApplicationId === 'string' && body.draftApplicationId.trim().length > 0
      ? body.draftApplicationId.trim()
      : null;

  if (['recruiter', 'admin', 'staff'].includes(applicantRole)) {
    return NextResponse.json(
      { error: 'Only candidate accounts can apply to jobs' },
      { status: 403 }
    );
  }

  if (!resolved.data.job.published) {
    return NextResponse.json(
      { error: 'This job is not accepting applications' },
      { status: 400 }
    );
  }

  if (
    resolved.data.job.approval_status &&
    resolved.data.job.approval_status !== 'approved'
  ) {
    return NextResponse.json(
      { error: 'This job is not accepting applications' },
      { status: 400 }
    );
  }

  if (preview.eligibilityStatus === 'ineligible') {
    return NextResponse.json(
      {
        error: preview.blockingReasons[0] || 'This profile is not eligible for the opportunity',
        eligibilityPreview: preview,
      },
      { status: 422 }
    );
  }

  const { data: existingApplications, error: existingError } = await supabase
    .from('applications')
    .select('id, is_draft, started_at, created_at')
    .eq('job_id', jobId)
    .eq('applicant_id', user.id)
    .order('created_at', { ascending: false });

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existingSubmitted = (existingApplications || []).find(
    (application: { id: string; is_draft: boolean }) => !application.is_draft
  );

  if (existingSubmitted) {
    return NextResponse.json(
      { error: 'You have already applied to this job' },
      { status: 400 }
    );
  }

  const targetDraft =
    (draftApplicationId
      ? (existingApplications || []).find(
          (application: { id: string }) => application.id === draftApplicationId
        )
      : null) ||
    (existingApplications || []).find(
      (application: { is_draft: boolean }) => application.is_draft
    ) ||
    null;

  const now = new Date().toISOString();
  const startedAt = targetDraft?.started_at || targetDraft?.created_at || now;
  const applicationValues = {
    job_id: jobId,
    applicant_id: user.id,
    contact_info: contactInfo,
    resume_url: resumeUrl,
    cover_letter: coverLetter,
    answers,
    status: 'submitted',
    is_draft: false,
    applicant_role: applicantRole,
    application_source: 'joblinca',
    application_channel: applicationChannel,
    started_at: startedAt,
    submitted_at: now,
    eligibility_status: preview.eligibilityStatus,
    eligibility_reasons: {
      blockingReasons: preview.blockingReasons,
      missingProfileFields: preview.missingProfileFields,
      recommendedProfileUpdates: preview.recommendedProfileUpdates,
      matchedSignals: preview.matchedSignals,
    },
    candidate_snapshot: candidateSnapshot,
  };

  const query = targetDraft
    ? supabase
        .from('applications')
        .update(applicationValues)
        .eq('id', targetDraft.id)
        .select('*')
        .single()
    : supabase.from('applications').insert(applicationValues).select('*').single();

  const { data: application, error } = await query;

  if (error || !application) {
    return NextResponse.json(
      { error: error?.message || 'Failed to create application' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      application,
      eligibilityPreview: preview,
    },
    { status: targetDraft ? 200 : 201 }
  );
}
