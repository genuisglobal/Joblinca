import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  createInitialInterviewPrepMessage,
  generateInterviewPrepPack,
  type InterviewPrepQuestionInput,
} from '@/lib/ai/interviewPrep';
import {
  buildInterviewPrepSessionTitle,
  normalizeInterviewPrepSessionRow,
} from '@/lib/interview-prep/sessions';
import { requireActiveSubscription } from '@/lib/subscriptions';

type Relation<T> = T | T[] | null | undefined;

interface JobRow {
  id: string;
  title: string | null;
  company_name: string | null;
  description: string | null;
  location: string | null;
  work_type: string | null;
  custom_questions: unknown;
}

interface ApplicationAnswerRow {
  questionId?: unknown;
  answer?: unknown;
}

function normalizeRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function formatAnswerValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (Array.isArray(value)) {
    const formatted = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return formatted.length > 0 ? formatted.join(', ') : null;
  }

  return null;
}

function normalizeCustomQuestions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const question = typeof record.question === 'string' ? record.question.trim() : '';
      if (!question) {
        return null;
      }

      return {
        id: typeof record.id === 'string' ? record.id : null,
        question,
        required: record.required === true,
      };
    })
    .filter(Boolean) as Array<{ id: string | null; question: string; required: boolean }>;
}

function buildScreeningQuestions(
  customQuestions: unknown,
  answers: unknown
): InterviewPrepQuestionInput[] {
  const questionList = normalizeCustomQuestions(customQuestions);
  const answerMap = new Map<string, string>();

  if (Array.isArray(answers)) {
    for (const item of answers as ApplicationAnswerRow[]) {
      if (typeof item?.questionId !== 'string') {
        continue;
      }

      const formattedAnswer = formatAnswerValue(item.answer);
      if (formattedAnswer) {
        answerMap.set(item.questionId, formattedAnswer);
      }
    }
  }

  return questionList.map((item) => ({
    question: item.question,
    required: item.required,
    answer: item.id ? answerMap.get(item.id) || null : null,
  }));
}

function resolveCandidateName(profile: Record<string, unknown> | null): string | null {
  if (!profile) {
    return null;
  }

  const fullName =
    typeof profile.full_name === 'string' ? profile.full_name.trim() : '';
  if (fullName) {
    return fullName;
  }

  const firstName =
    typeof profile.first_name === 'string' ? profile.first_name.trim() : '';
  const lastName =
    typeof profile.last_name === 'string' ? profile.last_name.trim() : '';
  const combined = `${firstName} ${lastName}`.trim();
  return combined || null;
}

