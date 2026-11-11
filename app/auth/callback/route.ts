import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  DEFAULT_LOCALE,
  LOCALE_REQUEST_HEADER,
  addLocalePrefix,
  getPathLocale,
  normalizeLocale,
} from '@/lib/i18n/locale';

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
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;
  const locale =
    normalizeLocale(request.headers.get(LOCALE_REQUEST_HEADER)) ||
    getPathLocale(requestUrl.pathname) ||
    DEFAULT_LOCALE;
  const code = searchParams.get('code');
  const role = searchParams.get('role') || 'job_seeker';
  const redirectTo = addLocalePrefix(searchParams.get('redirect') || '/dashboard', locale);

  if (!code) {
    return NextResponse.redirect(
      new URL(`${addLocalePrefix('/auth/login', locale)}?error=missing_code`, origin)
    );
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error('[auth/callback] Code exchange failed:', error?.message);
    return NextResponse.redirect(
      new URL(`${addLocalePrefix('/auth/login', locale)}?error=oauth_failed`, origin)
    );
  }

  const user = data.session.user;

  // Every account has a profiles row. (This used to look for a seeker row or
  // recruiters.user_id -- a column that doesn't exist -- so returning
  // recruiters looked brand-new and were re-provisioned as job seekers.)
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  // If no profile exists, create one (first-time OAuth user)
  if (!existingProfile) {
    const validRole = ['job_seeker', 'talent', 'recruiter'].includes(role) ? role : 'job_seeker';

    try {
      const profileRes = await fetch(new URL('/api/profile/create', origin), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // This server-side fetch carries no cookies; prove who we are.
          Authorization: `Bearer ${data.session.access_token}`,
        },
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
