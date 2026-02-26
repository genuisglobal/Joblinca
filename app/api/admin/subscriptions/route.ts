import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

/**
 * GET /api/admin/subscriptions
 * Admin auth required. Returns all subscriptions with user + plan info.
 * Supports query params: ?status=active&page=1&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createServiceSupabaseClient();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('subscriptions')
      .select(
        `
        *,
        profiles:user_id (full_name, email:id, role),
        pricing_plans:plan_id (slug, name, role, amount_xaf)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch subscriptions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      subscriptions: data,
      total: count,
      page,
      limit,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
