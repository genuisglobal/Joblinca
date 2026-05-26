import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserSubscription } from '@/lib/subscriptions';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin-types';

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

  const accessTierFilter = (searchParams.get('access_tier') || '').trim();

  let query = supabase
    .from('talent_challenges')
    .select(
      'id, slug, title, title_fr, description, description_fr, challenge_type, domain, difficulty, starts_at, ends_at, timezone, status, max_ranked_attempts, top_n, config, access_tier, is_sponsored, sponsor_company, sponsor_prize_text, sponsor_prize_text_fr, created_at, updated_at'
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
  if (accessTierFilter === 'free' || accessTierFilter === 'paid') {
    query = query.eq('access_tier', accessTierFilter);
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

  // Compute unlock state once per request rather than per challenge.
  const hasPaidChallenges = challengeRows.some(
    (challenge) => challenge.access_tier === 'paid'
  );
  let hasActiveSubscription = false;
  let isAdminBypass = false;
  if (hasPaidChallenges) {
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('admin_type')
      .eq('id', user.id)
      .maybeSingle();
    isAdminBypass = Boolean(
      callerProfile?.admin_type &&
        ACTIVE_ADMIN_TYPES.includes(callerProfile.admin_type)
    );
    if (!isAdminBypass) {
      const subscription = await getUserSubscription(user.id);
      hasActiveSubscription = subscription.isActive;
    }
  }

  const response = challengeRows.map((challenge) => {
    const rows = grouped.get(challenge.id) || [];
    const isUnlocked =
      challenge.access_tier !== 'paid' || hasActiveSubscription || isAdminBypass;
    return {
      ...challenge,
      attempts_used: rows.length,
      latest_submission: rows[0] || null,
      is_unlocked: isUnlocked,
    };
  });

  return NextResponse.json(response);
}
