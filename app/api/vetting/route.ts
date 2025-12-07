import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

// Handle GET /api/vetting and POST /api/vetting
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

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const body = await request.json();
  const { jobId, package: pkg } = body;
  if (!jobId || !pkg) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  // Insert vetting request with status pending
  const { data: vetReq, error } = await supabase
    .from('vetting_requests')
    .insert({ job_id: jobId, recruiter_id: user.id, package: pkg })
    .select('*')
    .single();
  if (error || !vetReq) {
    return NextResponse.json({ error: error?.message || 'Failed to create request' }, { status: 500 });
  }
  return NextResponse.json(vetReq, { status: 201 });
}