import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveApplicationPayload } from '@/lib/applications/server';
import { isJobAcceptingApplications } from '@/lib/jobs/lifecycle';
import {
  type ApplicationBoostConsumption,
  consumeApplicationBoost,
} from '@/lib/skillup/application-boost';

type QuestionAnswer = {
  questionId: string;
  answer: string | string[] | boolean;
};

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
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

function applicationError(
  error: string,
  status: number,
  code: string,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json({ error, code, ...extra }, { status });
}

function isRowLevelSecurityError(error: DatabaseErrorLike | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return (
    error?.code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied')
  );
}

function resolveApplicationMutationError(
  error: DatabaseErrorLike | null | undefined,
  hasDraft: boolean
) {
  if (error?.code === '23505') {
    return {
      status: 409,
      code: 'application_duplicate',
      error: 'You have already applied to this opportunity.',
    };
  }

  if ((hasDraft && error?.code === 'PGRST116') || (hasDraft && isRowLevelSecurityError(error))) {
    return {
      status: 409,
      code: 'application_draft_out_of_sync',
      error:
        'Your saved application draft could not be finalized. Refresh the page and try submitting again.',
    };
  }

  if (isRowLevelSecurityError(error)) {
    return {
      status: 500,
      code: 'application_submission_blocked',
      error: 'Your application could not be submitted right now. Please try again in a moment.',
    };
  }

  return {
    status: 500,
    code: 'application_submit_failed',
    error: 'We could not submit your application right now. Please refresh the page and try again.',
  };
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
  const useBoost = body.useBoost === true || body.use_boost === true;

  if (['recruiter', 'admin', 'staff', 'field_agent'].includes(applicantRole)) {
    return NextResponse.json(
      { error: 'Only candidate accounts can apply to jobs' },
      { status: 403 }
    );
  }

  if (
    !isJobAcceptingApplications({
      published: resolved.data.job.published,
      approval_status: resolved.data.job.approval_status,
      lifecycle_status: resolved.data.job.lifecycle_status,
      closes_at: resolved.data.job.closes_at,
      removed_at: resolved.data.job.removed_at,
    })
  ) {
    return applicationError(
      'This job is not accepting applications',
      400,
      'job_not_accepting_applications'
    );
  }

  if (preview.eligibilityStatus === 'ineligible') {
    return applicationError(
      preview.blockingReasons[0] || 'This profile is not eligible for the opportunity',
      422,
      'application_ineligible',
      {
        eligibilityPreview: preview,
      }
    );
  }

  const { data: existingApplications, error: existingError } = await supabase
    .from('applications')
    .select('id, is_draft, started_at, created_at')
    .eq('job_id', jobId)
    .eq('applicant_id', user.id)
    .order('created_at', { ascending: false });

  if (existingError) {
    console.error('Failed to load existing applications', existingError);
    return applicationError(
      'We could not verify your existing applications right now. Please try again.',
      500,
      'application_lookup_failed'
    );
  }

  const existingSubmitted = (existingApplications || []).find(
    (application: { id: string; is_draft: boolean }) => !application.is_draft
  );

  if (existingSubmitted) {
    return applicationError(
      'You have already applied to this opportunity.',
      400,
      'application_duplicate'
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

  let boostConsumption: ApplicationBoostConsumption | null = null;
  if (useBoost) {
    const consumeResult = await consumeApplicationBoost(user.id);
    if (!consumeResult.ok) {
      if (consumeResult.reason === 'no_active_boost') {
        return applicationError(
          'You don\'t have an active Quiz-Verified boost to apply.',
          422,
          'boost_unavailable'
        );
      }
      if (consumeResult.reason === 'boost_contention') {
        return applicationError(
          'Could not reserve your Quiz-Verified boost. Please retry.',
          409,
          'boost_contention'
        );
      }
      return applicationError(
        'Could not consume your Quiz-Verified boost right now.',
        500,
        'boost_consume_failed'
      );
    }
    boostConsumption = consumeResult.consumption;
  }

  const applicationValues: Record<string, unknown> = {
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

  if (boostConsumption) {
    applicationValues.quiz_verified = true;
    applicationValues.quiz_verified_meta = {
      boost_id: boostConsumption.boostId,
      week_key: boostConsumption.weekKey,
      domain: boostConsumption.domain,
      challenge_id: boostConsumption.challengeId,
      score: boostConsumption.score,
      rank: boostConsumption.rank,
      consumed_at: now,
    };
  }

  const serviceSupabase = createServiceSupabaseClient();

  const query = targetDraft
    ? serviceSupabase
        .from('applications')
        .update(applicationValues)
        .eq('id', targetDraft.id)
        .eq('applicant_id', user.id)
        .eq('is_draft', true)
        .select('*')
        .maybeSingle()
    : serviceSupabase.from('applications').insert(applicationValues).select('*').single();

  const { data: application, error } = await query;

  if (error || !application) {
    if (error) {
      console.error('Application submission failed', {
        error,
        jobId,
        applicantId: user.id,
        draftId: targetDraft?.id ?? null,
      });
    }

    const failure =
      !application && targetDraft
        ? {
            status: 409,
            code: 'application_draft_out_of_sync',
            error:
              'Your saved application draft could not be finalized. Refresh the page and try submitting again.',
          }
        : resolveApplicationMutationError(error, Boolean(targetDraft));
    return applicationError(failure.error, failure.status, failure.code);
  }

  return NextResponse.json(
    {
      application,
      eligibilityPreview: preview,
    },
    { status: targetDraft ? 200 : 201 }
  );
}
