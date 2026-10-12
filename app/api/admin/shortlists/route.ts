import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createManualShortlistRequest } from '@/lib/vetting/service';
import { MAX_SHORTLIST_SIZE } from '@/lib/vetting/queue';
import { errorResponse, forbidden, getShortlistAdmin } from '@/lib/vetting/auth';

/**
 * POST /api/admin/shortlists — open a shortlist request by hand.
 * Body: { jobRef: job id | public id | job URL, source: 'manual' | 'free_trial', shortlistSize? }
 */
export async function POST(request: NextRequest) {
  const admin = await getShortlistAdmin();
  if (!admin) return forbidden();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const jobRef = typeof body?.jobRef === 'string' ? body.jobRef : '';
  const source = body?.source === 'free_trial' ? 'free_trial' : 'manual';
  const size = Number(body?.shortlistSize ?? 5);
  if (!Number.isInteger(size) || size < 1 || size > MAX_SHORTLIST_SIZE) {
    return NextResponse.json(
      { error: `Shortlist size must be 1–${MAX_SHORTLIST_SIZE}` },
      { status: 400 }
    );
  }

  try {
    const id = await createManualShortlistRequest(createServiceSupabaseClient(), {
      jobRef,
      source,
      shortlistSize: size,
      createdBy: admin.userId,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
