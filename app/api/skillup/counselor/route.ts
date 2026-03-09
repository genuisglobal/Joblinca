import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { buildSkillProfile } from '@/lib/skillup/skill-mapping';
import { callAiText, isAiConfigured } from '@/lib/ai/client';
import { buildCareerCounselorSystemPrompt } from '@/lib/ai/policies';

interface CounselorContextSnapshot {
  role: string;
  skills: string[];
  career_goals: string[];
  education?: string | null;
  location?: string | null;
  completed_courses: string[];
  badges: string[];
  avg_quiz_score?: number | null;
  top_gaps: string[];
  top_strengths: string[];
  top_demanded_categories: string[];
  partner_courses: string[];
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { message, sessionId } = body as {
    message: string;
    sessionId?: string;
  };

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  let session: any = null;
  if (sessionId) {
    const { data } = await supabase
      .from('career_counselor_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single();
    session = data;
  }

  let contextSnapshot = session?.context_snapshot as CounselorContextSnapshot | undefined;
  if (!contextSnapshot) {
    try {
      const profile = await buildSkillProfile(user.id, supabase);

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('role, education, location, career_goals, skills')
        .eq('id', user.id)
        .single();

      const { data: progress } = await supabase
        .from('learning_progress')
        .select('quiz_score')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('quiz_score', 'is', null);

      const quizScores = (progress || []).map((p: any) => p.quiz_score);
      const avgQuizScore =
        quizScores.length > 0
          ? Math.round(quizScores.reduce((a: number, b: number) => a + b, 0) / quizScores.length)
          : null;

      const { data: badges } = await supabase
        .from('user_badges')
        .select('badge_type, badge_name')
        .eq('user_id', user.id);

      const { data: partnerCourses } = await supabase
        .from('partner_courses')
        .select('title, category, level, cost_type, partner_name')
        .limit(20);

      contextSnapshot = {
        role: userProfile?.role || 'talent',
        skills: userProfile?.skills || [],
        career_goals: userProfile?.career_goals || [],
        education: userProfile?.education || null,
        location: userProfile?.location || null,
        completed_courses: profile.completedCourses,
        badges: (badges || []).map((b: any) => b.badge_name),
        avg_quiz_score: avgQuizScore,
        top_gaps: profile.topGaps.map((g) => g.label),
        top_strengths: profile.topStrengths.map((s) => s.label),
        top_demanded_categories: profile.categories
          .sort((a, b) => b.marketDemand - a.marketDemand)
          .slice(0, 5)
          .map((c) => c.label),
        partner_courses: (partnerCourses || []).map(
          (pc: any) => `${pc.title} (${pc.partner_name}, ${pc.level}, ${pc.cost_type})`
        ),
      };
    } catch {
      contextSnapshot = {
        role: 'talent',
        skills: [],
        career_goals: [],
        completed_courses: [],
        badges: [],
        avg_quiz_score: null,
        top_gaps: [],
        top_strengths: [],
        top_demanded_categories: [],
        partner_courses: [],
      };
    }
  }

  const existingMessages = session?.messages || [];
  const userMessage = {
    role: 'user' as const,
    content: message.trim(),
    timestamp: new Date().toISOString(),
  };
  const updatedMessages = [...existingMessages, userMessage];

  let assistantContent: string;
  if (isAiConfigured()) {
    try {
      const { text } = await callAiText({
        temperature: 0.4,
        maxTokens: 450,
        timeoutMs: 12000,
        messages: [
          {
            role: 'system',
            content: buildCareerCounselorSystemPrompt({
              role: contextSnapshot.role || 'talent',
              skills: contextSnapshot.skills || [],
              careerGoals: contextSnapshot.career_goals || [],
              education: contextSnapshot.education || null,
              location: contextSnapshot.location || null,
              completedCourses: contextSnapshot.completed_courses || [],
              badges: contextSnapshot.badges || [],
              avgQuizScore:
                contextSnapshot.avg_quiz_score === undefined
                  ? null
                  : contextSnapshot.avg_quiz_score,
              topStrengths: contextSnapshot.top_strengths || [],
              topGaps: contextSnapshot.top_gaps || [],
              topDemandedCategories: contextSnapshot.top_demanded_categories || [],
              partnerCourses: contextSnapshot.partner_courses || [],
            }),
          },
          ...updatedMessages.map((entry: any) => ({
            role: entry.role,
            content: entry.content,
          })),
        ],
      });

      assistantContent = text.trim() || generateFallbackResponse(contextSnapshot);
    } catch (error) {
      console.error('Career counselor AI error:', error);
      assistantContent = generateFallbackResponse(contextSnapshot);
    }
  } else {
    assistantContent = generateFallbackResponse(contextSnapshot);
  }

  const assistantMessage = {
    role: 'assistant' as const,
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };
  const finalMessages = [...updatedMessages, assistantMessage];

  const title =
    session?.title && session.title !== 'New Conversation'
      ? session.title
      : message.trim().slice(0, 60) + (message.length > 60 ? '...' : '');

  let savedSessionId = session?.id;
  if (session) {
    await supabase
      .from('career_counselor_sessions')
      .update({
        messages: finalMessages,
        title,
        context_snapshot: contextSnapshot,
      })
      .eq('id', session.id);
  } else {
    const { data: newSession } = await supabase
      .from('career_counselor_sessions')
      .insert({
        user_id: user.id,
        title,
        messages: finalMessages,
        context_snapshot: contextSnapshot,
      })
      .select('id')
      .single();
    savedSessionId = newSession?.id;
  }

  return NextResponse.json({
    message: assistantMessage,
    sessionId: savedSessionId,
    title,
  });
}

function generateFallbackResponse(context: CounselorContextSnapshot): string {
  const gaps = context.top_gaps || [];
  const strengths = context.top_strengths || [];
  const courses = context.partner_courses || [];

  let response = 'AI guidance unavailable. Showing profile-based recommendations only.\n\n';

  if (strengths.length > 0) {
    response += `Your strongest signals: ${strengths.join(', ')}. These are relevant in the current market.\n\n`;
  }

  if (gaps.length > 0) {
    response += `Priority areas to improve: ${gaps.join(', ')}. Strengthening them should improve your options.\n\n`;
  }

  if (courses.length > 0) {
    response += 'Suggested courses:\n';
    for (const course of courses.slice(0, 3)) {
      response += `- ${course}\n`;
    }
    response += '\n';
  }

  response +=
    'These suggestions are advisory only. Compare them against your goals, current market demand, and recruiter feedback.';

  return response;
}
