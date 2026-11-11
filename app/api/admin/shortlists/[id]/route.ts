import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { updateVettingRequest } from '@/lib/vetting/service';
import { MAX_SHORTLIST_SIZE } from '@/lib/vetting/queue';
import { errorResponse, forbidden, getShortlistAdmin } from '@/lib/vetting/auth';

/**
 * PATCH /api/admin/shortlists/[id]
 * Body: { action: 'claim' | 'release' } | { action: 'cancel', reason }
 *     | { action: 'notes', notes, shortlistSize? }
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getShortlistAdmin();
  if (!admin) return forbidden();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const supabase = createServiceSupabaseClient();

  try {
    switch (body?.action) {
      case 'claim':
        await updateVettingRequest(supabase, params.id, { action: 'claim', userId: admin.userId });
        break;
      case 'release':
        await updateVettingRequest(supabase, params.id, { action: 'release' });
        break;
      case 'cancel':
        await updateVettingRequest(supabase, params.id, {
          action: 'cancel',
          reason: typeof body.reason === 'string' ? body.reason : '',
        });
        break;
      case 'notes': {
        let shortlistSize: number | undefined;
        if (body.shortlistSize !== undefined) {
          shortlistSize = Number(body.shortlistSize);
          if (!Number.isInteger(shortlistSize) || shortlistSize < 1 || shortlistSize > MAX_SHORTLIST_SIZE) {
            return NextResponse.json(
              { error: `Shortlist size must be 1–${MAX_SHORTLIST_SIZE}` },
              { status: 400 }
            );
          }
        }
        await updateVettingRequest(supabase, params.id, {
          action: 'notes',
          notes: typeof body.notes === 'string' ? body.notes : null,
          shortlistSize,
        });
        break;
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
