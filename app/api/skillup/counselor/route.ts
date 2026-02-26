import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { buildSkillProfile } from '@/lib/skillup/skill-mapping';
import { SKILL_CATEGORIES } from '@/lib/skillup/skill-categories';

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

  // Fetch or create session
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

  // Build context if new session or first message
  let contextSnapshot = session?.context_snapshot;
  if (!contextSnapshot) {
    try {
      const profile = await buildSkillProfile(user.id, supabase);

      // Fetch additional context
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('role, education, location, career_goals, skills')
        .eq('id', user.id)
        .single();

      // Fetch user's quiz scores
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

      // Fetch user badges
      const { data: badges } = await supabase
        .from('user_badges')
        .select('badge_type, badge_name')
        .eq('user_id', user.id);

      // Fetch partner courses for recommendations
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
        partner_courses: (partnerCourses || []).map((pc: any) => `${pc.title} (${pc.partner_name}, ${pc.level}, ${pc.cost_type})`),
      };
    } catch {
      contextSnapshot = { role: 'talent', skills: [], career_goals: [] };
    }
  }

  // Build messages array
  const existingMessages = session?.messages || [];
  const userMessage = {
    role: 'user' as const,
    content: message.trim(),
    timestamp: new Date().toISOString(),
  };
  const updatedMessages = [...existingMessages, userMessage];

  // Generate AI response
  let assistantContent: string;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      const ctx = contextSnapshot as any;
      const systemPrompt = `You are an AI career counselor for Joblinca, a job platform focused on Cameroon and Africa.

User Profile:
- Role: ${ctx.role} | Skills: ${(ctx.skills || []).join(', ') || 'Not specified'}
- Career Goals: ${(ctx.career_goals || []).join(', ') || 'Not specified'}
- Education: ${ctx.education || 'Not specified'} | Location: ${ctx.location || 'Not specified'}
- Completed Courses: ${(ctx.completed_courses || []).join(', ') || 'None yet'}
- Badges: ${(ctx.badges || []).join(', ') || 'None yet'}
- Average Quiz Score: ${ctx.avg_quiz_score !== null ? ctx.avg_quiz_score + '%' : 'No quizzes taken'}
- Skill Strengths: ${(ctx.top_strengths || []).join(', ')}
- Skill Gaps: ${(ctx.top_gaps || []).join(', ')}

Market Data:
- Top demanded skill areas: ${(ctx.top_demanded_categories || []).join(', ')}
- Available partner courses: ${(ctx.partner_courses || []).join('; ')}

Guidelines:
- Suggest specific skills to learn, career paths, partner courses, and Joblinca jobs
- Reference market demand data to justify recommendations
- All suggestions are advisory only — state this clearly when giving career-altering advice
- Do NOT reference protected characteristics (sex, religion, ethnicity, disability, age)
- Respond in the same language the user writes in (English or French)
- Keep responses under 300 words
- Be encouraging but realistic about the job market in Cameroon and Africa`;

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...updatedMessages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 600,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        assistantContent =
          data.choices?.[0]?.message?.content?.trim() ||
          generateFallbackResponse(contextSnapshot);
      } else {
        assistantContent = generateFallbackResponse(contextSnapshot);
      }
    } catch {
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

  // Generate title from first user message
  const title =
    session?.title && session.title !== 'New Conversation'
      ? session.title
      : message.trim().slice(0, 60) + (message.length > 60 ? '...' : '');

  // Save/update session
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

function generateFallbackResponse(context: any): string {
  const ctx = context || {};
  const gaps = ctx.top_gaps || [];
  const strengths = ctx.top_strengths || [];
  const courses = ctx.partner_courses || [];

  let response = 'Based on your profile analysis:\n\n';

  if (strengths.length > 0) {
    response += `**Your strengths:** ${strengths.join(', ')}. These are valuable skills in the current job market.\n\n`;
  }

  if (gaps.length > 0) {
    response += `**Areas to develop:** ${gaps.join(', ')}. These skills are in high demand and improving them could open new opportunities.\n\n`;
  }

  if (courses.length > 0) {
    const suggested = courses.slice(0, 3);
    response += `**Suggested courses:**\n`;
    for (const c of suggested) {
      response += `- ${c}\n`;
    }
    response += '\n';
  }

  response += '*Note: AI counseling is currently unavailable. This is an automated analysis based on your skill profile. All suggestions are advisory only.*';

  return response;
}
