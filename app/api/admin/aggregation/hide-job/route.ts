import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * POST /api/admin/aggregation/hide-job
 *
 * Hides a discovered job (marks as hidden so it won't appear in review queues).
 * Body: { "discoveredJobId": "uuid" }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const supabase = createServiceSupabaseClient();

  try {
    const { discoveredJobId } = await request.json();
    if (!discoveredJobId) {
      return NextResponse.json({ error: 'discoveredJobId required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('discovered_jobs')
      .update({
        ingestion_status: 'hidden',
        hidden_at: new Date().toISOString(),
        verification_status: 'rejected',
      })
      .eq('id', discoveredJobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
