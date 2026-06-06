import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { ACTIVE_ADMIN_TYPES, type AdminType } from '@/lib/admin';
import {
  LOCALE_REQUEST_HEADER,
  LOCALE_COOKIE_NAME,
  LOCALE_PREFERENCE_COOKIE_NAME,
  addLocalePrefix,
  getPathLocale,
  hasExplicitLocalePreference,
  normalizeLocale,
  resolveLocalePreference,
  stripLocalePrefix,
} from '@/lib/i18n/locale';

function copyCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }

  return target;
}

export async function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  const internalPathname = stripLocalePrefix(req.nextUrl.pathname);
  let res = NextResponse.next({
    request: {
      headers: requestHeaders,
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
  void error;
  const headerLocale = normalizeLocale(req.headers.get(LOCALE_REQUEST_HEADER));
  const queryLocale = normalizeLocale(req.nextUrl.searchParams.get('lang'));
  const cookieLocale = normalizeLocale(req.cookies.get(LOCALE_COOKIE_NAME)?.value);
  const hasExplicitPreferenceCookie = hasExplicitLocalePreference(
    req.cookies.get(LOCALE_PREFERENCE_COOKIE_NAME)?.value
  );
  const pathnameLocale = getPathLocale(req.nextUrl.pathname);
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
  const requiresFreshProfile =
    internalPathname.startsWith('/admin') ||
    internalPathname.startsWith('/dashboard') ||
    internalPathname.startsWith('/recruiter');

  if (user) {
    const cached = req.cookies.get(PROFILE_CACHE_COOKIE)?.value;
    let cacheHit = false;

    if (cached && !requiresFreshProfile) {
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

  const resolvedLocale =
    pathnameLocale ||
    headerLocale ||
    resolveLocalePreference({
      queryLocale,
      cookieLocale,
      profileLocale: profile?.preferred_locale,
      hasExplicitPreference:
        hasExplicitPreferenceCookie || Boolean(normalizeLocale(profile?.preferred_locale)),
      acceptLanguage: req.headers.get('accept-language'),
    });
  const localizedVisiblePath = addLocalePrefix(internalPathname, resolvedLocale);
  const visibleRedirectTarget = `${localizedVisiblePath}${req.nextUrl.search}`;

  requestHeaders.set(LOCALE_REQUEST_HEADER, resolvedLocale);

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

  if (
    (hasExplicitPreferenceCookie || Boolean(normalizeLocale(profile?.preferred_locale))) &&
    !hasExplicitLocalePreference(req.cookies.get(LOCALE_PREFERENCE_COOKIE_NAME)?.value)
  ) {
    req.cookies.set({
      name: LOCALE_PREFERENCE_COOKIE_NAME,
      value: '1',
    });
    res.cookies.set({
      name: LOCALE_PREFERENCE_COOKIE_NAME,
      value: '1',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  // Protect admin routes
  if (internalPathname.startsWith('/admin')) {
    if (!user) {
      const redirectUrl = new URL(addLocalePrefix('/auth/login', resolvedLocale), req.url);
      redirectUrl.searchParams.set('redirect', visibleRedirectTarget);
      return copyCookies(res, NextResponse.redirect(redirectUrl));
    }

    const isActiveAdmin = profile?.admin_type &&
      ACTIVE_ADMIN_TYPES.includes(profile.admin_type);

    if (!isActiveAdmin) {
      const fallbackPath =
        profile?.role === 'admin'
          ? addLocalePrefix('/jobs', resolvedLocale)
          : addLocalePrefix('/dashboard', resolvedLocale);
      return copyCookies(
        res,
        NextResponse.redirect(new URL(fallbackPath, req.url))
      );
    }
  }

  // Protect recruiter routes
  if (internalPathname.startsWith('/recruiter')) {
    if (!user) {
      const redirectUrl = new URL(addLocalePrefix('/auth/login', resolvedLocale), req.url);
      redirectUrl.searchParams.set('redirect', visibleRedirectTarget);
      return copyCookies(res, NextResponse.redirect(redirectUrl));
    }

    const canUseAdminPostJob =
      internalPathname === '/recruiter/post-job' &&
      Boolean(
        profile?.admin_type &&
        ACTIVE_ADMIN_TYPES.includes(profile.admin_type)
      );

    if (!profile || (profile.role !== 'recruiter' && !canUseAdminPostJob)) {
      return copyCookies(
        res,
        NextResponse.redirect(new URL(addLocalePrefix('/dashboard', resolvedLocale), req.url))
      );
    }
  }

  // Protect dashboard routes - require authentication
  if (internalPathname.startsWith('/dashboard')) {
    if (!user) {
      const redirectUrl = new URL(addLocalePrefix('/auth/login', resolvedLocale), req.url);
      redirectUrl.searchParams.set('redirect', visibleRedirectTarget);
      return copyCookies(res, NextResponse.redirect(redirectUrl));
    }
  }

  // Protect apply routes - require authentication
  if (internalPathname.match(/^\/jobs\/[^/]+\/apply/)) {
    if (!user) {
      const redirectUrl = new URL(addLocalePrefix('/auth/login', resolvedLocale), req.url);
      redirectUrl.searchParams.set('redirect', visibleRedirectTarget);
      return copyCookies(res, NextResponse.redirect(redirectUrl));
    }
  }

  // Protect edit routes - require authentication
  if (internalPathname.match(/^\/jobs\/[^/]+\/edit$/)) {
    if (!user) {
      const redirectUrl = new URL(addLocalePrefix('/auth/login', resolvedLocale), req.url);
      redirectUrl.searchParams.set('redirect', visibleRedirectTarget);
      return copyCookies(res, NextResponse.redirect(redirectUrl));
    }
  }

  if (!pathnameLocale && headerLocale) {
    return copyCookies(
      res,
      NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    );
  }

  if (!pathnameLocale) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = localizedVisiblePath;
    return copyCookies(res, NextResponse.redirect(redirectUrl));
  }

  const rewriteUrl = req.nextUrl.clone();
  rewriteUrl.pathname = internalPathname;

  return copyCookies(
    res,
    NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders,
      },
    })
  );
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
    '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|json|txt|xml|webmanifest)$).*)',
  ],
};
