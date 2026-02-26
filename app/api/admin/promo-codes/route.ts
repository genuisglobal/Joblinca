import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * GET /api/admin/promo-codes
 * Admin auth required. Returns all promo codes.
 */
export async function GET() {
  try {
    await requireAdmin();
    const supabase = createServiceSupabaseClient();

    const { data, error } = await supabase
      .from('promo_codes')
      .select('*, profiles:created_by(full_name, email:id)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch promo codes' }, { status: 500 });
    }

    return NextResponse.json({ promo_codes: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

/**
 * POST /api/admin/promo-codes
 * Super admin only. Creates a new promo code.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAdminType('super');
    const supabase = createServiceSupabaseClient();

    const body = await request.json();
    const {
      code,
      description,
      discount_type,
      discount_value,
      max_uses,
      min_amount,
      max_discount,
      applicable_plan_slugs,
      starts_at,
      expires_at,
    } = body;

    if (!code || !discount_type || !discount_value) {
      return NextResponse.json(
        { error: 'code, discount_type, and discount_value are required' },
        { status: 400 }
      );
    }

    if (!['percentage', 'fixed_amount'].includes(discount_type)) {
      return NextResponse.json(
        { error: 'discount_type must be percentage or fixed_amount' },
        { status: 400 }
      );
    }

    if (discount_type === 'percentage' && (discount_value <= 0 || discount_value > 100)) {
      return NextResponse.json(
        { error: 'Percentage discount must be between 1 and 100' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .insert({
        code: code.toUpperCase().trim(),
        description,
        discount_type,
        discount_value,
        max_uses: max_uses || null,
        min_amount: min_amount || null,
        max_discount: max_discount || null,
        applicable_plan_slugs: applicable_plan_slugs || null,
        starts_at: starts_at || new Date().toISOString(),
        expires_at: expires_at || null,
        is_active: true,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A promo code with this code already exists' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to create promo code' }, { status: 500 });
    }

    return NextResponse.json({ promo_code: data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
