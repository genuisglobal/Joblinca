import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { CourseRecommendation } from '@/lib/skillup/types';
import { buildSkillProfile } from '@/lib/skillup/skill-mapping';
import { z } from 'zod';
import { callAiJson, isAiConfigured } from '@/lib/ai/client';
import {
  buildCourseRecommendationSystemPrompt,
  buildCourseRecommendationUserPrompt,
} from '@/lib/ai/policies';

const courseRecommendationResponseSchema = z.object({
  recommendations: z
    .array(
      z.object({
        course_slug: z.string().trim().min(1),
        course_title: z.string().trim().min(1),
        reason: z.string().trim().min(1).max(220),
      })
    )
    .default([]),
});

export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, skills, career_goals')
    .eq('id', user.id)
    .single();

  const userRole = profile?.role || 'talent';

  let skillProfile;
  try {
    skillProfile = await buildSkillProfile(user.id, supabase);
  } catch {
    skillProfile = null;
  }

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
  for (const progress of completedProgress || []) {
    const slug = (progress as any).learning_modules?.learning_courses?.slug;
    if (slug) {
      completedSlugs.add(slug);
    }
  }

  const { data: allCourses } = await supabase
    .from('learning_courses')
    .select(`
      id, title, slug, difficulty, description, skill_categories,
      learning_tracks!inner (
        target_roles
      )
    `)
    .eq('published', true);

  const availableCourses = (allCourses || []).filter((course: any) => {
    const roles: string[] = course.learning_tracks?.target_roles || [];
    return roles.includes(userRole) && !completedSlugs.has(course.slug);
  });

  const { data: partnerCourses } = await supabase
    .from('partner_courses')
    .select('id, title, category, level, partner_name, url')
    .limit(20);

  const gapCategories = skillProfile
    ? skillProfile.categories
        .filter((category) => category.gap > 0)
        .sort((a, b) => b.gap - a.gap)
        .map((category) => category.slug)
    : [];

  if (isAiConfigured() && availableCourses.length > 0) {
    try {
      const { parsed } = await callAiJson({
        schema: courseRecommendationResponseSchema,
        temperature: 0.2,
        maxTokens: 500,
        timeoutMs: 12000,
        messages: [
          {
            role: 'system',
            content: buildCourseRecommendationSystemPrompt(),
          },
          {
            role: 'user',
            content: buildCourseRecommendationUserPrompt({
              userRole,
              skills: profile?.skills || [],
              careerGoals: profile?.career_goals || [],
              completedCourses: [...completedSlugs],
              gapCategories,
              partnerCourses: (partnerCourses || []).map(
                (course: any) => `${course.title} (${course.partner_name}, ${course.level})`
              ),
              availableCourses: availableCourses.map((course: any) => ({
                slug: course.slug,
                title: course.title,
                difficulty: course.difficulty,
                description: course.description || null,
                skillCategories: course.skill_categories || [],
              })),
            }),
          },
        ],
      });

      const availableBySlug = new Map(
        availableCourses.map((course: any) => [course.slug, course])
      );
      const aiRecommendations: CourseRecommendation[] = [];
      const seen = new Set<string>();

      for (const recommendation of parsed.recommendations ?? []) {
        const matchedCourse = availableBySlug.get(recommendation.course_slug);
        if (!matchedCourse || seen.has(recommendation.course_slug)) {
          continue;
        }

        seen.add(recommendation.course_slug);
        aiRecommendations.push({
          course_slug: recommendation.course_slug,
          course_title: matchedCourse.title || recommendation.course_title,
          reason: recommendation.reason,
        });
      }

      if (aiRecommendations.length > 0) {
        return NextResponse.json(aiRecommendations.slice(0, 3));
      }
    } catch {
      // Fall through to deterministic fallback.
    }
  }

  const scored = availableCourses.map((course: any) => {
    let score = 0;
    const categories: string[] = course.skill_categories || [];

    for (let index = 0; index < gapCategories.length; index += 1) {
      if (categories.includes(gapCategories[index])) {
        score += (gapCategories.length - index) * 10;
      }
    }

    const difficultyOrder: Record<string, number> = {
      beginner: 3,
      intermediate: 2,
      advanced: 1,
    };
    score += difficultyOrder[course.difficulty] || 0;

    return { course, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  const fallback: CourseRecommendation[] = top.map(({ course }) => {
    const categories: string[] = course.skill_categories || [];
    const matchingGap = gapCategories.find((gap) => categories.includes(gap));
    const reason = matchingGap
      ? `Addresses your ${matchingGap.replace(/-/g, ' ')} skill gap with a ${course.difficulty} learning path.`
      : `Recommended ${course.difficulty} course to strengthen your current skill profile.`;

    return {
      course_slug: course.slug,
      course_title: course.title,
      reason,
    };
  });

  return NextResponse.json(fallback);
}
