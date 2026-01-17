/**
 * Admin utilities for Joblinca
 *
 * This module provides centralized admin access control for the application.
 * It mirrors the database functions (is_active_admin, is_super_admin) to ensure
 * consistent behavior between RLS policies and application logic.
 *
 * IMPORTANT: The source of truth for which admin types are "active" is the
 * is_active_admin() database function. If you activate new admin types,
 * update ACTIVE_ADMIN_TYPES here to match.
 */

import { createServerSupabaseClient } from "./supabase/server";

// ============================================
// Type Definitions
// ============================================

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
 * Currently active admin types
 * UPDATE THIS when activating new admin types in the database
 */
const ACTIVE_ADMIN_TYPES = ["super", "operations"] as const;
type ActiveAdminType = (typeof ACTIVE_ADMIN_TYPES)[number];

/**
 * Result of an admin status check
 */
export interface AdminCheckResult {
  /** Whether the user is an active admin */
  isAdmin: boolean;
  /** The user's admin type (null if not an admin) */
  adminType: AdminType | null;
  /** The user's ID (null if not authenticated) */
  userId: string | null;
  /** The user's email (for logging/display) */
  email: string | null;
}

/**
 * Error thrown when admin access is required but not present
 */
export class AdminRequiredError extends Error {
  constructor(message = "Admin access required") {
    super(message);
    this.name = "AdminRequiredError";
  }
}

/**
 * Error thrown when a specific admin type is required
 */
export class InsufficientAdminPrivilegesError extends Error {
  constructor(
    public requiredTypes: AdminType[],
    public actualType: AdminType | null
  ) {
    super(
      `Insufficient admin privileges. Required: ${requiredTypes.join(" or ")}. Actual: ${actualType || "none"}`
    );
    this.name = "InsufficientAdminPrivilegesError";
  }
}

// ============================================
// Core Functions
// ============================================

/**
 * Check the admin status of the current user
 *
 * Use this in Server Components and Route Handlers to determine
 * if the current user has admin access.
 *
 * @example
 * ```ts
 * const { isAdmin, adminType } = await checkAdminStatus();
 * if (isAdmin) {
 *   // Show admin content
 * }
 * ```
 */
export async function checkAdminStatus(): Promise<AdminCheckResult> {
  const supabase = createServerSupabaseClient();

  // Get the current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      isAdmin: false,
      adminType: null,
      userId: null,
      email: null,
    };
  }

  // Get the user's profile with admin_type
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const adminType = (profile?.admin_type as AdminType) || null;

  // Check if this admin type is currently active
  const isAdmin =
    adminType !== null &&
    ACTIVE_ADMIN_TYPES.includes(adminType as ActiveAdminType);

  return {
    isAdmin,
    adminType,
    userId: user.id,
    email: user.email || null,
  };
}

/**
 * Require admin access - throws if not an active admin
 *
 * Use at the top of admin-only routes or server actions.
 *
 * @throws {AdminRequiredError} If user is not an active admin
 *
 * @example
 * ```ts
 * export default async function AdminPage() {
 *   const { adminType } = await requireAdmin();
 *   return <div>Welcome, {adminType} admin!</div>;
 * }
 * ```
 */
export async function requireAdmin(): Promise<AdminCheckResult> {
  const result = await checkAdminStatus();

  if (!result.userId) {
    throw new AdminRequiredError("Authentication required");
  }

  if (!result.isAdmin) {
    throw new AdminRequiredError("Admin access required");
  }

  return result;
}

/**
 * Require a specific admin type
 *
 * Use when certain operations should only be available to specific admin types.
 *
 * @param requiredType - Single admin type or array of acceptable types
 * @throws {AdminRequiredError} If user is not authenticated
 * @throws {InsufficientAdminPrivilegesError} If user doesn't have required type
 *
 * @example
 * ```ts
 * // Only super admins can delete users
 * await requireAdminType('super');
 *
 * // Super or operations can manage jobs
 * await requireAdminType(['super', 'operations']);
 * ```
 */
export async function requireAdminType(
  requiredType: AdminType | AdminType[]
): Promise<AdminCheckResult> {
  const result = await checkAdminStatus();
  const types = Array.isArray(requiredType) ? requiredType : [requiredType];

  if (!result.userId) {
    throw new AdminRequiredError("Authentication required");
  }

  if (!result.adminType || !types.includes(result.adminType)) {
    throw new InsufficientAdminPrivilegesError(types, result.adminType);
  }

  return result;
}

/**
 * Check if user is a super admin
 *
 * Super admins have the highest level of access and can:
 * - Manage other admins
 * - Access all data
 * - Perform destructive operations
 */
export async function isSuperAdmin(): Promise<boolean> {
  const { adminType } = await checkAdminStatus();
  return adminType === "super";
}

/**
 * Check if user is an operations admin
 *
 * Operations admins handle day-to-day management:
 * - User support
 * - Content moderation
 * - Basic data management
 */
export async function isOperationsAdmin(): Promise<boolean> {
  const { adminType } = await checkAdminStatus();
  return adminType === "operations";
}

// ============================================
// Utility Functions
// ============================================

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
  return ACTIVE_ADMIN_TYPES.includes(type as ActiveAdminType);
}

/**
 * Get all currently active admin types
 */
export function getActiveAdminTypes(): readonly AdminType[] {
  return ACTIVE_ADMIN_TYPES;
}
