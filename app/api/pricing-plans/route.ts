import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

const ALLOWED_ROLES = new Set(['job_seeker', 'talent', 'recruiter']);

/**
 * GET /api/pricing-plans
 *
 * Public endpoint that returns all active pricing plans grouped by role.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roleParam = (url.searchParams.get('role') || '').trim().toLowerCase();

    if (roleParam && !ALLOWED_ROLES.has(roleParam)) {
      return NextResponse.json({ error: 'Invalid role filter' }, { status: 400 });
    }

    const supabase = createServiceSupabaseClient();

    let query = supabase
      .from('pricing_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (roleParam) {
      query = query.eq('role', roleParam);
    }

    const { data: plans, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
    }

    // Group by role
    const grouped: Record<string, typeof plans> = {};
    for (const plan of plans || []) {
      if (!grouped[plan.role]) {
        grouped[plan.role] = [];
      }
      grouped[plan.role].push(plan);
    }

    return NextResponse.json({ plans: grouped });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
