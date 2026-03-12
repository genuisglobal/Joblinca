/**
 * Rate limiting middleware for API routes.
 *
 * Uses Upstash Redis + @upstash/ratelimit for serverless-compatible
 * sliding-window rate limiting. Falls back to a permissive no-op
 * when Redis is not configured (local development).
 *
 * Environment variables:
 *   UPSTASH_REDIS_REST_URL   - Upstash Redis REST endpoint
 *   UPSTASH_REDIS_REST_TOKEN - Upstash Redis REST token
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── Types ──────────────────────────────────────────────────────────────────

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  requests: number;
  /** Window duration string, e.g. "1m", "1h", "1d" */
  window: string;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the window */
  remaining: number;
  /** When the rate limit resets (epoch ms) */
  resetAt: number;
  /** HTTP response to return if rate limited (null if allowed) */
  response: NextResponse | null;
}

// ── Lazy-initialised Upstash client ─────────────────────────────────────────

let _ratelimiter: Map<string, unknown> | null = null;

function getRedisUrl(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_URL;
}

function getRedisToken(): string | undefined {
  return process.env.UPSTASH_REDIS_REST_TOKEN;
}

function isRedisConfigured(): boolean {
  return Boolean(getRedisUrl() && getRedisToken());
}

/**
 * Parse a window string like "1m", "10s", "1h", "1d" into milliseconds.
 */
function parseWindow(window: string): number {
  const match = window.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 60_000; // default 1 minute

  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return value * 1_000;
    case 'm': return value * 60_000;
    case 'h': return value * 3_600_000;
    case 'd': return value * 86_400_000;
    default: return 60_000;
  }
}

// ── In-memory fallback for local development ────────────────────────────────

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function memoryRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = parseWindow(config.window);
  const key = identifier;

  let entry = memoryStore.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    memoryStore.set(key, entry);
  }

  entry.count++;

  if (entry.count > config.requests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      response: NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
            'X-RateLimit-Limit': String(config.requests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(entry.resetAt),
          },
        }
      ),
    };
  }

  return {
    allowed: true,
    remaining: config.requests - entry.count,
    resetAt: entry.resetAt,
    response: null,
  };
}

// ── Upstash rate limiter ────────────────────────────────────────────────────

async function upstashRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    // Dynamic import to avoid bundling Upstash when not configured
    const { Ratelimit } = await import('@upstash/ratelimit');
    const { Redis } = await import('@upstash/redis');

    const cacheKey = `${config.requests}:${config.window}`;

    if (!_ratelimiter) {
      _ratelimiter = new Map();
    }

    let limiter = _ratelimiter.get(cacheKey) as InstanceType<typeof Ratelimit> | undefined;
    if (!limiter) {
      const redis = new Redis({
        url: getRedisUrl()!,
        token: getRedisToken()!,
      });

      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.requests, config.window as `${number} s` | `${number} m` | `${number} h` | `${number} d`),
        analytics: true,
        prefix: 'joblinca:rl',
      });

      _ratelimiter.set(cacheKey, limiter);
    }

    const result = await limiter.limit(identifier);

    if (!result.success) {
      const retryAfterSeconds = Math.ceil((result.reset - Date.now()) / 1000);
      return {
        allowed: false,
        remaining: result.remaining,
        resetAt: result.reset,
        response: NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(retryAfterSeconds),
              'X-RateLimit-Limit': String(result.limit),
              'X-RateLimit-Remaining': String(result.remaining),
              'X-RateLimit-Reset': String(result.reset),
            },
          }
        ),
      };
    }

    return {
      allowed: true,
      remaining: result.remaining,
      resetAt: result.reset,
      response: null,
    };
  } catch (err) {
    // If Upstash fails, log and allow the request (fail-open for availability)
    console.error('[rate-limit] Upstash error, falling back to allow:', err);
    return {
      allowed: true,
      remaining: config.requests,
      resetAt: Date.now() + parseWindow(config.window),
      response: null,
    };
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Apply rate limiting to an API request.
 *
 * @param identifier - Unique key for the rate limit bucket (e.g. user ID, IP)
 * @param config - Rate limit configuration
 * @returns RateLimitResult — check `result.allowed` or return `result.response` if blocked
 *
 * @example
 * ```ts
 * export async function POST(request: NextRequest) {
 *   const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
 *   const limit = await rateLimit(`payments:${ip}`, { requests: 10, window: '1m' });
 *   if (!limit.allowed) return limit.response!;
 *   // ... handle request
 * }
 * ```
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (isRedisConfigured()) {
    return upstashRateLimit(identifier, config);
  }

  // Local development fallback — in-memory rate limiting
  return memoryRateLimit(identifier, config);
}

/**
 * Extract a rate limit identifier from a request.
 * Prefers authenticated user ID, falls back to IP address.
 */
export function getRateLimitIdentifier(
  request: NextRequest,
  userId?: string | null
): string {
  if (userId) return `user:${userId}`;

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `ip:${ip}`;
}
