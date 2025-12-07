import { createBrowserClient } from '@supabase/ssr';

/**
 * Returns a Supabase client configured for browser usage. It pulls the
 * connection details from environment variables set at build time.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  );
}