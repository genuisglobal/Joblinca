import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  isSponsorEventType,
  isSponsorPlacement,
  type SponsorEventType,
} from '@/lib/sponsorship-schema';

function normalizeCampaignIds(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const eventTypeValue = typeof payload.eventType === 'string' ? payload.eventType : 'impression';
    const placementValue =
      typeof payload.placement === 'string' ? payload.placement : 'homepage_shelf';
    const campaignIds = normalizeCampaignIds(payload.campaignId || payload.campaignIds);
    const sessionKey =
      typeof payload.sessionKey === 'string' && payload.sessionKey.trim()
        ? payload.sessionKey.trim()
        : null;
    const metadata =
      payload.metadata && typeof payload.metadata === 'object'
        ? (payload.metadata as Record<string, unknown>)
        : {};

    if (!isSponsorEventType(eventTypeValue)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }

    if (!isSponsorPlacement(placementValue)) {
      return NextResponse.json({ error: 'Invalid placement' }, { status: 400 });
    }

    if (!campaignIds.length) {
      return NextResponse.json({ error: 'campaignId or campaignIds is required' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const serviceSupabase = createServiceSupabaseClient();
    const rows = campaignIds.map((campaignId) => ({
      campaign_id: campaignId,
      event_type: eventTypeValue as SponsorEventType,
      placement: placementValue,
      session_key: sessionKey,
      user_id: user?.id || null,
      metadata,
    }));

    const { error } = await serviceSupabase.from('sponsor_events').insert(rows);

    if (error) {
      return NextResponse.json({ error: 'Failed to record sponsor event' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }
}
