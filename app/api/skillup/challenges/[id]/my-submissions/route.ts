import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function resolveChallengeId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  idOrSlug: string
): Promise<string | null> {
  const byId = await supabase
    .from('talent_challenges')
    .select('id')
    .eq('id', idOrSlug)
    .maybeSingle();
  if (byId.error) return null;
  if (byId.data?.id) return byId.data.id;

  const bySlug = await supabase
    .from('talent_challenges')
    .select('id')
    .eq('slug', idOrSlug)
    .maybeSingle();

  if (bySlug.error) return null;
  return bySlug.data?.id || null;
}

export async function GET(
  _request: Request,
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

  const challengeId = await resolveChallengeId(supabase, identifier);
  if (!challengeId) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('talent_challenge_submissions')
    .select(
      'id, challenge_id, attempt_no, status, auto_score, manual_score, final_score, completion_seconds, graded_by, graded_at, metadata, created_at, updated_at'
    )
    .eq('challenge_id', challengeId)
    .eq('user_id', user.id)
    .order('attempt_no', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
