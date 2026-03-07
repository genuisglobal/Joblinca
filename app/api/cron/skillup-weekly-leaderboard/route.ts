import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { publishWeeklyLeaderboard } from '@/lib/skillup/leaderboard-publisher';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekKey = (searchParams.get('week') || '').trim() || undefined;
  const challengeId = (searchParams.get('challengeId') || '').trim() || null;
  const notifyWhatsapp =
    (searchParams.get('notifyWhatsapp') || 'true').toLowerCase() !== 'false';
  const topNRaw = Number(searchParams.get('topN') || '');
  const topNOverride = Number.isFinite(topNRaw)
    ? Math.max(1, Math.min(100, Math.floor(topNRaw)))
    : null;

  try {
    const result = await publishWeeklyLeaderboard({
      weekKey,
      challengeId,
      notifyWhatsapp,
      topNOverride,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to publish leaderboard',
      },
      { status: 500 }
    );
  }
}
