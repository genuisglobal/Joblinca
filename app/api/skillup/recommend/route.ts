import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { CourseRecommendation } from '@/lib/skillup/types';
import { buildSkillProfile } from '@/lib/skillup/skill-mapping';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, skills, career_goals')
    .eq('id', user.id)
    .single();

  const userRole = profile?.role || 'talent';

  // Build skill profile for gap analysis
  let skillProfile;
  try {
    skillProfile = await buildSkillProfile(user.id, supabase);
  } catch {
    skillProfile = null;
  }

  // Get completed courses
  const { data: completedProgress } = await supabase
    .from('learning_progress')
    .select(`
      module_id,
      quiz_score,
      learning_modules!inner (
        course_id,
        learning_courses!inner (
          slug
        )
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'completed');

  const completedSlugs = new Set<string>();
  const courseQuizScores: Record<string, number[]> = {};
  for (const p of completedProgress || []) {
    const slug = (p as any).learning_modules?.learning_courses?.slug;
    if (slug) {
      completedSlugs.add(slug);
      if ((p as any).quiz_score != null) {
        if (!courseQuizScores[slug]) courseQuizScores[slug] = [];
        courseQuizScores[slug].push((p as any).quiz_score);
      }
    }
  }

  // Get all available courses for this role (with skill_categories)
  const { data: allCourses } = await supabase
    .from('learning_courses')
    .select(`
      id, title, slug, difficulty, description, skill_categories,
      learning_tracks!inner (
        target_roles
      )
    `)
    .eq('published', true);

  const availableCourses = (allCourses || []).filter((c: any) => {
    const roles: string[] = c.learning_tracks?.target_roles || [];
    return roles.includes(userRole) && !completedSlugs.has(c.slug);
  });

  // Get partner courses for hybrid recommendations
  const { data: partnerCourses } = await supabase
    .from('partner_courses')
    .select('id, title, category, level, partner_name, url')
    .limit(20);

  // Gap categories (slugs sorted by gap desc)
  const gapCategories = skillProfile
    ? skillProfile.categories
        .filter((c) => c.gap > 0)
        .sort((a, b) => b.gap - a.gap)
        .map((c) => c.slug)
    : [];

  // Try AI recommendations if OpenAI key available
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && availableCourses.length > 0) {
    try {
      const gapInfo = gapCategories.length > 0
        ? `\nUser skill gaps (prioritize courses matching these): ${gapCategories.join(', ')}`
        : '';

      const partnerInfo = (partnerCourses || []).length > 0
        ? `\nPartner courses available: ${(partnerCourses || []).map((pc: any) => `${pc.title} (${pc.partner_name}, ${pc.level})`).join('; ')}`
        : '';

      const prompt = `You are a career advisor for Joblinca, a job platform focused on Cameroon.

User role: ${userRole}
User skills: ${JSON.stringify(profile?.skills || [])}
Career goals: ${JSON.stringify(profile?.career_goals || [])}
Completed courses: ${JSON.stringify([...completedSlugs])}${gapInfo}${partnerInfo}

Available courses:
${availableCourses.map((c: any) => `- ${c.slug}: ${c.title} (${c.difficulty}, categories: ${(c.skill_categories || []).join(',')}) - ${c.description}`).join('\n')}

Recommend exactly 3 courses from the available list. Prioritize courses that address skill gaps. Return JSON array:
[{"course_slug": "slug", "course_title": "Title", "reason": "Brief reason in 1 sentence referencing the skill gap if applicable"}]

Only return the JSON array, no other text.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          max_tokens: 500,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          const recommendations: CourseRecommendation[] = JSON.parse(content);
          return NextResponse.json(recommendations.slice(0, 3));
        }
      }
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Enhanced deterministic fallback: score by gap relevance
  const scored = availableCourses.map((c: any) => {
    let score = 0;
    const cats: string[] = c.skill_categories || [];

    // Gap relevance: courses matching top gap categories get bonus
    for (let i = 0; i < gapCategories.length; i++) {
      if (cats.includes(gapCategories[i])) {
        score += (gapCategories.length - i) * 10; // higher gap = higher bonus
      }
    }

    // Difficulty ordering (beginner first for new learners)
    const difficultyOrder: Record<string, number> = {
      beginner: 3,
      intermediate: 2,
      advanced: 1,
    };
    score += difficultyOrder[c.difficulty] || 0;

    return { course: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  const fallback: CourseRecommendation[] = top.map(({ course: c }) => {
    const cats: string[] = c.skill_categories || [];
    const matchingGap = gapCategories.find((g) => cats.includes(g));
    const reason = matchingGap
      ? `Addresses your ${matchingGap.replace('-', ' ')} skill gap — a ${c.difficulty} course to build key competencies.`
      : `Recommended ${c.difficulty} course to help you grow your skills.`;

    return {
      course_slug: c.slug,
      course_title: c.title,
      reason,
    };
  });

  return NextResponse.json(fallback);
}
