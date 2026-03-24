import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ACTIVE_ADMIN_TYPES, type AdminType } from '@/lib/admin';
import {
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  resolveLocalePreference,
} from '@/lib/i18n/locale';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          // Set cookie on request for downstream usage
          req.cookies.set({
            name,
            value,
            ...options,
          });
          // Set cookie on response
          res.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({
            name,
            value: '',
            ...options,
          });
          res.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // IMPORTANT: This refreshes the session and ensures cookies are properly set
  // This must be called for every request to maintain the session
  const { data: { user }, error } = await supabase.auth.getUser();
  const queryLocale = normalizeLocale(req.nextUrl.searchParams.get('lang'));
  const cookieLocale = normalizeLocale(req.cookies.get(LOCALE_COOKIE_NAME)?.value);
  let profile:
    | {
        role?: string | null;
        admin_type?: AdminType | null;
        preferred_locale?: string | null;
      }
    | null = null;

  // Optimization: cache profile in a cookie to avoid a DB query on every request.
  // The cookie is keyed by user ID and invalidated on sign-out or user change.
  const PROFILE_CACHE_COOKIE = 'jl_profile_cache';

  if (user) {
    const cached = req.cookies.get(PROFILE_CACHE_COOKIE)?.value;
    let cacheHit = false;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed._uid === user.id) {
          profile = parsed;
          cacheHit = true;
        }
      } catch {
        // Invalid cache — will re-fetch
      }
    }

    if (!cacheHit) {
      const { data } = await supabase
        .from('profiles')
        .select('role, admin_type, preferred_locale')
        .eq('id', user.id)
        .maybeSingle();

      profile = data ?? null;

      // Cache for 5 minutes — avoids DB hit on every navigation
      const cachePayload = JSON.stringify({ ...profile, _uid: user.id });
      res.cookies.set({
        name: PROFILE_CACHE_COOKIE,
        value: cachePayload,
        path: '/',
        maxAge: 300,
        sameSite: 'lax',
        httpOnly: true,
      });
    }
  } else {
    // Clear cache on sign-out
    if (req.cookies.get(PROFILE_CACHE_COOKIE)) {
      res.cookies.set({
        name: PROFILE_CACHE_COOKIE,
        value: '',
        path: '/',
        maxAge: 0,
      });
    }
  }

  const resolvedLocale = resolveLocalePreference({
    queryLocale,
    cookieLocale,
    profileLocale: profile?.preferred_locale,
    acceptLanguage: req.headers.get('accept-language'),
  });

  if (req.cookies.get(LOCALE_COOKIE_NAME)?.value !== resolvedLocale) {
    req.cookies.set({
      name: LOCALE_COOKIE_NAME,
      value: resolvedLocale,
    });
    res.cookies.set({
      name: LOCALE_COOKIE_NAME,
      value: resolvedLocale,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  // Protect admin routes
  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const redirectUrl = new URL('/auth/login', req.url);
      redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    const isActiveAdmin = profile?.admin_type &&
      ACTIVE_ADMIN_TYPES.includes(profile.admin_type);

    if (!isActiveAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // Protect recruiter routes
  if (req.nextUrl.pathname.startsWith('/recruiter')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }

    const canUseAdminPostJob =
      req.nextUrl.pathname === '/recruiter/post-job' &&
      Boolean(
        profile?.admin_type &&
        ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
      );

    if (!profile || (profile.role !== 'recruiter' && !canUseAdminPostJob)) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // Protect dashboard routes - require authentication
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
      const redirectUrl = new URL('/auth/login', req.url);
      redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Protect apply routes - require authentication
  if (req.nextUrl.pathname.match(/^\/jobs\/[^/]+\/apply/)) {
    if (!user) {
      const redirectUrl = new URL('/auth/login', req.url);
      redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Protect edit routes - require authentication
  if (req.nextUrl.pathname.match(/^\/jobs\/[^/]+\/edit$/)) {
    if (!user) {
      const redirectUrl = new URL('/auth/login', req.url);
      redirectUrl.searchParams.set('redirect', req.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/ routes (handled by their own auth logic; webhooks must not run session middleware)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (assets, images, etc.)
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
};
