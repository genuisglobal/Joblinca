import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface CertificationLike {
  name: string;
  issuer: string;
  date: string;
}

function toDateLabel(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizeCertification(input: unknown): CertificationLike | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const issuer = typeof raw.issuer === 'string' ? raw.issuer.trim() : '';
  const date = typeof raw.date === 'string' ? raw.date.trim() : '';
  if (!name || !issuer) return null;
  return { name, issuer, date };
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const payload =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const includeBadges = payload.includeBadges !== false;
  const limitRaw = Number(payload.limit ?? 40);
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
    : 40;

  const { data: achievements, error: achievementsError } = await supabase
    .from('talent_achievements')
    .select('title, issuer, issued_at, metadata')
    .eq('user_id', user.id)
    .order('issued_at', { ascending: false })
    .limit(limit);

  if (achievementsError) {
    return NextResponse.json({ error: achievementsError.message }, { status: 500 });
  }

  const generated: CertificationLike[] = (achievements || []).map((item) => ({
    name: item.title || 'Challenge Achievement',
    issuer: item.issuer || 'Joblinca',
    date: toDateLabel(item.issued_at),
  }));

  if (includeBadges) {
    const { data: badges, error: badgesError } = await supabase
      .from('user_badges')
      .select('badge_type, badge_level, issued_at, metadata')
      .eq('user_id', user.id)
      .order('issued_at', { ascending: false })
      .limit(limit);

    if (badgesError) {
      return NextResponse.json({ error: badgesError.message }, { status: 500 });
    }

    for (const badge of badges || []) {
      const metadata =
        badge.metadata && typeof badge.metadata === 'object' && !Array.isArray(badge.metadata)
          ? (badge.metadata as Record<string, unknown>)
          : {};
      const customName =
        typeof metadata.badge_name === 'string' ? metadata.badge_name.trim() : '';
      const challengeTitle =
        typeof metadata.challenge_title === 'string'
          ? metadata.challenge_title.trim()
          : '';
      const weekKey =
        typeof metadata.week_key === 'string' ? metadata.week_key.trim() : '';

      const fallbackName =
        badge.badge_type === 'challenge_top_performer'
          ? `Top Performer - ${challengeTitle || 'Challenge'}${weekKey ? ` (${weekKey})` : ''}`
          : `${badge.badge_type} (${badge.badge_level || 'standard'})`;

      generated.push({
        name: customName || fallbackName,
        issuer: 'Joblinca',
        date: toDateLabel(badge.issued_at),
      });
    }
  }

  const existingCertificationsRaw = Array.isArray(payload.existingCertifications)
    ? payload.existingCertifications
    : Array.isArray((payload.resume as Record<string, unknown> | undefined)?.certifications)
      ? ((payload.resume as Record<string, unknown>).certifications as unknown[])
      : [];
  const existing = existingCertificationsRaw
    .map(normalizeCertification)
    .filter((item): item is CertificationLike => Boolean(item));

  const merged = [...existing, ...generated];
  const dedupeMap = new Map<string, CertificationLike>();
  for (const item of merged) {
    const key = `${item.name.toLowerCase()}|${item.issuer.toLowerCase()}|${item.date}`;
    if (!dedupeMap.has(key)) dedupeMap.set(key, item);
  }

  return NextResponse.json({
    additions: generated,
    merged_certifications: Array.from(dedupeMap.values()),
    counts: {
      achievements: (achievements || []).length,
      added: generated.length,
      merged: dedupeMap.size,
    },
  });
}
