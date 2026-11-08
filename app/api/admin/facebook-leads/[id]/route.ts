import { NextRequest, NextResponse } from 'next/server';
import { requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const STATUSES = new Set(['new', 'contacted', 'responded', 'converted', 'not_relevant']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/admin/facebook-leads/:id  { status?, notes? } — admins only. */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdminType(['super', 'operations']);
  } catch {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { status?: unknown; notes?: unknown } | null;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body?.status !== undefined) {
    if (typeof body.status !== 'string' || !STATUSES.has(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body?.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') {
      return NextResponse.json({ error: 'Invalid notes' }, { status: 400 });
    }
    patch.notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null;
  }
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await createServiceSupabaseClient()
    .from('facebook_page_leads')
    .update(patch)
    .eq('id', params.id)
    .select('id, status')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
