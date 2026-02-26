import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Get user profile to determine role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const userRole = profile?.role || 'talent';

  // Fetch all published tracks
  const { data: tracks, error } = await supabase
    .from('learning_tracks')
    .select(`
      *,
      learning_courses (
        id,
        learning_modules (
          id,
          learning_progress (
            id,
            status
          )
        )
      )
    `)
    .eq('published', true)
    .order('display_order');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter tracks by user role and compute progress
  const filteredTracks = (tracks || [])
    .filter((track: any) => track.target_roles.includes(userRole))
    .map((track: any) => {
      const courses = track.learning_courses || [];
      let totalModules = 0;
      let completedModules = 0;

      for (const course of courses) {
        const modules = course.learning_modules || [];
        totalModules += modules.length;
        for (const mod of modules) {
          const progress = mod.learning_progress || [];
          if (progress.some((p: any) => p.status === 'completed')) {
            completedModules++;
          }
        }
      }

      return {
        id: track.id,
        title: track.title,
        title_fr: track.title_fr,
        description: track.description,
        description_fr: track.description_fr,
        slug: track.slug,
        icon: track.icon,
        target_roles: track.target_roles,
        display_order: track.display_order,
        course_count: courses.length,
        progress_percent: totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0,
      };
    });

  return NextResponse.json(filteredTracks);
}
