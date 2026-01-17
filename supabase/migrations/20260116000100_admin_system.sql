-- Migration 20260116000100_admin_system.sql
--
-- This migration introduces a granular admin type system that works alongside
-- the existing role column. It allows a user to have both a regular role
-- (job_seeker, recruiter, etc.) AND admin privileges (super, operations, etc.).
--
-- Key design decisions:
-- 1. Separate admin_type column (not modifying role_enum) for clean separation
-- 2. All admin types defined upfront to avoid future schema changes
-- 3. Only 'super' and 'operations' are active initially
-- 4. Activation of new types requires only a function update, not schema changes

-- ============================================
-- 1. Create admin_type enum with all future types
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_type') THEN
    CREATE TYPE public.admin_type AS ENUM (
      'super',           -- Full system access, can manage other admins
      'operations',      -- Day-to-day operations, user management
      'support',         -- Customer support (future)
      'recruiter_admin', -- Recruiter management (future)
      'ai'               -- AI/automation accounts (future)
    );
  END IF;
END
$$;

-- ============================================
-- 2. Add admin columns to profiles table
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_type public.admin_type DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_granted_at timestamptz DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_granted_by uuid DEFAULT NULL REFERENCES public.profiles(id);

-- Create partial index for fast admin lookups (only indexes actual admins)
CREATE INDEX IF NOT EXISTS idx_profiles_admin_type
  ON public.profiles(admin_type)
  WHERE admin_type IS NOT NULL;

-- Document the column
COMMENT ON COLUMN public.profiles.admin_type IS
  'Admin type for elevated access. NULL = regular user. Currently active: super, operations';

-- ============================================
-- 3. Create RLS helper functions
-- ============================================

-- Primary function: Check if current user is an ACTIVE admin
-- This is the ONLY place that defines which admin types are active
-- To activate new admin types later, only update this function
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type IN ('super', 'operations')
  );
$$;

-- Check if current user is a super admin (full access)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type = 'super'
  );
$$;

-- Check if current user has a specific admin type
-- Useful for granular permissions
CREATE OR REPLACE FUNCTION public.is_admin_type(required_type public.admin_type)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type = required_type
  );
$$;

-- Get current user's admin type (for logging/audit)
CREATE OR REPLACE FUNCTION public.get_admin_type()
RETURNS public.admin_type
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT admin_type FROM public.profiles
  WHERE id = auth.uid();
$$;

-- ============================================
-- 4. Prevent client-side admin escalation
-- ============================================

-- Trigger function to prevent unauthorized admin_type changes
CREATE OR REPLACE FUNCTION public.prevent_admin_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If admin_type is being changed
  IF OLD.admin_type IS DISTINCT FROM NEW.admin_type THEN
    -- Only allow if the changer is a super admin (or this is direct DB access)
    IF NOT public.is_super_admin() THEN
      -- Check if this is being run with elevated privileges (direct DB access)
      -- In that case, current_user will be postgres or similar, not the app user
      IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION 'Admin type can only be modified by super admins via direct database access';
      END IF;
    END IF;
  END IF;

  -- Also protect admin_granted_at and admin_granted_by
  IF OLD.admin_granted_at IS DISTINCT FROM NEW.admin_granted_at OR
     OLD.admin_granted_by IS DISTINCT FROM NEW.admin_granted_by THEN
    IF NOT public.is_super_admin() THEN
      IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
        RAISE EXCEPTION 'Admin grant metadata can only be modified via direct database access';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger (drop first if exists to allow re-running)
DROP TRIGGER IF EXISTS protect_admin_type ON public.profiles;
CREATE TRIGGER protect_admin_type
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_escalation();

-- ============================================
-- 5. Admin grant/revoke functions (SQL-only use)
-- ============================================

-- Grant admin access to a user
-- IMPORTANT: Only run this via Supabase SQL Editor, never from the application
CREATE OR REPLACE FUNCTION public.grant_admin_access(
  target_user_id uuid,
  new_admin_type public.admin_type,
  granted_by_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify the granter is a super admin (if provided and not first admin)
  IF granted_by_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = granted_by_user_id
      AND admin_type = 'super'
    ) THEN
      RAISE EXCEPTION 'Only super admins can grant admin access';
    END IF;
  END IF;

  -- Perform the update
  UPDATE public.profiles
  SET
    admin_type = new_admin_type,
    admin_granted_at = now(),
    admin_granted_by = granted_by_user_id
  WHERE id = target_user_id;

  -- Verify the update happened
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User with ID % not found', target_user_id;
  END IF;
END;
$$;

-- Revoke admin access from a user
CREATE OR REPLACE FUNCTION public.revoke_admin_access(
  target_user_id uuid,
  revoked_by_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    admin_type = NULL,
    admin_granted_at = NULL,
    admin_granted_by = NULL
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User with ID % not found', target_user_id;
  END IF;
END;
$$;

-- ============================================
-- 6. Update key RLS policies to use admin override
-- ============================================

-- Update profiles select policy to use the new admin function
DROP POLICY IF EXISTS "Self profile select" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.is_active_admin()
  );

-- Keep the existing update policy for own profile
-- Admin updates should go through specific admin functions

-- ============================================
-- 7. Add admin audit logging table (optional but recommended)
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action text NOT NULL,
  admin_id uuid NOT NULL REFERENCES public.profiles(id),
  admin_type public.admin_type NOT NULL,
  target_table text,
  target_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can view audit logs
CREATE POLICY "admin_audit_log_super_only" ON public.admin_audit_log
  FOR SELECT
  USING (public.is_super_admin());

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id
  ON public.admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
  ON public.admin_audit_log(created_at DESC);
