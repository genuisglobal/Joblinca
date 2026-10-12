import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET /api/vetting — the caller's own shortlist requests (RLS: recruiter reads own).
//
// There is deliberately no POST: requests are created by payment finalisation
// (lib/payments/finalize.ts) or by an admin (/api/admin/shortlists). A
// client-side insert would hand out a shortlist without payment.
export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data: vettingRequests, error } = await supabase
    .from('vetting_requests')
    .select('*');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(vettingRequests);
}
