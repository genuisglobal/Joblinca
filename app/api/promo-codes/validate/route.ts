import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validatePromoCode, calculateDiscount } from '@/lib/payments/index';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * POST /api/promo-codes/validate
 * Body: { code, plan_slug }
 * Auth: requires authenticated user
 * Returns: { valid, discount_type, discount_value, final_amount, reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { code, plan_slug } = body;

    if (!code || !plan_slug) {
      return NextResponse.json(
        { error: 'code and plan_slug are required' },
        { status: 400 }
      );
    }

    // Validate the promo code
    const result = await validatePromoCode(code, plan_slug, user.id);

    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        reason: result.reason,
      });
    }

    // Fetch the plan amount to calculate final price
    const serviceSupabase = createServiceSupabaseClient();
    const { data: plan } = await serviceSupabase
      .from('pricing_plans')
      .select('amount_xaf')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .single();

    if (!plan) {
      return NextResponse.json({
        valid: false,
        reason: 'Plan not found',
      });
    }

    const discount = calculateDiscount(plan.amount_xaf, result);

    return NextResponse.json({
      valid: true,
      discount_type: result.discount_type,
      discount_value: result.discount_value,
      original_amount: discount.originalAmount,
      discount_amount: discount.discountAmount,
      final_amount: discount.finalAmount,
    });
  } catch {
    return NextResponse.json({ error: 'Validation failed' }, { status: 500 });
  }
}
