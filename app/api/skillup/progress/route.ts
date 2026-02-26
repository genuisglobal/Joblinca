import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// GET: Get user's progress summary
export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Get streak data
  const { data: streak } = await supabase
    .from('learning_streaks')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Get all progress entries
  const { data: progress } = await supabase
    .from('learning_progress')
    .select('*')
    .eq('user_id', user.id);

  const completed = (progress || []).filter((p) => p.status === 'completed');
  const inProgress = (progress || []).filter((p) => p.status === 'in_progress');

  return NextResponse.json({
    streak: streak || {
      current_streak: 0,
      longest_streak: 0,
      last_activity_date: null,
      total_modules_completed: 0,
      total_courses_completed: 0,
      xp_points: 0,
    },
    completed_count: completed.length,
    in_progress_count: inProgress.length,
    progress: progress || [],
  });
}

// POST: Mark module as started
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();
  const { moduleId } = body;

  if (!moduleId) {
    return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
  }

  // Check if progress already exists
  const { data: existing } = await supabase
    .from('learning_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('module_id', moduleId)
    .single();

  if (existing) {
    return NextResponse.json(existing);
  }

  // Create new progress entry
  const { data: progress, error } = await supabase
    .from('learning_progress')
    .insert({
      user_id: user.id,
      module_id: moduleId,
      status: 'in_progress',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(progress);
}
