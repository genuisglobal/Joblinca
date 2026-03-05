import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, AdminRequiredError } from '@/lib/admin';
import { processPendingWhatsAppScreeningNotifications } from '@/lib/whatsapp-screening/service';

interface RetryBody {
  limit?: number;
  maxAttempts?: number;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded <= 0) return fallback;
  return rounded;
}

function isAuthorizedByRetryToken(request: NextRequest): boolean {
  const configured = process.env.WA_SCREENING_RETRY_TOKEN;
  if (!configured) return false;

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return Boolean(token) && token === configured;
}

export async function POST(request: NextRequest) {
  const tokenAuthorized = isAuthorizedByRetryToken(request);

  if (!tokenAuthorized) {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof AdminRequiredError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      throw error;
    }
  }

  let body: RetryBody = {};
  try {
    body = (await request.json()) as RetryBody;
  } catch {
    body = {};
  }

  const limit = parsePositiveInt(body.limit, 20);
  const maxAttempts = parsePositiveInt(body.maxAttempts, 5);

  const result = await processPendingWhatsAppScreeningNotifications({
    limit,
    maxAttempts,
  });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
