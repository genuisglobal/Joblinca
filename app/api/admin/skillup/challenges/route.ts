import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';
import { isChallengeStatus, isChallengeType } from '@/lib/skillup/challenges';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAdmin();
    const supabase = createServerSupabaseClient();
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const slugInput =
      typeof payload.slug === 'string' && payload.slug.trim()
        ? payload.slug.trim()
        : title;
    const slug = slugify(slugInput);
    const challengeType = payload.challenge_type;
    const status = payload.status ?? 'draft';

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 422 });
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 422 });
    }
    if (!isChallengeType(challengeType)) {
      return NextResponse.json(
        { error: "challenge_type must be 'quiz' or 'project'" },
        { status: 422 }
      );
    }
    if (!isChallengeStatus(status)) {
      return NextResponse.json(
        { error: "status must be one of: draft, active, closed, published" },
        { status: 422 }
      );
    }

    const startsAtRaw = typeof payload.starts_at === 'string' ? payload.starts_at : '';
    const endsAtRaw = typeof payload.ends_at === 'string' ? payload.ends_at : '';
    const startsAt = startsAtRaw || new Date().toISOString();
    const endsAt =
      endsAtRaw || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    if (Number.isNaN(Date.parse(startsAt)) || Number.isNaN(Date.parse(endsAt))) {
      return NextResponse.json(
        { error: 'starts_at and ends_at must be valid ISO dates' },
        { status: 422 }
      );
    }

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return NextResponse.json(
        { error: 'ends_at must be after starts_at' },
        { status: 422 }
      );
    }

    const maxAttemptsRaw = Number(payload.max_ranked_attempts ?? 1);
    const topNRaw = Number(payload.top_n ?? 10);
    const maxAttempts = Number.isFinite(maxAttemptsRaw)
      ? Math.max(1, Math.min(20, Math.floor(maxAttemptsRaw)))
      : 1;
    const topN = Number.isFinite(topNRaw)
      ? Math.max(1, Math.min(100, Math.floor(topNRaw)))
      : 10;

    const config =
      payload.config && typeof payload.config === 'object' && !Array.isArray(payload.config)
        ? payload.config
        : {};

    const { data, error } = await supabase
      .from('talent_challenges')
      .insert({
        slug,
        title,
        title_fr:
          typeof payload.title_fr === 'string' ? payload.title_fr.trim() : null,
        description:
          typeof payload.description === 'string'
            ? payload.description.trim()
            : null,
        description_fr:
          typeof payload.description_fr === 'string'
            ? payload.description_fr.trim()
            : null,
        challenge_type: challengeType,
        domain:
          typeof payload.domain === 'string' ? payload.domain.trim() || null : null,
        difficulty:
          typeof payload.difficulty === 'string'
            ? payload.difficulty.trim()
            : 'beginner',
        starts_at: startsAt,
        ends_at: endsAt,
        timezone:
          typeof payload.timezone === 'string' && payload.timezone.trim()
            ? payload.timezone.trim()
            : 'Africa/Douala',
        status,
        max_ranked_attempts: maxAttempts,
        top_n: topN,
        config,
        created_by: userId,
      })
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
      { error: error instanceof Error ? error.message : 'Failed to create challenge' },
      { status: 500 }
    );
  }
}
