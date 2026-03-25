import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { runAutoPipelineMaintenance } from '@/lib/scrapers/auto-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/aggregation/pipeline-maintenance
 *
 * Runs the non-scraping stages of the aggregation pipeline:
 *   1. Auto-publish trustworthy discovered jobs
 *   2. Clean up duplicate published jobs
 *   3. Archive stale external jobs
 */
export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const result = await runAutoPipelineMaintenance();

    if (!result) {
      return NextResponse.json(
        { error: 'Pipeline maintenance failed - check server logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[pipeline-maintenance] Error:', err);
    return NextResponse.json(
      { error: 'Pipeline maintenance failed', details: String(err) },
      { status: 500 }
    );
  }
}
