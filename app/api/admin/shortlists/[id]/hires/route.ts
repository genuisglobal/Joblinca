import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { recordHire } from '@/lib/vetting/hires';
import { parseXaf } from '@/lib/vetting/billing';
import { errorResponse, forbidden, getShortlistAdmin } from '@/lib/vetting/auth';

/**
 * POST /api/admin/shortlists/[id]/hires — record that a shortlisted candidate was hired.
 * Body: { applicationId, monthlySalary?, hiredAt? (YYYY-MM-DD) }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await getShortlistAdmin();
  if (!admin) return forbidden();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const applicationId = typeof body?.applicationId === 'string' ? body.applicationId : '';
  if (!applicationId) {
    return NextResponse.json({ error: 'applicationId is required' }, { status: 400 });
  }

  let monthlySalaryXaf: number | null = null;
  if (body?.monthlySalary !== undefined && body.monthlySalary !== null && body.monthlySalary !== '') {
    monthlySalaryXaf = parseXaf(body.monthlySalary);
    if (!monthlySalaryXaf) {
      return NextResponse.json({ error: 'Monthly salary must be a positive FCFA amount' }, { status: 400 });
    }
  }

  const hiredAt = typeof body?.hiredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.hiredAt)
    ? body.hiredAt
    : null;

  const supabase = createServiceSupabaseClient();
  try {
    const { data: result } = await supabase
      .from('vetting_results')
      .select('candidate_id')
      .eq('vetting_request_id', params.id)
      .eq('application_id', applicationId)
      .maybeSingle();
    if (!result) {
      return NextResponse.json({ error: 'That application is not on this shortlist' }, { status: 400 });
    }

    const { hire, created } = await recordHire(supabase, {
      vettingRequestId: params.id,
      candidateId: result.candidate_id as string,
      applicationId,
      hiredAt,
      monthlySalaryXaf,
      detectedBy: 'officer',
      createdBy: admin.userId,
    });
    return NextResponse.json({ hire, created }, { status: created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
