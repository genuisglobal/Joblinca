import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { courseId: string } }
) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // courseId can be a UUID or a slug
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.courseId);

  let query = supabase
    .from('learning_courses')
    .select(`
      *,
      learning_tracks!inner (
        id, title, title_fr, slug
      ),
      learning_modules (
        id,
        title,
        title_fr,
        content_type,
        video_url,
        article_body,
        article_body_fr,
        external_url,
        duration_minutes,
        quiz_questions,
        display_order,
        published,
        learning_progress (
          id,
          user_id,
          status,
          quiz_score,
          quiz_answers,
          started_at,
          completed_at
        )
      )
    `)
    .eq('published', true);

  if (isUUID) {
    query = query.eq('id', params.courseId);
  } else {
    query = query.eq('slug', params.courseId);
  }

  const { data: course, error } = await query.single();

  if (error || !course) {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  }

  // Sort modules by display_order and attach progress
  const modules = ((course as any).learning_modules || [])
    .filter((m: any) => m.published)
    .sort((a: any, b: any) => a.display_order - b.display_order)
    .map((mod: any) => {
      const userProgress = (mod.learning_progress || []).find(
        (p: any) => p.user_id === user.id
      );
      return {
        ...mod,
        learning_progress: undefined,
        progress: userProgress || null,
      };
    });

  const completedCount = modules.filter(
    (m: any) => m.progress?.status === 'completed'
  ).length;

  return NextResponse.json({
    ...course,
    learning_modules: undefined,
    track: (course as any).learning_tracks,
    learning_tracks: undefined,
    modules,
    module_count: modules.length,
    completed_count: completedCount,
  });
}
