import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface BoostRow {
  id: string;
  granted_for: string;
  source_type: string;
  source_ref: string | null;
  domain: string | null;
  tokens_granted: number;
  tokens_remaining: number;
  expires_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('talent_application_boosts')
    .select(
      'id, granted_for, source_type, source_ref, domain, tokens_granted, tokens_remaining, expires_at, metadata, created_at'
    )
    .eq('user_id', user.id)
    .order('expires_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as BoostRow[];
  const active = rows.filter(
    (row) => row.tokens_remaining > 0 && row.expires_at > nowIso
  );
  const expired = rows.filter(
    (row) => row.expires_at <= nowIso && row.tokens_remaining > 0
  );
  const tokens_active = active.reduce((sum, row) => sum + row.tokens_remaining, 0);

  return NextResponse.json({
    ok: true,
    tokens_active,
    next_expiry: active[0]?.expires_at ?? null,
    active,
    expired,
  });
}
