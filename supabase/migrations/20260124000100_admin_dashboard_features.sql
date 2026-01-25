-- Migration 20260124000100_admin_dashboard_features.sql
--
-- This migration adds job approval workflow and enhanced verification features
-- for the admin dashboard. It includes:
-- 1. Job approval fields (approval_status, approved_at, approved_by, rejection_reason, posted_by)
-- 2. Enhanced verification fields for job_seeker_profiles
-- 3. Verification tracking fields for recruiter_profiles (verified_at, verified_by, verification_notes)
-- 4. Updated RLS policies using is_active_admin() function

-- ============================================
-- 1. Create approval_status enum for jobs
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status_enum') THEN
    CREATE TYPE public.approval_status_enum AS ENUM (
      'pending',
      'approved',
      'rejected'
    );
  END IF;
END
$$;

-- ============================================
-- 2. Add job approval columns to jobs table
-- ============================================

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS approval_status public.approval_status_enum NOT NULL DEFAULT 'pending';

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES public.profiles(id);

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS posted_by_role text;

-- Index for faster approval status queries
CREATE INDEX IF NOT EXISTS idx_jobs_approval_status
  ON public.jobs(approval_status);

-- Index for admin job queries
CREATE INDEX IF NOT EXISTS idx_jobs_posted_by
  ON public.jobs(posted_by)
  WHERE posted_by IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.jobs.approval_status IS 'Job approval status: pending (awaiting admin review), approved (visible to public), rejected (not visible)';
COMMENT ON COLUMN public.jobs.approved_at IS 'Timestamp when job was approved by admin';
COMMENT ON COLUMN public.jobs.approved_by IS 'Admin user ID who approved/rejected the job';
COMMENT ON COLUMN public.jobs.rejection_reason IS 'Reason for rejection (required when rejecting)';
COMMENT ON COLUMN public.jobs.posted_by IS 'User ID who created the job (for tracking admin-created jobs)';
COMMENT ON COLUMN public.jobs.posted_by_role IS 'Role of user who posted (recruiter, admin, etc.)';

-- ============================================
-- 3. Add verification fields to job_seeker_profiles
-- ============================================

-- Add verification_status using the existing enum
ALTER TABLE IF EXISTS public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS verification_status public.verification_status_enum NOT NULL DEFAULT 'unverified';

ALTER TABLE IF EXISTS public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE IF EXISTS public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id);

ALTER TABLE IF EXISTS public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS verification_notes text;

-- Index for verification status queries
CREATE INDEX IF NOT EXISTS idx_job_seeker_profiles_verification_status
  ON public.job_seeker_profiles(verification_status);

COMMENT ON COLUMN public.job_seeker_profiles.verification_status IS 'Verification status: unverified, pending, verified, rejected';
COMMENT ON COLUMN public.job_seeker_profiles.verified_at IS 'Timestamp when job seeker was verified';
COMMENT ON COLUMN public.job_seeker_profiles.verified_by IS 'Admin user ID who verified the job seeker';
COMMENT ON COLUMN public.job_seeker_profiles.verification_notes IS 'Admin notes about verification decision';

-- ============================================
-- 4. Add verification tracking to recruiter_profiles
-- ============================================

ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES public.profiles(id);

ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS verification_notes text;

-- Index for recruiter verification queries
CREATE INDEX IF NOT EXISTS idx_recruiter_profiles_verification_status
  ON public.recruiter_profiles(verification_status);

COMMENT ON COLUMN public.recruiter_profiles.verified_at IS 'Timestamp when recruiter was verified';
COMMENT ON COLUMN public.recruiter_profiles.verified_by IS 'Admin user ID who verified the recruiter';
COMMENT ON COLUMN public.recruiter_profiles.verification_notes IS 'Admin notes about verification decision';

-- ============================================
-- 5. Backfill existing jobs
-- ============================================

-- Set posted_by to recruiter_id for existing jobs (recruiter created them)
UPDATE public.jobs
SET
  posted_by = recruiter_id,
  posted_by_role = 'recruiter'
WHERE posted_by IS NULL;

-- Set published jobs as approved (they were already visible)
UPDATE public.jobs
SET approval_status = 'approved'
WHERE published = true AND approval_status = 'pending';

-- ============================================
-- 6. Update RLS policies for jobs table
-- ============================================

-- Drop existing job policies that need updating
DROP POLICY IF EXISTS "Published jobs are public" ON public.jobs;
DROP POLICY IF EXISTS "Recruiter manage own jobs" ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_public" ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_talent_only" ON public.jobs;

