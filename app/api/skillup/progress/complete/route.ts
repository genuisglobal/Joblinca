import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { gradeQuiz, calculateXP, computeStreakUpdate } from '@/lib/skillup/helpers';
import type { QuizQuestion } from '@/lib/skillup/types';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { moduleId, quizAnswers } = body;

  if (!moduleId || !Array.isArray(quizAnswers)) {
    return NextResponse.json(
      { error: 'moduleId and quizAnswers (number[]) are required' },
      { status: 400 }
    );
  }

  // Get the module to grade the quiz
  const { data: module, error: modError } = await supabase
    .from('learning_modules')
    .select('id, course_id, quiz_questions')
    .eq('id', moduleId)
    .single();

  if (modError || !module) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }

  const questions: QuizQuestion[] = module.quiz_questions || [];
  const score = gradeQuiz(questions, quizAnswers);

  // Upsert progress
  const { data: progress, error: progError } = await supabase
    .from('learning_progress')
    .upsert(
      {
        user_id: user.id,
        module_id: moduleId,
        status: 'completed',
        quiz_score: score,
        quiz_answers: quizAnswers,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,module_id' }
    )
    .select('*')
    .single();

  if (progError) {
    return NextResponse.json({ error: progError.message }, { status: 500 });
  }

  // Update streak
  const { data: existingStreak } = await supabase
    .from('learning_streaks')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const today = new Date().toISOString().split('T')[0];
  const streakAction = computeStreakUpdate(existingStreak?.last_activity_date || null);

  let newStreak: number;
  if (streakAction.action === 'increment') {
    newStreak = (existingStreak?.current_streak || 0) + 1;
  } else if (streakAction.action === 'reset') {
    newStreak = 1;
  } else {
    newStreak = existingStreak?.current_streak || 1;
  }

  const xpEarned = calculateXP(10, newStreak);
  const totalXP = (existingStreak?.xp_points || 0) + xpEarned;
  const totalModules = (existingStreak?.total_modules_completed || 0) + 1;
  const longestStreak = Math.max(newStreak, existingStreak?.longest_streak || 0);

  // Check if all modules in the course are now completed
  const { data: courseModules } = await supabase
    .from('learning_modules')
    .select('id')
    .eq('course_id', module.course_id)
    .eq('published', true);

  const { data: completedProgress } = await supabase
    .from('learning_progress')
    .select('module_id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .in(
      'module_id',
      (courseModules || []).map((m: any) => m.id)
    );

  const courseCompleted =
    courseModules &&
    completedProgress &&
    completedProgress.length >= courseModules.length;

  let totalCourses = existingStreak?.total_courses_completed || 0;
  if (courseCompleted) {
    totalCourses += 1;
  }

  if (existingStreak) {
    await supabase
      .from('learning_streaks')
      .update({
        current_streak: newStreak,
        longest_streak: longestStreak,
        last_activity_date: today,
        total_modules_completed: totalModules,
        total_courses_completed: totalCourses,
        xp_points: totalXP,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
  } else {
    await supabase.from('learning_streaks').insert({
      user_id: user.id,
      current_streak: newStreak,
      longest_streak: longestStreak,
      last_activity_date: today,
      total_modules_completed: totalModules,
      total_courses_completed: totalCourses,
      xp_points: totalXP,
    });
  }

  // Award badge on course completion
  let badgeAwarded = false;
  if (courseCompleted) {
    const { data: course } = await supabase
      .from('learning_courses')
      .select('id, title, difficulty')
      .eq('id', module.course_id)
      .single();

    if (course) {
      // Check if badge already exists
      const { data: existingBadge } = await supabase
        .from('user_badges')
        .select('id')
        .eq('user_id', user.id)
        .eq('badge_type', 'course_completion')
        .eq('metadata->>course_id', course.id)
        .maybeSingle();

      if (!existingBadge) {
        await supabase.from('user_badges').insert({
          user_id: user.id,
          badge_type: 'course_completion',
          badge_level: course.difficulty,
          metadata: {
            course_id: course.id,
            course_title: course.title,
          },
        }).select().maybeSingle();
        badgeAwarded = true;
      }
    }
  }

  return NextResponse.json({
    progress,
    quiz_score: score,
    xp_earned: xpEarned,
    streak: newStreak,
    course_completed: courseCompleted || false,
    badge_awarded: badgeAwarded,
  });
}