function readObjectText(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function extractProfileSummary(careerInfo: unknown, candidateSnapshot: unknown): string | null {
  if (typeof careerInfo === 'string' && careerInfo.trim()) {
    return careerInfo.trim();
  }

  if (careerInfo && typeof careerInfo === 'object' && !Array.isArray(careerInfo)) {
    const summary = readObjectText(careerInfo as Record<string, unknown>, [
      'summary',
      'bio',
      'experienceSummary',
      'experience_summary',
      'about',
      'overview',
    ]);

    if (summary) {
      return summary;
    }
  }

  if (
    candidateSnapshot &&
    typeof candidateSnapshot === 'object' &&
    !Array.isArray(candidateSnapshot)
  ) {
    const snapshotRecord = candidateSnapshot as Record<string, unknown>;
    const professionalDetails =
      snapshotRecord.professionalDetails &&
      typeof snapshotRecord.professionalDetails === 'object' &&
      !Array.isArray(snapshotRecord.professionalDetails)
        ? (snapshotRecord.professionalDetails as Record<string, unknown>)
        : null;

    if (professionalDetails) {
      const summary = readObjectText(professionalDetails, [
        'experienceSummary',
        'projectHighlights',
      ]);

      if (summary) {
        return summary;
      }
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const applicationId =
      body && typeof body.applicationId === 'string' ? body.applicationId.trim() : '';

    if (!applicationId) {
      return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
    }

    let subscriptionPlanName: string | null = null;
    try {
      const subscription = await requireActiveSubscription(user.id, 'job_seeker');
      subscriptionPlanName = subscription.plan?.name || null;
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'An active job seeker subscription is required',
        },
        { status: 402 }
      );
    }

    const { data: application, error: applicationError } = await supabase
      .from('applications')
      .select(
        `
        id,
        created_at,
        cover_letter,
        answers,
        resume_url,
        candidate_snapshot,
        jobs:job_id (
          id,
          title,
          company_name,
          description,
          location,
          work_type,
          custom_questions
        )
      `
      )
      .eq('id', applicationId)
      .eq('applicant_id', user.id)
      .maybeSingle();

    const job = normalizeRelation(application?.jobs as Relation<JobRow>);

    if (applicationError || !application || !job?.title) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const [profileResult, jobSeekerProfileResult, nextInterviewResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, first_name, last_name, skills, location, career_goals')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('job_seeker_profiles')
        .select('headline, location, career_info, resume_url')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('application_interviews')
        .select('scheduled_at, timezone, mode, location, notes')
        .eq('application_id', applicationId)
        .eq('candidate_user_id', user.id)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const profile =
      profileResult.data && typeof profileResult.data === 'object'
        ? (profileResult.data as Record<string, unknown>)
        : null;
    const jobSeekerProfile =
      jobSeekerProfileResult.data && typeof jobSeekerProfileResult.data === 'object'
        ? (jobSeekerProfileResult.data as Record<string, unknown>)
        : null;

    const candidateLocation =
      (typeof jobSeekerProfile?.location === 'string' && jobSeekerProfile.location.trim()) ||
      (typeof profile?.location === 'string' && profile.location.trim()) ||
      null;

    const prep = await generateInterviewPrepPack({
      jobTitle: job.title,
      companyName: job.company_name || null,
      jobDescription: job.description || null,
      jobLocation: job.location || null,
      workType: job.work_type || null,
      candidateName: resolveCandidateName(profile),
      candidateHeadline:
        typeof jobSeekerProfile?.headline === 'string' ? jobSeekerProfile.headline.trim() : null,
      candidateLocation,
      candidateSkills: normalizeStringArray(profile?.skills),
      careerGoals: normalizeStringArray(profile?.career_goals),
      profileSummary: extractProfileSummary(
        jobSeekerProfile?.career_info,
        application.candidate_snapshot
      ),
      coverLetter:
        typeof application.cover_letter === 'string' ? application.cover_letter.trim() : null,
      hasResume: Boolean(
        application.resume_url ||
          (typeof jobSeekerProfile?.resume_url === 'string' &&
            jobSeekerProfile.resume_url.trim())
      ),
      screeningQuestions: buildScreeningQuestions(job.custom_questions, application.answers),
      nextInterview: nextInterviewResult.data
        ? {
            scheduledAt: nextInterviewResult.data.scheduled_at,
            timezone: nextInterviewResult.data.timezone || 'UTC',
            mode: nextInterviewResult.data.mode || 'video',
            location: nextInterviewResult.data.location || null,
            notes: nextInterviewResult.data.notes || null,
          }
        : null,
    });

    const title = buildInterviewPrepSessionTitle(job.title, job.company_name || null);
    const openingMessage = createInitialInterviewPrepMessage(prep);
    const contextSnapshot = {
      applicationId: application.id,
      createdAt: application.created_at,
      jobTitle: job.title,
      companyName: job.company_name || null,
      jobLocation: job.location || null,
      workType: job.work_type || null,
      interviewAt: nextInterviewResult.data?.scheduled_at || null,
      interviewTimezone: nextInterviewResult.data?.timezone || null,
      interviewMode: nextInterviewResult.data?.mode || null,
      subscriptionPlan: subscriptionPlanName,
    };

    const { data: sessionRow, error: sessionError } = await supabase
      .from('interview_prep_sessions')
      .insert({
        user_id: user.id,
        application_id: application.id,
        title,
        prep_pack: prep,
        context_snapshot: contextSnapshot,
        messages: [openingMessage],
      })
      .select('*')
      .single();

    if (sessionError || !sessionRow) {
      console.error('Interview prep session create error:', sessionError);
      return NextResponse.json(
        { error: 'Interview prep was generated but could not be saved' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      session: normalizeInterviewPrepSessionRow(sessionRow),
      generatedAt: new Date().toISOString(),
      subscriptionPlan: subscriptionPlanName,
    });
  } catch (error) {
    console.error('Interview prep route error:', error);
    return NextResponse.json(
      { error: 'Failed to generate interview prep' },
      { status: 500 }
    );
  }
}
