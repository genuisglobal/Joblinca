import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * PATCH /api/subscriptions/auto-renew
 *
 * Toggle auto-renewal for the user's active subscription.
 * Body: { autoRenew: boolean }
 */
export async function PATCH(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const autoRenew = body.autoRenew;

  if (typeof autoRenew !== 'boolean') {
    return NextResponse.json({ error: 'autoRenew must be a boolean' }, { status: 400 });
  }

  const serviceClient = createServiceSupabaseClient();

  // Find user's active subscription
  const today = new Date().toISOString().split('T')[0];
  const { data: sub, error: subError } = await serviceClient
    .from('subscriptions')
    .select('id, end_date, plan_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .or(`end_date.gte.${today},end_date.is.null`)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subError) {
    return NextResponse.json({ error: 'Failed to look up subscription' }, { status: 500 });
  }

  if (!sub) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
  }

  const { error: updateError } = await serviceClient
    .from('subscriptions')
    .update({ auto_renew: autoRenew })
    .eq('id', sub.id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update auto-renewal' }, { status: 500 });
  }

  return NextResponse.json({
    message: autoRenew ? 'Auto-renewal enabled' : 'Auto-renewal disabled',
    autoRenew,
  });
}
