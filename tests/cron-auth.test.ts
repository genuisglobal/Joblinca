import assert from 'node:assert/strict';

import { isAuthorizedCronRequest } from '../lib/cron-auth';

/**
 * Regression cover for the cron auth bypass found on 2026-08-15: forged
 * `x-vercel-cron` / `x-vercel-signature` headers authenticated against
 * production, because Vercel does not strip inbound x-vercel-* headers.
 * Header auth must stay off unless someone opts in explicitly.
 */

type HeaderBag = Record<string, string>;

/** Minimal NextRequest stand-in — isAuthorizedCronRequest only reads headers. */
function requestWith(headers: HeaderBag) {
  const lookup = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    headers: {
      get: (name: string) => lookup.get(name.toLowerCase()) ?? null,
    },
  } as unknown as Parameters<typeof isAuthorizedCronRequest>[0];
}

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function main() {
  const SECRET = 'test-cron-secret-value';

  withEnv(
    { CRON_SECRET: SECRET, ALLOW_VERCEL_CRON_HEADER_AUTH: undefined },
    () => {
      assert.equal(
        isAuthorizedCronRequest(requestWith({ authorization: `Bearer ${SECRET}` })),
        true,
        'correct bearer token must be accepted'
      );

      assert.equal(
        isAuthorizedCronRequest(requestWith({})),
        false,
        'unauthenticated request must be rejected'
      );

      assert.equal(
        isAuthorizedCronRequest(requestWith({ authorization: 'Bearer wrong' })),
        false,
        'wrong bearer token must be rejected'
      );

      // The actual bypass: these all returned true before the fix.
      for (const header of [
        'x-vercel-cron',
        'x-vercel-signature',
        'x-vercel-cron-signature',
      ]) {
        assert.equal(
          isAuthorizedCronRequest(requestWith({ [header]: '1' })),
          false,
          `forged ${header} must not authenticate by default`
        );
      }

      assert.equal(
        isAuthorizedCronRequest(
          requestWith({ 'x-vercel-cron': '1', authorization: 'Bearer wrong' })
        ),
        false,
        'forged header must not rescue a wrong bearer token'
      );
    }
  );

  // Fails closed when the secret is missing, rather than falling back to headers.
  withEnv(
    { CRON_SECRET: undefined, ALLOW_VERCEL_CRON_HEADER_AUTH: undefined },
    () => {
      assert.equal(
        isAuthorizedCronRequest(requestWith({ 'x-vercel-cron': '1' })),
        false,
        'missing CRON_SECRET must reject, not fall back to header auth'
      );
      assert.equal(
        isAuthorizedCronRequest(requestWith({ authorization: 'Bearer ' })),
        false,
        'missing CRON_SECRET must reject empty bearer tokens'
      );
    }
  );

  // The escape hatch still works, for anyone who needs to roll back fast.
  withEnv({ CRON_SECRET: SECRET, ALLOW_VERCEL_CRON_HEADER_AUTH: 'true' }, () => {
    assert.equal(
      isAuthorizedCronRequest(requestWith({ 'x-vercel-cron': '1' })),
      true,
      'explicit opt-in must still honour the header'
    );
  });

  console.log('cron-auth test passed');
}

main();
