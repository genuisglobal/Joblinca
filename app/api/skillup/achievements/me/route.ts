import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function parseLimit(value: string | null): number {
  const parsed = Number(value || '50');
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get('limit'));

  const { data: achievements, error: achievementsError } = await supabase
    .from('talent_achievements')
    .select('*')
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (achievementsError) {
    return NextResponse.json({ error: achievementsError.message }, { status: 500 });
  }

  const { data: badges, error: badgesError } = await supabase
    .from('user_badges')
    .select('id, badge_type, badge_level, issued_at, metadata')
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (badgesError) {
    return NextResponse.json({ error: badgesError.message }, { status: 500 });
  }

  return NextResponse.json({
    achievements: achievements || [],
    badges: badges || [],
  });
}
