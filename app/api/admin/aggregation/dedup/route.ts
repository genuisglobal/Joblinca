import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { findAllDuplicateGroups, hideDuplicateJobs } from '@/lib/jobs/dedup';

export const runtime = 'nodejs';

/**
 * GET /api/admin/aggregation/dedup
 *
 * Scans published jobs and returns groups of duplicates.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();
  const groups = await findAllDuplicateGroups(supabase);

  const totalDuplicates = groups.reduce((sum, g) => sum + g.duplicates.length, 0);

  return NextResponse.json({
    groups,
    stats: {
      duplicate_groups: groups.length,
      total_duplicates: totalDuplicates,
    },
  });
}

/**
 * POST /api/admin/aggregation/dedup
 *
 * Remove duplicates. Accepts:
 *   { "action": "hide", "jobIds": ["uuid", ...] }           — hide specific jobs
 *   { "action": "auto_clean" }                               — auto-hide all detected duplicates
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();
  const body = await request.json();

  if (body.action === 'hide' && Array.isArray(body.jobIds)) {
    const result = await hideDuplicateJobs(supabase, body.jobIds);
    return NextResponse.json({ success: true, ...result });
  }

  if (body.action === 'auto_clean') {
    const groups = await findAllDuplicateGroups(supabase);
    const allDuplicateIds = groups.flatMap((g) => g.duplicates.map((d) => d.id));

    if (allDuplicateIds.length === 0) {
      return NextResponse.json({ success: true, hidden: 0, message: 'No duplicates found' });
    }

    const result = await hideDuplicateJobs(supabase, allDuplicateIds);
    return NextResponse.json({
      success: true,
      groups_processed: groups.length,
      ...result,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
