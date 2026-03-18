import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateInterviewPrepFollowUp } from '@/lib/ai/interviewPrep';
import {
  normalizeInterviewPrepSessionRow,
  withInterviewPrepSessionReadiness,
} from '@/lib/interview-prep/sessions';
import {
  buildInterviewPrepReadinessSummary,
  isInterviewPrepAttemptsTableMissing,
  normalizeInterviewPrepAttemptRow,
} from '@/lib/interview-prep/readiness';
import { requireActiveSubscription } from '@/lib/subscriptions';

function resolveAttemptQuestion(messages: Array<{ role: 'user' | 'assistant'; content: string; feedback?: { nextQuestion: string } | null }>): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') {
      continue;
    }

    if (message.feedback?.nextQuestion?.trim()) {
      return message.feedback.nextQuestion.trim();
    }

    const startMatch = message.content.match(/Start with this mock question:\s*([\s\S]+?)(?:\n\n|$)/i);
    if (startMatch?.[1]?.trim()) {
      return startMatch[1].trim();
    }

    const nextMatch = message.content.match(/Next question:\s*([\s\S]+?)(?:\n\n|$)/i);
    if (nextMatch?.[1]?.trim()) {
      return nextMatch[1].trim();
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    await requireActiveSubscription(user.id, 'job_seeker');
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

  const body = await request.json().catch(() => null);
  const sessionId =
    body && typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const messageText =
    body && typeof body.message === 'string' ? body.message.trim() : '';

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  if (!messageText) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('interview_prep_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const session = normalizeInterviewPrepSessionRow(sessionRow);
  const userMessage = {
    role: 'user' as const,
    content: messageText,
    timestamp: new Date().toISOString(),
  };

  const assistantResult = await generateInterviewPrepFollowUp({
    jobTitle:
      typeof session.contextSnapshot.jobTitle === 'string'
        ? session.contextSnapshot.jobTitle
        : session.title,
    companyName:
      typeof session.contextSnapshot.companyName === 'string'
        ? session.contextSnapshot.companyName
        : null,
    prepPack: session.prep,
    messages: session.messages,
    userMessage: messageText,
  });

  const updatedMessages = [...session.messages, userMessage, assistantResult.message];
  const attemptQuestion = resolveAttemptQuestion(session.messages);

  const { data: updatedRow, error: updateError } = await supabase
    .from('interview_prep_sessions')
    .update({
      messages: updatedMessages,
    })
    .eq('id', session.id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (updateError || !updatedRow) {
    console.error('Failed to update interview prep session chat:', updateError);
    return NextResponse.json(
      { error: 'Failed to save interview prep follow-up' },
      { status: 500 }
    );
  }

  const { error: attemptInsertError } = await supabase.from('interview_prep_attempts').insert({
    session_id: session.id,
    user_id: user.id,
    application_id: session.applicationId,
    question: attemptQuestion,
    user_message: messageText,
    feedback_json: assistantResult.feedback,
    overall_score: assistantResult.feedback.overallScore,
    model_used: assistantResult.modelUsed,
    tokens_used: assistantResult.tokensUsed,
  });

  if (attemptInsertError && !isInterviewPrepAttemptsTableMissing(attemptInsertError)) {
    console.error('Failed to persist interview prep attempt:', attemptInsertError);
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from('interview_prep_attempts')
    .select('*')
    .eq('user_id', user.id)
    .eq('session_id', session.id)
    .order('created_at', { ascending: false });

  if (attemptsError && !isInterviewPrepAttemptsTableMissing(attemptsError)) {
    console.error('Failed to fetch interview prep attempts after chat:', attemptsError);
  }

  const normalizedAttempts = (attempts || [])
    .map(normalizeInterviewPrepAttemptRow)
    .filter(Boolean) as NonNullable<ReturnType<typeof normalizeInterviewPrepAttemptRow>>[];
  const readiness = buildInterviewPrepReadinessSummary(normalizedAttempts);

  return NextResponse.json({
    message: assistantResult.message,
    feedback: assistantResult.feedback,
    session: withInterviewPrepSessionReadiness(
      normalizeInterviewPrepSessionRow(updatedRow),
      readiness,
      normalizedAttempts.slice(0, 5)
    ),
    modelUsed: assistantResult.modelUsed,
    tokensUsed: assistantResult.tokensUsed,
  });
}
