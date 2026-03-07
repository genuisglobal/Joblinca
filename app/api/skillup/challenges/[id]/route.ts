import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getCurrentDoualaWeekWindow } from '@/lib/skillup/challenges';

async function fetchChallengeByIdOrSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  value: string
) {
  const byId = await supabase
    .from('talent_challenges')
    .select(
      'id, slug, title, title_fr, description, description_fr, challenge_type, domain, difficulty, starts_at, ends_at, timezone, status, max_ranked_attempts, top_n, config, created_at, updated_at'
    )
    .eq('id', value)
    .maybeSingle();

  if (byId.error) return { data: null, error: byId.error };
  if (byId.data) return { data: byId.data, error: null };

  const bySlug = await supabase
    .from('talent_challenges')
    .select(
      'id, slug, title, title_fr, description, description_fr, challenge_type, domain, difficulty, starts_at, ends_at, timezone, status, max_ranked_attempts, top_n, config, created_at, updated_at'
    )
    .eq('slug', value)
    .maybeSingle();

  return { data: bySlug.data, error: bySlug.error };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const identifier = (params.id || '').trim();
  if (!identifier) {
    return NextResponse.json({ error: 'Challenge ID is required' }, { status: 400 });
  }

  const { data: challenge, error } = await fetchChallengeByIdOrSlug(supabase, identifier);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const { data: mySubmissions, error: submissionError } = await supabase
    .from('talent_challenge_submissions')
    .select(
      'id, attempt_no, status, auto_score, manual_score, final_score, completion_seconds, created_at, graded_at, metadata'
    )
    .eq('challenge_id', challenge.id)
    .eq('user_id', user.id)
    .order('attempt_no', { ascending: false });

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 });
  }

  const currentWeek = getCurrentDoualaWeekWindow();
  const { data: leaderboardRows, error: leaderboardError } = await supabase
    .from('talent_weekly_leaderboards')
    .select('rank, score, user_id, metadata')
    .eq('challenge_id', challenge.id)
    .eq('week_key', currentWeek.weekKey)
    .order('rank', { ascending: true })
    .limit(challenge.top_n || 10);

  if (leaderboardError) {
    return NextResponse.json({ error: leaderboardError.message }, { status: 500 });
  }

  const topRows = leaderboardRows || [];
  const myLeaderboard = topRows.find((entry) => entry.user_id === user.id) || null;

  return NextResponse.json({
    challenge,
    attempts_used: (mySubmissions || []).length,
    my_submissions: mySubmissions || [],
    current_week: currentWeek,
    my_current_rank: myLeaderboard?.rank || null,
    leaderboard_preview: topRows,
  });
}
