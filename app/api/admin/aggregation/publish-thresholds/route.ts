import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/admin';
import {
  DEFAULT_PUBLISH_THRESHOLDS,
  loadPublishThresholds,
  normalizePublishThresholds,
  savePublishThresholds,
} from '@/lib/aggregation/publish-thresholds';

export const runtime = 'nodejs';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/admin/aggregation/publish-thresholds
 * Returns the current auto-publish trust/scam thresholds.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }

  const thresholds = await loadPublishThresholds(supabase);
  return NextResponse.json({ ...thresholds, defaults: DEFAULT_PUBLISH_THRESHOLDS });
}

/**
 * PUT /api/admin/aggregation/publish-thresholds
 * Body: { trustMin: number, scamMax: number }
 * Saves new thresholds. Values are clamped to 0-100.
 */
export async function PUT(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const admin = await requireAdmin();
    adminUserId = admin.userId ?? null;
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const normalized = normalizePublishThresholds({
    trustMin: (body as { trustMin?: unknown }).trustMin,
    scamMax: (body as { scamMax?: unknown }).scamMax,
  });

  try {
    const saved = await savePublishThresholds(supabase, normalized, adminUserId);
    return NextResponse.json({ success: true, ...saved });
  } catch (err) {
    console.error('[publish-thresholds] Save error:', err);
    return NextResponse.json(
      { error: 'Failed to save thresholds', details: String(err) },
      { status: 500 },
    );
  }
}
