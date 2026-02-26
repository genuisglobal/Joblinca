import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const featured = searchParams.get('featured');

  let query = supabase
    .from('partner_courses')
    .select('*')
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  if (featured === 'true') {
    query = query.eq('featured', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch partner courses:', error);
    return NextResponse.json({ error: 'Failed to fetch partner courses' }, { status: 500 });
  }

  return NextResponse.json(data || []);
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
  const { courseId } = body as { courseId: string };

  if (!courseId) {
    return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
  }

  // Increment referral click count via read-then-update
  const { data: course } = await supabase
    .from('partner_courses')
    .select('referral_clicks')
    .eq('id', courseId)
    .single();

  if (course) {
    await supabase
      .from('partner_courses')
      .update({ referral_clicks: (course.referral_clicks || 0) + 1 })
      .eq('id', courseId);
  }

  return NextResponse.json({ success: true });
}
