import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateApiKey } from '@/lib/api-keys';

/**
 * GET /api/developer/keys — list user's API keys (without the actual key)
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const { data: keys, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, rate_limit_per_hour, last_used_at, expires_at, revoked_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: keys || [] });
}

/**
 * POST /api/developer/keys — create a new API key
 */
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const body = await request.json();
  const { name } = body as { name?: string };

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
  }

  // Limit to 5 active keys per user
  const { count } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('revoked_at', null);

  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'Maximum 5 active API keys allowed' },
      { status: 400 }
    );
  }

  const { key, hash, prefix } = generateApiKey();

  const { error } = await supabase.from('api_keys').insert({
    user_id: user.id,
    name: name.trim(),
    key_hash: hash,
    key_prefix: prefix,
    scopes: ['jobs.read'],
    rate_limit_per_hour: 100,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return the actual key ONCE — it won't be retrievable again
  return NextResponse.json(
    {
      key, // full key — show once
      prefix,
      name: name.trim(),
      scopes: ['jobs.read'],
      message: 'Save this key now. It will not be shown again.',
    },
    { status: 201 }
  );
}

/**
 * DELETE /api/developer/keys — revoke an API key
 */
export async function DELETE(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const { keyId } = (await request.json()) as { keyId?: string };

  if (!keyId) {
    return NextResponse.json({ error: 'keyId required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
