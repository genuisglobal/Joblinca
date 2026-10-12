import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { saveSelection } from '@/lib/vetting/service';
import { normalizeSelection } from '@/lib/vetting/queue';
import { errorResponse, forbidden, getShortlistAdmin } from '@/lib/vetting/auth';

/**
 * PUT /api/admin/shortlists/[id]/candidates — replace the draft shortlist.
 * Body: { candidates: [{ applicationId, note? }, ...] } in ranked order.
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getShortlistAdmin();
  if (!admin) return forbidden();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  let selection;
  try {
    selection = normalizeSelection(body?.candidates);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    await saveSelection(createServiceSupabaseClient(), params.id, selection, admin.userId);
    return NextResponse.json({ ok: true, count: selection.length });
  } catch (err) {
    return errorResponse(err);
  }
}
