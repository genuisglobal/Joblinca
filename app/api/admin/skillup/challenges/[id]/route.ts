import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';
import { isChallengeStatus, isChallengeType } from '@/lib/skillup/challenges';

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const supabase = createServerSupabaseClient();

    const identifier = (params.id || '').trim();
    if (!identifier) {
      return NextResponse.json({ error: 'Challenge ID is required' }, { status: 400 });
    }

    const challengeId = await resolveChallengeId(supabase, identifier);
    if (!challengeId) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    if (typeof payload.slug === 'string' && payload.slug.trim()) {
      updates.slug = slugify(payload.slug);
    }
    if (typeof payload.title === 'string' && payload.title.trim()) {
      updates.title = payload.title.trim();
    }
    if (typeof payload.title_fr === 'string') {
      updates.title_fr = payload.title_fr.trim() || null;
    }
    if (typeof payload.description === 'string') {
      updates.description = payload.description.trim() || null;
    }
    if (typeof payload.description_fr === 'string') {
      updates.description_fr = payload.description_fr.trim() || null;
    }
    if (payload.challenge_type !== undefined) {
      if (!isChallengeType(payload.challenge_type)) {
        return NextResponse.json(
          { error: "challenge_type must be 'quiz' or 'project'" },
          { status: 422 }
        );
      }
      updates.challenge_type = payload.challenge_type;
    }
    if (typeof payload.domain === 'string') {
      updates.domain = payload.domain.trim() || null;
    }
    if (typeof payload.difficulty === 'string' && payload.difficulty.trim()) {
      updates.difficulty = payload.difficulty.trim();
    }
    if (typeof payload.timezone === 'string' && payload.timezone.trim()) {
      updates.timezone = payload.timezone.trim();
    }
    if (payload.status !== undefined) {
      if (!isChallengeStatus(payload.status)) {
        return NextResponse.json(
          { error: 'Invalid status. Use draft|active|closed|published' },
          { status: 422 }
        );
      }
      updates.status = payload.status;
    }
    if (typeof payload.starts_at === 'string' && payload.starts_at.trim()) {
      if (Number.isNaN(Date.parse(payload.starts_at))) {
        return NextResponse.json({ error: 'Invalid starts_at value' }, { status: 422 });
      }
      updates.starts_at = payload.starts_at;
    }
    if (typeof payload.ends_at === 'string' && payload.ends_at.trim()) {
      if (Number.isNaN(Date.parse(payload.ends_at))) {
        return NextResponse.json({ error: 'Invalid ends_at value' }, { status: 422 });
      }
      updates.ends_at = payload.ends_at;
    }
    if (payload.max_ranked_attempts !== undefined) {
      const parsed = Number(payload.max_ranked_attempts);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'max_ranked_attempts must be a positive integer' },
          { status: 422 }
        );
      }
      updates.max_ranked_attempts = Math.floor(parsed);
    }
    if (payload.top_n !== undefined) {
      const parsed = Number(payload.top_n);
      if (!Number.isFinite(parsed) || parsed < 1) {
        return NextResponse.json(
          { error: 'top_n must be a positive integer' },
          { status: 422 }
        );
      }
      updates.top_n = Math.floor(parsed);
    }
    if (
      payload.config &&
      typeof payload.config === 'object' &&
      !Array.isArray(payload.config)
    ) {
      updates.config = payload.config;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('talent_challenges')
      .update(updates)
      .eq('id', challengeId)
      .select('*')
      .single();

    if (error) {
      const statusCode = (error as { code?: string }).code === '23505' ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status: statusCode });
    }

    return NextResponse.json({ ok: true, challenge: data });
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update challenge' },
      { status: 500 }
    );
  }
}
