import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  loadApplicationFeedback,
  loadJobPipelineBundle,
  recordApplicationActivity,
  refreshApplicationOverallStageScore,
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';
import type { FeedbackRecommendation } from '@/lib/hiring-pipeline/types';

const VALID_RECOMMENDATIONS: FeedbackRecommendation[] = [
  'strong_yes',
  'yes',
  'mixed',
  'no',
  'strong_no',
];

function normalizeFeedbackPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    await requireRecruiterOwnedApplication(params.id, user.id);
    const feedback = await loadApplicationFeedback(params.id);

    return NextResponse.json({ feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load application feedback';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    const application = await requireRecruiterOwnedApplication(params.id, user.id);
    const body = await request.json();

    const summary =
      typeof body.summary === 'string' && body.summary.trim()
        ? body.summary.trim()
        : null;
    const score =
      typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : null;
    const recommendation =
      typeof body.recommendation === 'string' &&
      VALID_RECOMMENDATIONS.includes(body.recommendation as FeedbackRecommendation)
        ? (body.recommendation as FeedbackRecommendation)
        : null;

    if (score === null && !summary && !recommendation) {
      return NextResponse.json(
        { error: 'Provide at least a score, summary, or recommendation' },
        { status: 400 }
      );
    }

    const bundle = await loadJobPipelineBundle(application.job_id);
    const stageId =
      typeof body.stageId === 'string' && body.stageId.trim()
        ? body.stageId.trim()
        : application.current_stage_id;

    if (!stageId) {
      return NextResponse.json(
        { error: 'Application does not have a current stage yet' },
        { status: 400 }
      );
    }

    const stage = bundle.pipeline.stages.find((item) => item.id === stageId);
    if (!stage) {
      return NextResponse.json({ error: 'Invalid stage for feedback' }, { status: 400 });
    }

    const scorecardId =
      typeof body.scorecardId === 'string' && body.scorecardId.trim()
        ? body.scorecardId.trim()
        : null;

    const db = createServiceSupabaseClient();
    const { data, error } = await db
      .from('application_stage_feedback')
      .insert({
        application_id: params.id,
        job_pipeline_stage_id: stage.id,
        reviewer_id: user.id,
        interview_scorecard_id: scorecardId,
        score: score ?? 0,
        recommendation,
        summary,
        feedback: normalizeFeedbackPayload(body.feedback),
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(error?.message || 'Failed to save application feedback');
    }

    await refreshApplicationOverallStageScore(params.id);

    await recordApplicationActivity({
      applicationId: params.id,
      actorId: user.id,
      action: 'feedback_submitted',
      metadata: {
        stageId: stage.id,
        stageKey: stage.stageKey,
        score,
        recommendation,
        scorecardId,
      },
    });

    if (scorecardId) {
      await recordApplicationActivity({
        applicationId: params.id,
        actorId: user.id,
        action: 'scorecard_completed',
        metadata: {
          stageId: stage.id,
          stageKey: stage.stageKey,
          scorecardId,
        },
      });
    }

    const feedback = await loadApplicationFeedback(params.id);
    const inserted = feedback.find((item) => item.id === (data as { id: string }).id) || null;

    return NextResponse.json(
      {
        feedback: inserted,
        allFeedback: feedback,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save application feedback';
    const status =
      message === 'Authentication required'
        ? 401
        : message === 'Not authorized'
          ? 403
          : message === 'Application not found'
            ? 404
            : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