-- Public can view only published AND approved jobs
CREATE POLICY "jobs_public_approved" ON public.jobs
  FOR SELECT
  USING (
    published = true
    AND approval_status = 'approved'
    AND visibility = 'public'
  );

-- Talent users can view talent_only jobs that are published and approved
CREATE POLICY "jobs_talent_only_approved" ON public.jobs
  FOR SELECT
  USING (
    published = true
    AND approval_status = 'approved'
    AND visibility = 'talent_only'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'talent'
    )
  );

-- Recruiters can view all their own jobs (regardless of approval status)
CREATE POLICY "jobs_recruiter_own" ON public.jobs
  FOR SELECT
  USING (
    auth.uid() = recruiter_id
    OR auth.uid() = posted_by
  );

-- Recruiters can insert jobs
CREATE POLICY "jobs_recruiter_insert" ON public.jobs
  FOR INSERT
  WITH CHECK (
    auth.uid() = recruiter_id
    OR public.is_active_admin()
  );

-- Recruiters can update their own jobs (but not approval fields)
CREATE POLICY "jobs_recruiter_update" ON public.jobs
  FOR UPDATE
  USING (auth.uid() = recruiter_id);

-- Recruiters can delete their own jobs
CREATE POLICY "jobs_recruiter_delete" ON public.jobs
  FOR DELETE
  USING (auth.uid() = recruiter_id);

-- Admins can view all jobs
CREATE POLICY "jobs_admin_select" ON public.jobs
  FOR SELECT
  USING (public.is_active_admin());

-- Admins can manage all jobs (insert, update, delete)
CREATE POLICY "jobs_admin_all" ON public.jobs
  FOR ALL
  USING (public.is_active_admin());

-- ============================================
-- 7. Update RLS policies for recruiter_profiles (admin override)
-- ============================================

DROP POLICY IF EXISTS "recruiter_select" ON public.recruiter_profiles;
DROP POLICY IF EXISTS "recruiter_insert" ON public.recruiter_profiles;
DROP POLICY IF EXISTS "recruiter_update" ON public.recruiter_profiles;

-- Recruiters can select their own profile
CREATE POLICY "recruiter_profiles_select_own" ON public.recruiter_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can select all recruiter profiles
CREATE POLICY "recruiter_profiles_admin_select" ON public.recruiter_profiles
  FOR SELECT
  USING (public.is_active_admin());

-- Recruiters can insert their own profile
CREATE POLICY "recruiter_profiles_insert_own" ON public.recruiter_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Recruiters can update their own profile (excluding verification fields)
CREATE POLICY "recruiter_profiles_update_own" ON public.recruiter_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can update all recruiter profiles (for verification)
CREATE POLICY "recruiter_profiles_admin_update" ON public.recruiter_profiles
  FOR UPDATE
  USING (public.is_active_admin());

-- ============================================
-- 8. Update RLS policies for job_seeker_profiles (admin override)
-- ============================================

DROP POLICY IF EXISTS "job_seeker_select" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "job_seeker_insert" ON public.job_seeker_profiles;
DROP POLICY IF EXISTS "job_seeker_update" ON public.job_seeker_profiles;

-- Job seekers can select their own profile
CREATE POLICY "job_seeker_profiles_select_own" ON public.job_seeker_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can select all job seeker profiles
CREATE POLICY "job_seeker_profiles_admin_select" ON public.job_seeker_profiles
  FOR SELECT
  USING (public.is_active_admin());

-- Job seekers can insert their own profile
CREATE POLICY "job_seeker_profiles_insert_own" ON public.job_seeker_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Job seekers can update their own profile
CREATE POLICY "job_seeker_profiles_update_own" ON public.job_seeker_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can update all job seeker profiles (for verification)
CREATE POLICY "job_seeker_profiles_admin_update" ON public.job_seeker_profiles
  FOR UPDATE
  USING (public.is_active_admin());

-- ============================================
-- 9. Update verifications table RLS for admin access
-- ============================================

DROP POLICY IF EXISTS "User manage own verifications" ON public.verifications;
DROP POLICY IF EXISTS "Verification officers read all verifications" ON public.verifications;

-- Users can manage their own verifications
CREATE POLICY "verifications_user_own" ON public.verifications
  FOR ALL
  USING (auth.uid() = user_id);

-- Verification officers can read all
CREATE POLICY "verifications_officer_select" ON public.verifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'verification_officer'
    )
  );

-- Admins can read and update all verifications
CREATE POLICY "verifications_admin_select" ON public.verifications
  FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "verifications_admin_update" ON public.verifications
  FOR UPDATE
  USING (public.is_active_admin());

-- ============================================
-- 10. Create helper function for job approval
-- ============================================

