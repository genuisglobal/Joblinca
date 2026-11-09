-- ============================================================================
-- Close self-service escalation of profiles.role, and fix a dead check that
-- meant this trigger never actually blocked anything.
--
-- Part 1 -- the gap this migration sets out to close:
-- Found during the 2026-09-18 security review of
-- 20260825000100_rls_gap_fixes.sql: that migration correctly restricts
-- profiles updates to `auth.uid() = id or is_active_admin()`, but neither it
-- nor the pre-existing protect_admin_type trigger (20260116000100) guards the
-- `role` column. admin_type/admin_granted_at/admin_granted_by are protected;
-- role is not, so any authenticated user could run
--   update profiles set role = 'admin' where id = auth.uid()
-- via PostgREST with their own session, and every policy in the schema still
-- keyed on profiles.role = 'admin' -- "Admin manage resumes"/"Admin manage
-- resume usage" (20260102000400_resumes.sql), "Admins manage company
-- reputation" (20260709000100_aggregation_vetting_phase2.sql), "Admins manage
-- monitored career pages" (20260709000200_monitored_career_pages.sql), and
-- app/api/skillup/seed/route.ts's role check gating a service-role write --
-- would treat them as an admin. This gap predates 20260825000100 (it existed
-- identically in the intended clean-chain design, e.g.
-- 20260102000700_fix_initial_policies.sql's "Profile update self" policy);
-- turning profiles RLS back on there just made it reachable again without
-- also making profiles.role itself safe to self-write.
--
-- Part 2 -- a bigger bug found while building and testing the fix above:
-- prevent_admin_escalation() is SECURITY DEFINER, and its bypass check reads
-- `current_user`. Inside a SECURITY DEFINER function, current_user is always
-- the function's OWNER for the duration of the call -- not the caller -- so
-- `current_user NOT IN ('postgres', 'supabase_admin', 'service_role')` was
-- always false (the function is owned by postgres, since that's who runs
-- migrations), and the RAISE EXCEPTION branch was dead code. Verified against
-- a live Postgres instance: an ordinary authenticated (non-admin) session
-- could update admin_type freely, with is_super_admin() correctly returning
-- false and the trigger still allowing it. This means the admin_type /
-- admin_granted_at / admin_granted_by protection has not actually been
-- enforced since this trigger was created in 20260116000100 -- it only ever
-- looked like protection.
--
-- Fixed by reading auth.role() instead, which reflects the request's JWT
-- role claim (or, for a genuinely direct connection with no PostgREST/JWT
-- context at all -- migrations, the SQL editor -- returns null). Unlike
-- current_user, it is a plain GUC read (the same mechanism auth.uid() uses),
-- so it is not affected by the SECURITY DEFINER context switch. Verified
-- against a live instance for all four cases: ordinary authenticated user
-- blocked on both role and admin_type, super admin allowed, service_role
-- allowed, and a session with no JWT claims at all (direct access) allowed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_admin_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If admin_type is being changed
  IF OLD.admin_type IS DISTINCT FROM NEW.admin_type THEN
    -- Only allow if the changer is a super admin, or there is no PostgREST/JWT
    -- context at all (direct database access), or the caller authenticated as
    -- service_role.
    IF NOT public.is_super_admin() THEN
      IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'Admin type can only be modified by super admins via direct database access';
      END IF;
    END IF;
  END IF;

  -- Also protect admin_granted_at and admin_granted_by
  IF OLD.admin_granted_at IS DISTINCT FROM NEW.admin_granted_at OR
     OLD.admin_granted_by IS DISTINCT FROM NEW.admin_granted_by THEN
    IF NOT public.is_super_admin() THEN
      IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'Admin grant metadata can only be modified via direct database access';
      END IF;
    END IF;
  END IF;

  -- profiles.role is still checked directly by several policies and routes
  -- that predate is_active_admin() ("the single source of truth" per
  -- 20260116000100_admin_system.sql) and have never been migrated to it, so
  -- it remains a live authorization signal. Guard it the same way admin_type
  -- is guarded above.
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_super_admin() THEN
      IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'Role can only be modified by super admins via direct database access';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- The protect_admin_type trigger (20260116000100_admin_system.sql) already
-- fires this function BEFORE UPDATE on public.profiles -- nothing to
-- re-create.
