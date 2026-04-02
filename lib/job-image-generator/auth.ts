import type { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/admin';

export class JobImageAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobImageAuthorizationError';
  }
}

export async function authorizeJobImageRequest(
  request: NextRequest
): Promise<{ mode: 'token' | 'admin'; userId: string | null }> {
  const authorization = (request.headers.get('authorization') || '').trim();
  const bearerToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const configuredToken = (process.env.JOB_IMAGE_GENERATOR_TOKEN || process.env.CRON_SECRET || '').trim();

  if (configuredToken && bearerToken && bearerToken === configuredToken) {
    return { mode: 'token', userId: null };
  }

  try {
    const admin = await requireAdmin();
    return { mode: 'admin', userId: admin.userId };
  } catch {
    throw new JobImageAuthorizationError(
      'Unauthorized. Use an active admin session or Authorization: Bearer <JOB_IMAGE_GENERATOR_TOKEN>.'
    );
  }
}
