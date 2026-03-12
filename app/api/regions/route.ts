import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/regions — list platform regions (active or all)
 */
export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data: regions, error } = await supabase
    .from('platform_regions')
    .select('id, name, currency_code, currency_symbol, locale, timezone, is_active, launched_at')
    .order('is_active', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ regions: regions || [] });
}
