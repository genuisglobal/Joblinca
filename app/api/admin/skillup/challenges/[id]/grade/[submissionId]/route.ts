import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';
import { computeBlendedProjectScore, roundScore } from '@/lib/skillup/challenges';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; submissionId: string } }
) {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServerSupabaseClient();

    const challengeId = (params.id || '').trim();
    const submissionId = (params.submissionId || '').trim();
    if (!challengeId || !submissionId) {
      return NextResponse.json(
        { error: 'Challenge ID and submission ID are required' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;

    const { data: challenge, error: challengeError } = await supabase
      .from('talent_challenges')
      .select('id, challenge_type, config')
      .eq('id', challengeId)
      .maybeSingle();

    if (challengeError) {
      return NextResponse.json({ error: challengeError.message }, { status: 500 });
    }
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const { data: submission, error: submissionError } = await supabase
      .from('talent_challenge_submissions')
      .select(
        'id, challenge_id, auto_score, manual_score, final_score, status, metadata, user_id'
      )
      .eq('id', submissionId)
      .eq('challenge_id', challenge.id)
      .maybeSingle();

    if (submissionError) {
      return NextResponse.json({ error: submissionError.message }, { status: 500 });
    }
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const disqualify = Boolean(payload.disqualify);
    const note =
      typeof payload.note === 'string' && payload.note.trim()
        ? payload.note.trim().slice(0, 2000)
        : null;

    const updates: Record<string, unknown> = {
      graded_by: userId,
      graded_at: new Date().toISOString(),
    };

    if (disqualify) {
      updates.status = 'disqualified';
      updates.final_score = 0;
      updates.manual_score = null;
      updates.metadata = {
        ...(submission.metadata || {}),
        disqualified: true,
        disqualification_note: note,
      };
    } else {
      const manualScoreRaw = Number(payload.manual_score);
      if (!Number.isFinite(manualScoreRaw)) {
        return NextResponse.json(
          { error: 'manual_score must be provided as a number (0-100)' },
          { status: 422 }
        );
      }

      const manualScore = Math.max(0, Math.min(100, roundScore(manualScoreRaw)));
      const autoScore = Math.max(
        0,
        Math.min(100, roundScore(Number(submission.auto_score || 0)))
      );

      let finalScore = manualScore;
      if (challenge.challenge_type === 'project') {
        finalScore = computeBlendedProjectScore(
          autoScore,
          manualScore,
          challenge.config || {}
        );
      }

      updates.manual_score = manualScore;
      updates.final_score = finalScore;
      updates.status = 'graded';
      updates.metadata = {
        ...(submission.metadata || {}),
        disqualified: false,
        graded_note: note,
        grading_method:
          challenge.challenge_type === 'project'
            ? 'manual_ai_blend'
            : 'manual_override',
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('talent_challenge_submissions')
      .update(updates)
      .eq('id', submission.id)
      .select('*')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, submission: updated });
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to grade submission' },
      { status: 500 }
    );
  }
}
