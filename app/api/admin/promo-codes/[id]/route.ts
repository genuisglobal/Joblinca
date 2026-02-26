import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin, requireAdminType } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * PATCH /api/admin/promo-codes/[id]
 * Admin auth required. Update a promo code (deactivate, edit fields).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdmin();
    const supabase = createServiceSupabaseClient();

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      'description',
      'discount_type',
      'discount_value',
      'max_uses',
      'min_amount',
      'max_discount',
      'applicable_plan_slugs',
      'starts_at',
      'expires_at',
      'is_active',
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('promo_codes')
      .update(updates)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update promo code' }, { status: 500 });
    }

    return NextResponse.json({ promo_code: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

/**
 * DELETE /api/admin/promo-codes/[id]
 * Super admin only. Soft-delete (deactivate) a promo code.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminType('super');
    const supabase = createServiceSupabaseClient();

    const { data, error } = await supabase
      .from('promo_codes')
      .update({ is_active: false })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to deactivate promo code' }, { status: 500 });
    }

    return NextResponse.json({ promo_code: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
