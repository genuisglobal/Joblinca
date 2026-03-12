/**
 * Admin type definitions and constants.
 * Safe to import from both client and server components.
 *
 * For server-side admin checks (checkAdminStatus, requireAdmin, etc.),
 * import from '@/lib/admin' instead.
 */

/**
 * All possible admin types (matches database enum)
 */
export type AdminType =
  | "super"
  | "operations"
  | "support"
  | "recruiter_admin"
  | "ai";

/**
 * Currently active admin types.
 * UPDATE THIS when activating new admin types in the database.
 */
export const ACTIVE_ADMIN_TYPES: readonly AdminType[] = ["super", "operations"];

/**
 * Get a human-readable label for an admin type
 */
export function getAdminTypeLabel(type: AdminType): string {
  const labels: Record<AdminType, string> = {
    super: "Super Admin",
    operations: "Operations Admin",
    support: "Support Admin",
    recruiter_admin: "Recruiter Admin",
    ai: "AI System",
  };
  return labels[type] || type;
}

/**
 * Check if an admin type is currently active in the system
 */
export function isAdminTypeActive(type: AdminType): boolean {
  return ACTIVE_ADMIN_TYPES.includes(type as "super" | "operations");
}

/**
 * Get all currently active admin types
 */
export function getActiveAdminTypes(): readonly AdminType[] {
  return ACTIVE_ADMIN_TYPES;
}
