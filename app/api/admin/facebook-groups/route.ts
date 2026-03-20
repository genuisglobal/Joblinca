import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';
import { DEFAULT_FACEBOOK_GROUPS } from '@/lib/scrapers/providers/facebook';

export const runtime = 'nodejs';

/**
 * GET /api/admin/facebook-groups — list monitored groups
 * POST /api/admin/facebook-groups — add a new group
 * PATCH /api/admin/facebook-groups — toggle enabled/disabled
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    // Return defaults if DB not available
    return NextResponse.json({ groups: DEFAULT_FACEBOOK_GROUPS, source: 'defaults' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('facebook_job_groups')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    // Table might not exist yet — return defaults
    return NextResponse.json({ groups: DEFAULT_FACEBOOK_GROUPS, source: 'defaults', note: error.message });
  }

  return NextResponse.json({ groups: data, source: 'database' });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { url, name, language } = body as { url?: string; name?: string; language?: string };

  if (!url || !name) {
    return NextResponse.json({ error: 'url and name are required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('facebook_job_groups')
    .insert({
      url,
      name,
      language: language || 'fr',
      enabled: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ group: data });
}

export async function PATCH(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { id, enabled } = body as { id?: string; enabled?: boolean };

  if (!id || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'id and enabled are required' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data, error } = await supabase
    .from('facebook_job_groups')
    .update({ enabled })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ group: data });
}
