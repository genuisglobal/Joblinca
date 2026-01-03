import { createClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase client configured with the service role key.  This
 * client should only be used on the server (never shipped to the client)
 * because it can bypass Row Level Security.  Use it sparingly for
 * administrative tasks such as creating profile rows during signup or
 * performing privileged operations in API routes.
 */
export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase service configuration is missing');
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}