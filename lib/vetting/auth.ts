import { NextResponse } from 'next/server';
import { checkAdminStatus } from '@/lib/admin';
import type { AdminType } from '@/lib/admin-types';
import { VettingError } from './service';

/** Admin types that may work the shortlist queue. Content admins can't. */
export const SHORTLIST_ADMIN_TYPES: readonly AdminType[] = ['super', 'operations'];

export async function getShortlistAdmin(): Promise<{ userId: string } | null> {
  const { isAdmin, adminType, userId } = await checkAdminStatus();
  if (!isAdmin || !userId || !adminType || !SHORTLIST_ADMIN_TYPES.includes(adminType)) {
    return null;
  }
  return { userId };
}

export function forbidden() {
  return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
}

export function errorResponse(err: unknown) {
  if (err instanceof VettingError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error('[vetting] unexpected error', err);
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}
