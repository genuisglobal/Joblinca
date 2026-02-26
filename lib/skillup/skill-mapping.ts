import type { SupabaseClient } from '@supabase/supabase-js';
import type { SkillProfile } from './types';
import {
  mapSkillsToCategories,
  extractDemandedSkills,
  analyzeSkillGaps,
} from './skill-categories';

/**
 * Builds a full skill profile for a user by aggregating:
 * - profile skills + career_goals
 * - completed course skill_categories
 * - job market demand from active listings
 */
export async function buildSkillProfile(
  userId: string,
  supabase: SupabaseClient,
): Promise<SkillProfile> {
  // 1. Fetch user profile (exclude sensitive fields like sex)
  const { data: profile } = await supabase
    .from('profiles')
    .select('skills, career_goals, education, location')
    .eq('id', userId)
    .single();

  const rawSkills: string[] = profile?.skills || [];
  const careerGoals: string[] = profile?.career_goals || [];

  // 2. Fetch completed courses with their skill_categories
  const { data: completedProgress } = await supabase
    .from('learning_progress')
    .select(`
      module_id,
      learning_modules!inner (
        course_id,
        learning_courses!inner (
          slug,
          skill_categories
        )
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'completed');

  const completedCourses: string[] = [];
  const completedCourseCategories: string[] = [];
  const seenSlugs = new Set<string>();

  for (const p of completedProgress || []) {
    const course = (p as any).learning_modules?.learning_courses;
    if (course?.slug && !seenSlugs.has(course.slug)) {
      seenSlugs.add(course.slug);
      completedCourses.push(course.slug);
      const cats: string[] = course.skill_categories || [];
      completedCourseCategories.push(...cats);
    }
  }

  // 3. Fetch recent job listings for market demand analysis
  const { data: jobs } = await supabase
    .from('jobs')
    .select('title, description, requirements')
    .eq('status', 'active')
    .limit(100);

  const jobTexts = (jobs || []).map(
    (j: any) =>
      `${j.title || ''} ${j.description || ''} ${
        Array.isArray(j.requirements) ? j.requirements.join(' ') : j.requirements || ''
      }`,
  );

  // 4. Compute scores
  const userSkillCounts = mapSkillsToCategories(rawSkills);
  const demandCounts = extractDemandedSkills(jobTexts);
  const categories = analyzeSkillGaps(
    userSkillCounts,
    completedCourseCategories,
    demandCounts,
  );

  // 5. Derive top gaps & strengths
  const sorted = [...categories];
  const topGaps = sorted
    .filter((c) => c.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);

  const topStrengths = sorted
    .sort((a, b) => b.userScore - a.userScore)
    .slice(0, 3);

  return {
    userId,
    categories,
    rawSkills,
    completedCourses,
    careerGoals,
    topGaps,
    topStrengths,
  };
}
