import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { DEMO_SPONSOR_CAMPAIGNS } from '@/lib/sponsorship-demo-data';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

interface ExistingSeedCampaignRow {
  id: string;
  metadata: Record<string, unknown> | null;
}

function isDemoSeedAllowed() {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_SPONSORSHIP_DEMO_SEED === 'true'
  );
}

function demoSeedBlockedResponse() {
  return NextResponse.json(
    {
      error:
        'Demo sponsorship seeding is blocked in production unless ALLOW_SPONSORSHIP_DEMO_SEED=true.',
    },
    { status: 403 }
  );
}

function errorStatus(error: unknown) {
  if (
    error instanceof Error &&
    (error.message === 'Authentication required' || error.message === 'Admin access required')
  ) {
    return 403;
  }

  return 500;
}

function getSeedKey(metadata: Record<string, unknown> | null | undefined) {
  const candidate = metadata?.seed_key;
  return typeof candidate === 'string' ? candidate : null;
}

async function getExistingSeedCampaignMap() {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase.from('sponsor_campaigns').select('id, metadata');

  if (error) {
    throw new Error(`Failed to inspect existing demo campaigns: ${error.message}`);
  }

  const targetKeys = new Set(DEMO_SPONSOR_CAMPAIGNS.map((campaign) => campaign.seed_key));
  const bySeedKey = new Map<string, string>();

  for (const row of (data || []) as ExistingSeedCampaignRow[]) {
    const seedKey = getSeedKey(row.metadata);
    if (seedKey && targetKeys.has(seedKey)) {
      bySeedKey.set(seedKey, row.id);
    }
  }

  return bySeedKey;
}

function buildSeedPayload(
  userId: string,
  campaign: (typeof DEMO_SPONSOR_CAMPAIGNS)[number],
  now: Date
) {
  const startsAt = new Date(now);
  startsAt.setDate(startsAt.getDate() - 1);

  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + campaign.duration_days);

  return {
    sponsor_type: campaign.sponsor_type,
    placement: campaign.placement,
    status: campaign.status,
    sponsor_name: campaign.sponsor_name,
    title: campaign.title,
    short_copy: campaign.short_copy,
    cta_label: campaign.cta_label,
    cta_url: campaign.cta_url,
    image_url: campaign.image_url,
    sponsor_logo_url: campaign.sponsor_logo_url,
    audience_roles: campaign.audience_roles,
    city_targets: campaign.city_targets,
    priority: campaign.priority,
    price_xaf: campaign.price_xaf,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    created_by: userId,
    approved_by: userId,
    metadata: {
      demo: true,
      seed_key: campaign.seed_key,
      seed_source: 'admin_sponsorship_demo',
      seeded_at: now.toISOString(),
    },
  };
}

export async function POST() {
  try {
    const { userId } = await requireAdmin();

    if (!isDemoSeedAllowed()) {
      return demoSeedBlockedResponse();
    }

    if (!userId) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const supabase = createServiceSupabaseClient();
    const existingBySeedKey = await getExistingSeedCampaignMap();
    const now = new Date();

    let inserted = 0;
    let updated = 0;

    for (const campaign of DEMO_SPONSOR_CAMPAIGNS) {
      const payload = buildSeedPayload(userId, campaign, now);
      const existingId = existingBySeedKey.get(campaign.seed_key);

      if (existingId) {
        const { error } = await supabase
          .from('sponsor_campaigns')
          .update(payload)
          .eq('id', existingId);

        if (error) {
          throw new Error(`Failed to update demo campaign "${campaign.seed_key}": ${error.message}`);
        }

        updated += 1;
        continue;
      }

      const { error } = await supabase.from('sponsor_campaigns').insert(payload);
      if (error) {
        throw new Error(`Failed to insert demo campaign "${campaign.seed_key}": ${error.message}`);
      }

      inserted += 1;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      total: DEMO_SPONSOR_CAMPAIGNS.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to seed demo campaigns';
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}

export async function DELETE() {
  try {
    await requireAdmin();

    if (!isDemoSeedAllowed()) {
      return demoSeedBlockedResponse();
    }

    const supabase = createServiceSupabaseClient();
    const existingBySeedKey = await getExistingSeedCampaignMap();
    const ids = Array.from(existingBySeedKey.values());

    if (ids.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const { error } = await supabase.from('sponsor_campaigns').delete().in('id', ids);

    if (error) {
      throw new Error(`Failed to remove demo campaigns: ${error.message}`);
    }

    return NextResponse.json({ ok: true, deleted: ids.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clear demo campaigns';
    return NextResponse.json({ error: message }, { status: errorStatus(error) });
  }
}
