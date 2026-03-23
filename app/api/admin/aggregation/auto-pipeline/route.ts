import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { runAutoPipeline } from '@/lib/scrapers/auto-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for full pipeline

/**
 * POST /api/admin/aggregation/auto-pipeline
 *
 * Runs the complete automated pipeline:
 *   1. Scrape all sources
 *   2. Ingest into discovered_jobs (with dedup)
 *   3. Auto-publish trustworthy jobs (trust >= 60, scam < 30)
 *   4. Clean up duplicates in published jobs table
 *
 * Body (optional): { "maxPages": 2 }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const maxPages = (body as { maxPages?: number }).maxPages || 2;

    const result = await runAutoPipeline('manual', maxPages);

    if (!result) {
      return NextResponse.json(
        { error: 'Pipeline failed — check server logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[auto-pipeline] Error:', err);
    return NextResponse.json(
      { error: 'Pipeline failed', details: String(err) },
      { status: 500 }
    );
  }
}
