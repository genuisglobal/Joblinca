import { NextRequest, NextResponse } from 'next/server';
import { getActiveSponsorFeedItems } from '@/lib/sponsorships';
import { isSponsorPlacement } from '@/lib/sponsorship-schema';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const placementParam = searchParams.get('placement') || 'homepage_shelf';
    const limitParam = Number.parseInt(searchParams.get('limit') || '4', 10);
    const placement = isSponsorPlacement(placementParam) ? placementParam : 'homepage_shelf';
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 8) : 4;

    const items = await getActiveSponsorFeedItems({
      placement,
      limit,
    });

    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load homepage sponsorships';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
