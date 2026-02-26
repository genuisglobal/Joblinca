import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * GET /api/pricing-plans
 *
 * Public endpoint that returns all active pricing plans grouped by role.
 */
export async function GET() {
  try {
    const supabase = createServiceSupabaseClient();

    const { data: plans, error } = await supabase
      .from('pricing_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

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
