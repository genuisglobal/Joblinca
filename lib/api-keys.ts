import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createHash, randomBytes } from 'crypto';

/**
 * Generate a new API key with the format: jbl_<32 random hex chars>
 */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(24).toString('hex');
  const key = `jbl_${raw}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 12); // "jbl_" + first 8 hex chars
  return { key, hash, prefix };
}

/**
 * Hash an API key for lookup
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Validate an API key from a request and return the owner + scopes.
 * Returns null if invalid/revoked/expired.
 */
export async function validateApiKey(key: string) {
  const hash = hashApiKey(key);
  const supabase = createServiceSupabaseClient();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, rate_limit_per_hour, expires_at')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at (fire-and-forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return {
    keyId: data.id as string,
    userId: data.user_id as string,
    scopes: data.scopes as string[],
    rateLimitPerHour: data.rate_limit_per_hour as number,
  };
}
