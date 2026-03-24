import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { processExpiryNotifications } from '@/lib/subscription-expiry-notify';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/cron/subscription-expiry-notify
 *
 * Sends WhatsApp + in-app notifications to users whose subscriptions
 * expire within 3 days. Should run daily (e.g., 0 8 * * *).
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processExpiryNotifications();

    return NextResponse.json({
      ok: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Expiry notification failed';
    return NextResponse.json(
      { ok: false, error: message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
