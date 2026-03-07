import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

function parseLimit(value: string | null): number {
  const parsed = Number(value || '20');
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
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
  const status = (searchParams.get('status') || 'active').trim();
  const challengeType = (searchParams.get('type') || '').trim();
  const domain = (searchParams.get('domain') || '').trim();
  const limit = parseLimit(searchParams.get('limit'));

  let query = supabase
    .from('talent_challenges')
    .select(
      'id, slug, title, title_fr, description, description_fr, challenge_type, domain, difficulty, starts_at, ends_at, timezone, status, max_ranked_attempts, top_n, config, created_at, updated_at'
    )
    .order('starts_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }
  if (challengeType) {
    query = query.eq('challenge_type', challengeType);
  }
  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data: challenges, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const challengeRows = challenges || [];
  if (challengeRows.length === 0) {
    return NextResponse.json([]);
  }

  const challengeIds = challengeRows.map((challenge) => challenge.id);
  const { data: submissions, error: submissionsError } = await supabase
    .from('talent_challenge_submissions')
    .select('id, challenge_id, attempt_no, status, final_score, created_at')
    .eq('user_id', user.id)
    .in('challenge_id', challengeIds)
    .order('attempt_no', { ascending: false });

  if (submissionsError) {
    return NextResponse.json({ error: submissionsError.message }, { status: 500 });
  }

  const grouped = new Map<
    string,
    Array<{
      id: string;
      challenge_id: string;
      attempt_no: number;
      status: string;
      final_score: number | null;
      created_at: string;
    }>
  >();

  for (const submission of submissions || []) {
    const bucket = grouped.get(submission.challenge_id) || [];
    bucket.push(submission);
    grouped.set(submission.challenge_id, bucket);
  }

  const response = challengeRows.map((challenge) => {
    const rows = grouped.get(challenge.id) || [];
    return {
      ...challenge,
      attempts_used: rows.length,
      latest_submission: rows[0] || null,
    };
  });

  return NextResponse.json(response);
}
