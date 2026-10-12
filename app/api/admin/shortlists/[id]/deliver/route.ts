import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { deliverShortlist } from '@/lib/vetting/service';
import { errorResponse, forbidden, getShortlistAdmin } from '@/lib/vetting/auth';

/** POST /api/admin/shortlists/[id]/deliver — send the saved shortlist to the recruiter. */
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getShortlistAdmin();
  if (!admin) return forbidden();

  try {
    const result = await deliverShortlist(createServiceSupabaseClient(), params.id, admin.userId);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
