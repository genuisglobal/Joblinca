/**
 * Who may call POST /api/profile/create for a given userId.
 *
 * The route writes with the service role, so it must decide this itself. It
 * used to accept any userId and any role from anyone: an anonymous request
 * could make itself admin, or rewrite another user's phone (which links their
 * WhatsApp) or role.
 *
 * Legitimate callers are the signup and OAuth flows, right after the auth
 * user is created -- sometimes before any session exists (email confirmation
 * pending). So:
 *   - only self-service roles; staff roles are granted elsewhere
 *   - a caller with a session must be that user
 *   - a caller without one is accepted only for an auth user created within
 *     the last few minutes (fresh signup), never for an established account
 */

export const SELF_SERVICE_ROLES = ['job_seeker', 'talent', 'recruiter'] as const;
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

/** How long after signUp an unauthenticated provisioning call is accepted. */
export const FRESH_SIGNUP_WINDOW_MS = 30 * 60 * 1000;

export type ProvisionAccess =
  | { ok: true; via: 'session' | 'fresh_signup' }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

export function isSelfServiceRole(role: unknown): role is SelfServiceRole {
  return typeof role === 'string' && (SELF_SERVICE_ROLES as readonly string[]).includes(role);
}

export function decideProvisionAccess(input: {
  userId: string;
  role: unknown;
  /** Authenticated caller (session cookie or bearer token), if any. */
  callerId: string | null;
  /** auth.users.created_at for userId; null when no such auth user. */
  authUserCreatedAt: string | null;
  now?: number;
}): ProvisionAccess {
  if (!isSelfServiceRole(input.role)) {
    return { ok: false, status: 400, error: 'Role not allowed' };
  }

  if (input.callerId) {
    return input.callerId === input.userId
      ? { ok: true, via: 'session' }
      : { ok: false, status: 403, error: 'You can only set up your own profile' };
  }

  if (!input.authUserCreatedAt) {
    return { ok: false, status: 404, error: 'User not found' };
  }
  const age = (input.now ?? Date.now()) - new Date(input.authUserCreatedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > FRESH_SIGNUP_WINDOW_MS) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }
  return { ok: true, via: 'fresh_signup' };
}

/**
 * Profile fields to write. A new profile gets everything; an existing one
 * never changes role and only has empty name/phone filled in -- this route
 * provisions accounts, it does not edit them.
 */
export function buildProfileWrite(input: {
  userId: string;
  role: SelfServiceRole;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  existing: { full_name: string | null; phone: string | null } | null;
}): Record<string, unknown> | null {
  if (!input.existing) {
    return {
      id: input.userId,
      full_name: input.fullName,
      phone: input.phone,
      role: input.role,
      avatar_url: input.avatarUrl,
    };
  }

  const patch: Record<string, unknown> = {};
  if (!input.existing.full_name && input.fullName) patch.full_name = input.fullName;
  if (!input.existing.phone && input.phone) patch.phone = input.phone;
  return Object.keys(patch).length > 0 ? patch : null;
}
