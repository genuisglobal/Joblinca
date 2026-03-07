import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getCurrentDoualaWeekWindow,
  getDoualaWeekWindowFromKey,
} from '@/lib/skillup/challenges';

function parseLimit(raw: string | null): number {
  const parsed = Number(raw || '200');
  if (!Number.isFinite(parsed)) return 200;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
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
  const weekParam = (searchParams.get('week') || '').trim();
  const challengeId = (searchParams.get('challengeId') || '').trim();
  const domain = (searchParams.get('domain') || '').trim();
  const limit = parseLimit(searchParams.get('limit'));

  const weekWindow = weekParam
    ? getDoualaWeekWindowFromKey(weekParam)
    : getCurrentDoualaWeekWindow();
  if (!weekWindow) {
    return NextResponse.json(
      { error: 'Invalid week key. Use YYYY-Www (example: 2026-W10)' },
      { status: 422 }
    );
  }

  let query = supabase
    .from('talent_weekly_leaderboards')
    .select(
      'id, week_key, week_start, week_end, challenge_id, user_id, rank, score, tie_breaker, published_at, metadata, talent_challenges (id, slug, title, domain, challenge_type), profiles:user_id (id, full_name)'
    )
    .eq('week_key', weekWindow.weekKey)
    .order('rank', { ascending: true })
    .limit(limit);

  if (challengeId) {
    query = query.eq('challenge_id', challengeId);
  }
  if (domain) {
    query = query.eq('talent_challenges.domain', domain);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const grouped: Record<string, unknown[]> = {};
  for (const row of rows) {
    const key = row.challenge_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  return NextResponse.json({
    week: weekWindow,
    total: rows.length,
    rows,
    grouped_by_challenge: grouped,
  });
}
