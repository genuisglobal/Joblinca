import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AdminRequiredError, requireAdmin } from '@/lib/admin';

const NEXT_STATUSES = ['approved', 'rejected'] as const;
type NextStatus = (typeof NEXT_STATUSES)[number];

function isNextStatus(value: unknown): value is NextStatus {
  return typeof value === 'string' && (NEXT_STATUSES as readonly string[]).includes(value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await requireAdmin();
    const refId = (params.id || '').trim();
    if (!refId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const payload = body as Record<string, unknown>;
    if (!isNextStatus(payload.status)) {
      return NextResponse.json(
        { error: "status must be 'approved' or 'rejected'" },
        { status: 422 }
      );
    }

    const updates: Record<string, unknown> = {
      status: payload.status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    };
    if (typeof payload.rationale === 'string') {
      const trimmed = payload.rationale.trim();
      if (trimmed) {
        updates.rationale = trimmed;
      }
    }
    if (typeof payload.display_order === 'number' && Number.isFinite(payload.display_order)) {
      updates.display_order = Math.max(0, Math.floor(payload.display_order));
    }
    if (typeof payload.external_url_fr === 'string') {
      const trimmed = payload.external_url_fr.trim();
      updates.external_url_fr = trimmed || null;
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('talent_challenge_question_refs')
      .update(updates)
      .eq('id', refId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ref: data });
  } catch (error) {
    if (error instanceof AdminRequiredError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update ref' },
      { status: 500 }
    );
  }
}
