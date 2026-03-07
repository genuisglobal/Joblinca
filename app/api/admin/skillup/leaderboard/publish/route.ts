import { NextRequest, NextResponse } from 'next/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';
import { publishWeeklyLeaderboard } from '@/lib/skillup/leaderboard-publisher';

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const payload =
      body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

    const weekKey =
      typeof payload.week === 'string' && payload.week.trim()
        ? payload.week.trim()
        : undefined;
    const challengeId =
      typeof payload.challengeId === 'string' && payload.challengeId.trim()
        ? payload.challengeId.trim()
        : null;
    const notifyWhatsapp =
      typeof payload.notifyWhatsapp === 'boolean' ? payload.notifyWhatsapp : true;
    const topNOverrideRaw = Number(payload.topN);
    const topNOverride = Number.isFinite(topNOverrideRaw)
      ? Math.max(1, Math.min(100, Math.floor(topNOverrideRaw)))
      : null;

    const result = await publishWeeklyLeaderboard({
      weekKey,
      challengeId,
      notifyWhatsapp,
      topNOverride,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to publish leaderboard' },
      { status: 500 }
    );
  }
}
