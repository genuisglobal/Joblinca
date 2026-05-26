import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';
import { isChallengeStatus, isChallengeType } from '@/lib/skillup/challenges';

const ACCESS_TIERS = ['free', 'paid'] as const;
type AccessTier = (typeof ACCESS_TIERS)[number];

function isAccessTier(value: unknown): value is AccessTier {
  return typeof value === 'string' && (ACCESS_TIERS as readonly string[]).includes(value);
}

async function resolveChallenge(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  idOrSlug: string
): Promise<{ id: string; access_tier: AccessTier; is_sponsored: boolean } | null> {
  const columns = 'id, access_tier, is_sponsored';
  const byId = await supabase
    .from('talent_challenges')
    .select(columns)
    .eq('id', idOrSlug)
    .maybeSingle();
  if (byId.error) return null;
  if (byId.data?.id) {
    return byId.data as { id: string; access_tier: AccessTier; is_sponsored: boolean };
  }

  const bySlug = await supabase
    .from('talent_challenges')
    .select(columns)
    .eq('slug', idOrSlug)
    .maybeSingle();
  if (bySlug.error) return null;
  return (bySlug.data as { id: string; access_tier: AccessTier; is_sponsored: boolean }) || null;
}

function asTrimmedStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

    const existing = await resolveChallenge(supabase, identifier);
    if (!existing) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }
    const challengeId = existing.id;

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

    let finalAccessTier: AccessTier = existing.access_tier;
    let finalIsSponsored: boolean = existing.is_sponsored;

    if (payload.access_tier !== undefined) {
      if (!isAccessTier(payload.access_tier)) {
        return NextResponse.json(
          { error: "access_tier must be 'free' or 'paid'" },
          { status: 422 }
        );
      }
      finalAccessTier = payload.access_tier;
      updates.access_tier = payload.access_tier;
    }

    if (payload.is_sponsored !== undefined) {
      if (typeof payload.is_sponsored !== 'boolean') {
        return NextResponse.json(
          { error: 'is_sponsored must be a boolean' },
          { status: 422 }
        );
      }
      finalIsSponsored = payload.is_sponsored;
      updates.is_sponsored = payload.is_sponsored;
    }

    if (finalIsSponsored && finalAccessTier !== 'paid') {
      return NextResponse.json(
        {
          error:
            'Sponsored challenges must have access_tier=paid. Update both fields together.',
        },
        { status: 422 }
      );
    }

    if (payload.sponsor_recruiter_id !== undefined) {
      updates.sponsor_recruiter_id = asTrimmedStringOrNull(payload.sponsor_recruiter_id);
    }
    if (payload.sponsor_company !== undefined) {
      updates.sponsor_company = asTrimmedStringOrNull(payload.sponsor_company);
    }
    if (payload.sponsor_prize_text !== undefined) {
      updates.sponsor_prize_text = asTrimmedStringOrNull(payload.sponsor_prize_text);
    }
    if (payload.sponsor_prize_text_fr !== undefined) {
      updates.sponsor_prize_text_fr = asTrimmedStringOrNull(payload.sponsor_prize_text_fr);
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
