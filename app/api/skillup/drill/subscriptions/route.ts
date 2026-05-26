import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const ALLOWED_DOMAINS = new Set([
  'teacher',
  'accountant',
  'admin_assistant',
  'cashier',
  'nurse',
  'customer_service',
  'field_officer',
]);

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('daily_drill_subscriptions')
    .select('id, domain, active, phone_e164, created_at, updated_at')
    .eq('user_id', user.id)
    .order('domain', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscriptions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const domain = typeof payload.domain === 'string' ? payload.domain.trim() : '';
  const active = payload.active === false ? false : true;
  const phoneE164 =
    typeof payload.phone_e164 === 'string' && payload.phone_e164.trim()
      ? payload.phone_e164.trim()
      : null;

  if (!ALLOWED_DOMAINS.has(domain)) {
    return NextResponse.json(
      { error: `domain must be one of: ${Array.from(ALLOWED_DOMAINS).join(', ')}` },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from('daily_drill_subscriptions')
    .upsert(
      {
        user_id: user.id,
        domain,
        active,
        phone_e164: phoneE164,
      },
      { onConflict: 'user_id,domain' }
    )
    .select('id, domain, active, phone_e164, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, subscription: data });
}
