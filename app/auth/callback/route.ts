import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * OAuth callback handler.
 *
 * After a user authenticates with Google (or any Supabase OAuth provider),
 * Supabase redirects here with a `code` query param. We exchange the code
 * for a session and then forward the user to their dashboard.
 *
 * If the user is brand-new (first OAuth login), we also create their
 * profile row via the existing `/api/profile/create` endpoint.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const role = searchParams.get('role') || 'job_seeker';
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=missing_code', origin));
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('[auth/callback] Code exchange failed:', error?.message);
    return NextResponse.redirect(new URL('/auth/login?error=oauth_failed', origin));
  }

  const user = data.session.user;

  // Check if a profile already exists for this user
  const { data: existingProfile } = await supabase
    .from('job_seeker_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: existingRecruiter } = await supabase
    .from('recruiters')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  // If no profile exists, create one (first-time OAuth user)
  if (!existingProfile && !existingRecruiter) {
    const validRole = ['job_seeker', 'talent', 'recruiter'].includes(role) ? role : 'job_seeker';

    try {
      const profileRes = await fetch(new URL('/api/profile/create', origin), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          role: validRole,
          fullName: user.user_metadata?.full_name || user.user_metadata?.name || '',
          phone: user.phone || '',
        }),
      });

      if (!profileRes.ok) {
        console.error('[auth/callback] Profile creation failed:', await profileRes.text());
      }
    } catch (err) {
      console.error('[auth/callback] Profile creation error:', err);
    }
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
