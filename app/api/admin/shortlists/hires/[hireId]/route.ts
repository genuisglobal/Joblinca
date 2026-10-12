import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { setHireSalary, waiveHireFee } from '@/lib/vetting/hires';
import { parseXaf } from '@/lib/vetting/billing';
import { errorResponse, forbidden, getShortlistAdmin } from '@/lib/vetting/auth';

/**
 * PATCH /api/admin/shortlists/hires/[hireId]
 * Body: { action: 'salary', monthlySalary } | { action: 'waive', reason }
 */
export async function PATCH(request: NextRequest, { params }: { params: { hireId: string } }) {
  const admin = await getShortlistAdmin();
  if (!admin) return forbidden();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const supabase = createServiceSupabaseClient();

  try {
    if (body?.action === 'salary') {
      const salary = parseXaf(body.monthlySalary);
      if (!salary) {
        return NextResponse.json({ error: 'Monthly salary must be a positive FCFA amount' }, { status: 400 });
      }
      const hire = await setHireSalary(supabase, params.hireId, salary);
      return NextResponse.json({ hire });
    }
    if (body?.action === 'waive') {
      await waiveHireFee(supabase, params.hireId, typeof body.reason === 'string' ? body.reason : '');
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