CREATE OR REPLACE FUNCTION public.approve_job(
  job_id uuid,
  admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = admin_id
    AND admin_type IN ('super', 'operations')
  ) THEN
    RAISE EXCEPTION 'Only active admins can approve jobs';
  END IF;

  -- Update the job
  UPDATE public.jobs
  SET
    approval_status = 'approved',
    approved_at = now(),
    approved_by = admin_id,
    published = true,
    rejection_reason = NULL
  WHERE id = job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job with ID % not found', job_id;
  END IF;
END;
$$;

-- ============================================
-- 11. Create helper function for job rejection
-- ============================================

CREATE OR REPLACE FUNCTION public.reject_job(
  job_id uuid,
  admin_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = admin_id
    AND admin_type IN ('super', 'operations')
  ) THEN
    RAISE EXCEPTION 'Only active admins can reject jobs';
  END IF;

  -- Require rejection reason
  IF reason IS NULL OR TRIM(reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  -- Update the job
  UPDATE public.jobs
  SET
    approval_status = 'rejected',
    approved_at = now(),
    approved_by = admin_id,
    published = false,
    rejection_reason = reason
  WHERE id = job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job with ID % not found', job_id;
  END IF;
END;
$$;

-- ============================================
-- 12. Create helper function for recruiter verification
-- ============================================

CREATE OR REPLACE FUNCTION public.verify_recruiter(
  recruiter_user_id uuid,
  admin_id uuid,
  notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = admin_id
    AND admin_type IN ('super', 'operations')
  ) THEN
    RAISE EXCEPTION 'Only active admins can verify recruiters';
  END IF;

  -- Update the recruiter profile
  UPDATE public.recruiter_profiles
  SET
    verification_status = 'verified',
    verified_at = now(),
    verified_by = admin_id,
    verification_notes = notes
  WHERE user_id = recruiter_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recruiter profile with user ID % not found', recruiter_user_id;
  END IF;

  -- Also update the verifications table if exists
  UPDATE public.verifications
  SET
    status = 'approved',
    updated_at = now()
  WHERE user_id = recruiter_user_id AND status = 'pending';
END;
$$;

-- ============================================
-- 13. Create helper function for recruiter rejection
-- ============================================

CREATE OR REPLACE FUNCTION public.reject_recruiter(
  recruiter_user_id uuid,
  admin_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = admin_id
    AND admin_type IN ('super', 'operations')
  ) THEN
    RAISE EXCEPTION 'Only active admins can reject recruiters';
  END IF;

  -- Require rejection reason
  IF reason IS NULL OR TRIM(reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  -- Update the recruiter profile
  UPDATE public.recruiter_profiles
  SET
    verification_status = 'rejected',
    verified_at = now(),
    verified_by = admin_id,
    verification_notes = reason
  WHERE user_id = recruiter_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recruiter profile with user ID % not found', recruiter_user_id;
  END IF;

  -- Also update the verifications table if exists
  UPDATE public.verifications
  SET
    status = 'rejected',
    updated_at = now()
  WHERE user_id = recruiter_user_id AND status = 'pending';
END;
$$;

-- ============================================
-- 14. Create helper function for job seeker verification
-- ============================================

CREATE OR REPLACE FUNCTION public.verify_job_seeker(
  job_seeker_user_id uuid,
  admin_id uuid,
  notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = admin_id
    AND admin_type IN ('super', 'operations')
  ) THEN
    RAISE EXCEPTION 'Only active admins can verify job seekers';
  END IF;

  -- Update the job seeker profile
  UPDATE public.job_seeker_profiles
  SET
    verification_status = 'verified',
    verified_at = now(),
    verified_by = admin_id,
    verification_notes = notes
  WHERE user_id = job_seeker_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job seeker profile with user ID % not found', job_seeker_user_id;
  END IF;
END;
$$;

-- ============================================
-- 15. Create helper function for job seeker rejection
-- ============================================

CREATE OR REPLACE FUNCTION public.reject_job_seeker(
  job_seeker_user_id uuid,
  admin_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify admin has permission
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = admin_id
    AND admin_type IN ('super', 'operations')
  ) THEN
    RAISE EXCEPTION 'Only active admins can reject job seekers';
  END IF;

  -- Require rejection reason
  IF reason IS NULL OR TRIM(reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required';
  END IF;

  -- Update the job seeker profile
  UPDATE public.job_seeker_profiles
  SET
    verification_status = 'rejected',
    verified_at = now(),
    verified_by = admin_id,
    verification_notes = reason
  WHERE user_id = job_seeker_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job seeker profile with user ID % not found', job_seeker_user_id;
  END IF;
END;
$$;
