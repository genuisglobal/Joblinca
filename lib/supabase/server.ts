import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

/**
 * Returns a Supabase client configured for server-side usage. It binds the
 * current request's cookies so that authentication is seamlessly integrated
 * with Next.js server components and API routes.
 */
export function createServerSupabaseClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      headers: () => headers(),
      cookies: () => cookies(),
    },
  );
}