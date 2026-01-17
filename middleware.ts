import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Admin types that are currently active (must match lib/admin.ts and database)
const ACTIVE_ADMIN_TYPES = ['super', 'operations'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Protect admin routes
  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login?redirect=/admin', req.url));
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('admin_type')
      .eq('id', user.id)
      .maybeSingle();

    const isActiveAdmin = profile?.admin_type &&
      ACTIVE_ADMIN_TYPES.includes(profile.admin_type);

    if (!isActiveAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  // Protect recruiter routes
  if (req.nextUrl.pathname.startsWith('/recruiter')) {
    if (!user) return NextResponse.redirect(new URL('/auth/login', req.url));

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || profile.role !== 'recruiter') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
  }

  return res;
}

export const config = {
  matcher: ['/admin/:path*', '/recruiter/:path*'],
};
