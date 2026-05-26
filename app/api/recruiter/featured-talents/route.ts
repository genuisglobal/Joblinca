import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { ACTIVE_ADMIN_TYPES } from '@/lib/admin-types';
import { getUserSubscription } from '@/lib/subscriptions';
import { getRequestLocale } from '@/lib/i18n/server';
import { pickLocalized } from '@/lib/i18n/localized';

export const runtime = 'nodejs';

type SpotlightRow = {
  id: string;
  user_id: string;
  source_type: string;
  source_ref: string | null;
  domain: string | null;
  rank: number | null;
  week_key: string | null;
  headline: string | null;
  headline_fr: string | null;
  starts_at: string;
  ends_at: string;
  metadata: Record<string, unknown> | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const db = createServiceSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, admin_type')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 });
  }

  const isActiveAdmin = Boolean(
    profile.admin_type && ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
  );
  const isRecruiter = profile.role === 'recruiter';

  if (!isRecruiter && !isActiveAdmin) {
    return NextResponse.json(
      { error: 'Only recruiters and active admins can view featured talents.' },
      { status: 403 }
    );
  }

  if (!isActiveAdmin) {
    const subscription = await getUserSubscription(user.id);
    if (!subscription.isActive || subscription.plan?.role !== 'recruiter') {
      return NextResponse.json(
        { error: 'An active recruiter subscription is required.' },
        { status: 403 }
      );
    }
  }

  const searchParams = request.nextUrl.searchParams;
  const domainParam = (searchParams.get('domain') || '').trim();
  const limitRaw = Number(searchParams.get('limit') || '');
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(50, Math.floor(limitRaw)))
    : 21;

  const nowIso = new Date().toISOString();

  let spotlightQuery = db
    .from('talent_spotlights')
    .select(
      'id, user_id, source_type, source_ref, domain, rank, week_key, headline, headline_fr, starts_at, ends_at, metadata'
    )
    .gt('ends_at', nowIso)
    .order('domain', { ascending: true })
    .order('rank', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (domainParam) {
    spotlightQuery = spotlightQuery.eq('domain', domainParam);
  }

  const { data: spotlightsData, error: spotlightsError } = await spotlightQuery;
  if (spotlightsError) {
    return NextResponse.json({ error: spotlightsError.message }, { status: 500 });
  }

  const spotlights = (spotlightsData || []) as SpotlightRow[];
  if (spotlights.length === 0) {
    return NextResponse.json({ ok: true, locale: getRequestLocale(), items: [] });
  }

  const uniqueUserIds = Array.from(new Set(spotlights.map((s) => s.user_id)));
  const { data: profilesData, error: profilesLookupError } = await db
    .from('profiles')
    .select('id, full_name, avatar_url, role')
    .in('id', uniqueUserIds);

  if (profilesLookupError) {
    return NextResponse.json(
      { error: profilesLookupError.message },
      { status: 500 }
    );
  }

  const profileById = new Map<string, ProfileRow>();
  for (const row of (profilesData || []) as ProfileRow[]) {
    profileById.set(row.id, row);
  }

  const locale = getRequestLocale();
  const items = spotlights.map((spot) => {
    const localizedHeadline = pickLocalized(
      spot as unknown as Record<string, unknown>,
      'headline',
      locale
    );
    return {
      id: spot.id,
      domain: spot.domain,
      rank: spot.rank,
      week_key: spot.week_key,
      starts_at: spot.starts_at,
      ends_at: spot.ends_at,
      headline: localizedHeadline.value,
      served_language: localizedHeadline.served_language,
      talent: profileById.get(spot.user_id)
        ? {
            id: spot.user_id,
            full_name: profileById.get(spot.user_id)?.full_name ?? null,
            avatar_url: profileById.get(spot.user_id)?.avatar_url ?? null,
            role: profileById.get(spot.user_id)?.role ?? null,
          }
        : null,
      metadata: spot.metadata,
    };
  });

  return NextResponse.json({ ok: true, locale, items });
}
