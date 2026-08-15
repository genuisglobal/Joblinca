import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

const VERCEL_CRON_HEADERS = [
  'x-vercel-cron',
  'x-vercel-signature',
  'x-vercel-cron-signature',
];

// The unused localhost allowlist that used to live here was deliberately
// removed: the Host header is client-controlled, so trusting it would be the
// same class of bypass as trusting x-vercel-cron.

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function hasVercelCronHeader(request: NextRequest): boolean {
  return VERCEL_CRON_HEADERS.some((headerName) => {
    const value = request.headers.get(headerName);
    return Boolean(value && value.trim().length > 0);
  });
}

export function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (request.headers.get('authorization') || '').trim();

  // Bearer token auth — the only trustworthy method
  if (cronSecret && safeEquals(authHeader, `Bearer ${cronSecret}`)) {
    return true;
  }

  // Vercel cron headers are NOT an authentication signal. Vercel does not strip
  // inbound x-vercel-* headers from external requests, so anyone can send
  // `x-vercel-cron: 1` and satisfy this check — verified against production on
  // 2026-08-15, where a forged header returned 200 with live data from an
  // otherwise 401 endpoint. It is off unless explicitly enabled.
  //
  // Genuine Vercel cron invocations do not need it: when CRON_SECRET is set in
  // the project environment, Vercel attaches it as `Authorization: Bearer ...`
  // and those requests authenticate on the branch above.
  const allowVercelHeaderAuth =
    (process.env.ALLOW_VERCEL_CRON_HEADER_AUTH || 'false').toLowerCase() ===
    'true';
  if (allowVercelHeaderAuth && hasVercelCronHeader(request)) {
    console.warn(
      '[cron-auth] request authorized by forgeable x-vercel-* header — ' +
        'unset ALLOW_VERCEL_CRON_HEADER_AUTH to require the bearer token'
    );
    return true;
  }

  // CRON_SECRET is required — no fallback to localhost.
  // If you need to test cron endpoints locally, set CRON_SECRET in .env.local.
  if (!cronSecret) {
    console.error('[cron-auth] CRON_SECRET is not configured — rejecting request');
  }
  return false;
}
