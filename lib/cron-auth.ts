import type { NextRequest } from 'next/server';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const VERCEL_CRON_HEADERS = [
  'x-vercel-cron',
  'x-vercel-signature',
  'x-vercel-cron-signature',
];

function isLocalHost(hostHeader: string): boolean {
  const raw = hostHeader.trim().toLowerCase();
  if (!raw) return false;
  const host = raw.includes(':') ? raw.split(':')[0] : raw;
  return LOCAL_HOSTS.has(host);
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

  // Bearer token auth — primary method
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Vercel Cron header auth — trusted platform headers
  const allowVercelHeaderAuth =
    (process.env.ALLOW_VERCEL_CRON_HEADER_AUTH || 'true').toLowerCase() !==
    'false';
  if (allowVercelHeaderAuth && hasVercelCronHeader(request)) {
    return true;
  }

  // CRON_SECRET is required — no fallback to localhost.
  // If you need to test cron endpoints locally, set CRON_SECRET in .env.local.
  if (!cronSecret) {
    console.error('[cron-auth] CRON_SECRET is not configured — rejecting request');
  }
  return false;
}
