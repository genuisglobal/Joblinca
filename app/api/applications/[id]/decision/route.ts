import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  recordApplicationActivity,
  requireAuthenticatedUser,
  requireRecruiterOwnedApplication,
} from '@/lib/hiring-pipeline/server';
import { moveApplicationToLegacyStatus } from '@/lib/hiring-pipeline/transitions';
import type { HiringDecisionStatus } from '@/lib/hiring-pipeline/types';

const VALID_DECISIONS: HiringDecisionStatus[] = ['active', 'hired', 'rejected', 'withdrawn'];

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser();
    const application = await requireRecruiterOwnedApplication(params.id, user.id);
    const body = await request.json();

    const decisionStatus =
      typeof body.decisionStatus === 'string' && VALID_DECISIONS.includes(body.decisionStatus)
        ? (body.decisionStatus as HiringDecisionStatus)
        : null;

    if (!decisionStatus) {
      return NextResponse.json(
        { error: `decisionStatus must be one of: ${VALID_DECISIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const dispositionReason =
      typeof body.dispositionReason === 'string' && body.dispositionReason.trim()
        ? body.dispositionReason.trim()
        : null;
    const note =
      typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

    const db = createServiceSupabaseClient();
    let updatedDecisionStatus = decisionStatus;
    let currentStage = application.currentStage;
    let legacyStatus = application.status;

    if (decisionStatus === 'hired' || decisionStatus === 'rejected') {
      const transition = await moveApplicationToLegacyStatus({
        applicationId: params.id,
        actorId: user.id,
        status: decisionStatus === 'hired' ? 'hired' : 'rejected',
        note,
        reason: dispositionReason || note || `decision_${decisionStatus}`,
        trigger: 'applications_decision_route',
      });

      currentStage = {
        id: transition.toStage.id,
        stageKey: transition.toStage.stage_key,
        label: transition.toStage.label,
        stageType: transition.toStage.stage_type,
        orderIndex: transition.toStage.order_index,
        isTerminal: transition.toStage.is_terminal,
        allowsFeedback: transition.toStage.allows_feedback,
      };
      legacyStatus = transition.legacyStatus;
    } else if (
      decisionStatus === 'active' &&
      (application.currentStage?.stageType === 'hire' ||
        application.currentStage?.stageType === 'rejected')
    ) {
      const transition = await moveApplicationToLegacyStatus({
        applicationId: params.id,
        actorId: user.id,
        status: 'shortlisted',
        note,
        reason: 'decision_reactivated',
        trigger: 'applications_decision_route',
      });

      currentStage = {
        id: transition.toStage.id,
        stageKey: transition.toStage.stage_key,
        label: transition.toStage.label,
        stageType: transition.toStage.stage_type,
        orderIndex: transition.toStage.order_index,
        isTerminal: transition.toStage.is_terminal,
        allowsFeedback: transition.toStage.allows_feedback,
      };
      legacyStatus = transition.legacyStatus;
    }

    const updatePayload: Record<string, unknown> = {
      decision_status: updatedDecisionStatus,
      disposition_reason: decisionStatus === 'active' ? null : dispositionReason,
      updated_at: new Date().toISOString(),
    };

    if (decisionStatus !== 'active' && !application.reviewed_at) {
      updatePayload.reviewed_at = new Date().toISOString();
    }

    const { data: updated, error } = await db
      .from('applications')
      .update(updatePayload)
      .eq('id', params.id)
      .select(
        `
        id,
        job_id,
        applicant_id,
        current_stage_id,
        status,
        decision_status,
        disposition_reason,
        reviewed_at
      `
      )
      .single();

    if (error || !updated) {
      throw new Error(error?.message || 'Failed to record decision');
    }

    await recordApplicationActivity({
      applicationId: params.id,
      actorId: user.id,
      action: 'decision_recorded',
      oldValue: application.decision_status || 'active',
      newValue: decisionStatus,
      metadata: {
        dispositionReason,
        note,
        currentStageId: currentStage?.id || null,
        currentStageKey: currentStage?.stageKey || null,
      },
    });

    return NextResponse.json({
      application: updated,
      currentStage,
      decisionStatus: updatedDecisionStatus,
      legacyStatus,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record decision';
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
