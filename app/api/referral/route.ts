import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * GET /api/referral — returns the current user's referral code and stats.
 * Gracefully returns null if referral columns don't exist yet.
 */
export async function GET() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  // Get current user's referral code — may fail if column doesn't exist
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', user.id)
    .maybeSingle();

  // If referral_code column doesn't exist, return null gracefully
  if (profileError && profileError.message.includes('referral_code')) {
    return NextResponse.json({ code: null, referralCount: 0 });
  }

  if (!profile?.referral_code) {
    // Generate one if missing
    const code = Math.random().toString(36).slice(2, 10);
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', user.id);

    // If update fails (column missing), return null
    if (updateErr) {
      return NextResponse.json({ code: null, referralCount: 0 });
    }

    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', user.id);

    return NextResponse.json({ code, referralCount: count ?? 0 });
  }

  // Count how many users this person referred
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', user.id);

  return NextResponse.json({
    code: profile.referral_code,
    referralCount: count ?? 0,
  });
}
