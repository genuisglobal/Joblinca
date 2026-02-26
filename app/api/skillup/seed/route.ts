import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { seedTracks } from '@/lib/skillup/seed-data';
import { partnerCourses } from '@/lib/skillup/partner-seed-data';

// Mapping of course slugs to skill categories for existing seed data
const COURSE_SKILL_CATEGORIES: Record<string, string[]> = {
  'problem-solving-for-work': ['communication', 'project-management'],
  'professional-communication': ['communication'],
  'git-github-basics': ['web-development', 'cloud'],
};

export async function POST() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .single();

  const isAdmin =
    profile?.role === 'admin' ||
    profile?.admin_type === 'superuser' ||
    profile?.admin_type === 'operations';

  if (!isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Use service role client to bypass RLS for seeding
  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }

  const serviceClient = createClient(serviceUrl, serviceKey);

  let trackCount = 0;
  let courseCount = 0;
  let moduleCount = 0;
  let partnerCount = 0;

  // Seed learning tracks, courses, and modules
  for (const trackData of seedTracks) {
    const { courses, ...trackFields } = trackData;

    // Upsert track by slug
    const { data: track, error: trackError } = await serviceClient
      .from('learning_tracks')
      .upsert(
        { ...trackFields, published: true },
        { onConflict: 'slug' }
      )
      .select('id')
      .single();

    if (trackError || !track) {
      console.error('Track error:', trackError);
      continue;
    }
    trackCount++;

    for (const courseData of courses) {
      const { modules, ...courseFields } = courseData;

      // Add skill_categories to course if defined in mapping
      const skillCategories = COURSE_SKILL_CATEGORIES[courseFields.slug] || [];

      const { data: course, error: courseError } = await serviceClient
        .from('learning_courses')
        .upsert(
          {
            ...courseFields,
            track_id: track.id,
            published: true,
            skill_categories: skillCategories,
          },
          { onConflict: 'slug' }
        )
        .select('id')
        .single();

      if (courseError || !course) {
        console.error('Course error:', courseError);
        continue;
      }
      courseCount++;

      for (const moduleData of modules) {
        const { data: mod, error: modError } = await serviceClient
          .from('learning_modules')
          .upsert(
            {
              ...moduleData,
              course_id: course.id,
              published: true,
            },
            { onConflict: 'course_id,display_order', ignoreDuplicates: false }
          )
          .select('id')
          .single();

        if (modError) {
          // Fallback: try insert directly (no unique constraint on modules)
          const { error: insertError } = await serviceClient
            .from('learning_modules')
            .insert({
              ...moduleData,
              course_id: course.id,
              published: true,
            });

          if (!insertError) moduleCount++;
          else console.error('Module error:', insertError);
        } else if (mod) {
          moduleCount++;
        }
      }
    }
  }

  // Seed partner courses
  for (const pc of partnerCourses) {
    const { error: pcError } = await serviceClient
      .from('partner_courses')
      .upsert(pc, { onConflict: 'partner_name,title' })
      .select('id')
      .single();

    if (pcError) {
      // Fallback: try insert
      const { error: insertError } = await serviceClient
        .from('partner_courses')
        .insert(pc);

      if (!insertError) partnerCount++;
      else console.error('Partner course error:', insertError);
    } else {
      partnerCount++;
    }
  }

  return NextResponse.json({
    success: true,
    seeded: {
      tracks: trackCount,
      courses: courseCount,
      modules: moduleCount,
      partner_courses: partnerCount,
    },
  });
}
