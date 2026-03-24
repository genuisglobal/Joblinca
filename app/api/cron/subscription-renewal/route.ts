import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { processAutoRenewals } from '@/lib/subscription-renewal';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/subscription-renewal
 *
 * Processes auto-renewal for subscriptions expiring within 24 hours.
 * Should run daily (e.g., 0 6 * * *).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processAutoRenewals();

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Renewal processing failed';
    return NextResponse.json(
      { ok: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
