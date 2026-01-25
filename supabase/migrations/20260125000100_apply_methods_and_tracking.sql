-- Migration 20260125000100_apply_methods_and_tracking.sql
--
-- This migration adds support for multiple application methods (JobLinca, external URL,
-- email, phone, WhatsApp) and tracking for external application clicks.
-- It also enhances the applications table to store resume URLs per application.

-- ============================================
-- 1. Create apply_method enum
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apply_method_enum') THEN
    CREATE TYPE public.apply_method_enum AS ENUM (
      'joblinca',
      'external_url',
      'email',
      'phone',
      'whatsapp',
      'multiple'
    );
  END IF;
END
$$;

-- ============================================
-- 2. Add apply method columns to jobs table
-- ============================================

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS apply_method public.apply_method_enum NOT NULL DEFAULT 'joblinca';

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS external_apply_url text;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS apply_email text;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS apply_phone text;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS apply_whatsapp text;

-- Add closing date for job postings
ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS closes_at timestamptz;

-- Comments for documentation
COMMENT ON COLUMN public.jobs.apply_method IS 'Primary application method: joblinca (native), external_url (company site), email, phone, whatsapp, or multiple';
COMMENT ON COLUMN public.jobs.external_apply_url IS 'URL to external application page (company website)';
COMMENT ON COLUMN public.jobs.apply_email IS 'Email address for applications';
COMMENT ON COLUMN public.jobs.apply_phone IS 'Phone number for applications';
COMMENT ON COLUMN public.jobs.apply_whatsapp IS 'WhatsApp number for applications (with country code)';
COMMENT ON COLUMN public.jobs.closes_at IS 'Application deadline / job closing date';

-- ============================================
-- 3. Enhance applications table
-- ============================================

-- Add resume_url to store the resume used for this specific application
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS resume_url text;

-- Add application source tracking
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS application_source text DEFAULT 'joblinca'
    CHECK (application_source IN ('joblinca', 'external'));

-- Add contact info snapshot (in case profile changes later)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS contact_info jsonb;

-- Add draft/submitted state for autosave
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS is_draft boolean DEFAULT false;

-- Index for draft applications
CREATE INDEX IF NOT EXISTS idx_applications_draft
  ON public.applications(applicant_id, is_draft)
  WHERE is_draft = true;

COMMENT ON COLUMN public.applications.resume_url IS 'URL to resume file used for this application';
COMMENT ON COLUMN public.applications.application_source IS 'Source of application: joblinca (native) or external';
COMMENT ON COLUMN public.applications.contact_info IS 'Snapshot of applicant contact info at time of application';
COMMENT ON COLUMN public.applications.is_draft IS 'Whether application is still a draft (autosave)';

-- ============================================
-- 4. Create external_apply_clicks table
-- ============================================

CREATE TABLE IF NOT EXISTS public.external_apply_clicks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method IN ('external_url', 'email', 'phone', 'whatsapp', 'copy_link')),
  clicked_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_hash text
);

-- Enable RLS
ALTER TABLE public.external_apply_clicks ENABLE ROW LEVEL SECURITY;

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_external_apply_clicks_job_id
  ON public.external_apply_clicks(job_id);

CREATE INDEX IF NOT EXISTS idx_external_apply_clicks_clicked_at
  ON public.external_apply_clicks(clicked_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_apply_clicks_user_id
  ON public.external_apply_clicks(user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.external_apply_clicks IS 'Tracks clicks on external apply buttons for analytics';
COMMENT ON COLUMN public.external_apply_clicks.method IS 'Apply method clicked: external_url, email, phone, whatsapp, copy_link';
COMMENT ON COLUMN public.external_apply_clicks.ip_hash IS 'Hashed IP for fraud prevention (not storing raw IP)';

-- ============================================
-- 5. RLS Policies for external_apply_clicks
-- ============================================

-- Anyone can insert clicks (logged in or anonymous)
CREATE POLICY "external_apply_clicks_insert" ON public.external_apply_clicks
  FOR INSERT
  WITH CHECK (true);

-- Users can view their own clicks
CREATE POLICY "external_apply_clicks_select_own" ON public.external_apply_clicks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all clicks
CREATE POLICY "external_apply_clicks_admin_select" ON public.external_apply_clicks
  FOR SELECT
  USING (public.is_active_admin());

-- Recruiters can view clicks for their own jobs
CREATE POLICY "external_apply_clicks_recruiter_select" ON public.external_apply_clicks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

-- ============================================
-- 6. Create saved_jobs table for "Save Job" feature
-- ============================================

CREATE TABLE IF NOT EXISTS public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);

-- Enable RLS
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

-- Index for user's saved jobs
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user_id
  ON public.saved_jobs(user_id);

-- Policies
CREATE POLICY "saved_jobs_user_all" ON public.saved_jobs
  FOR ALL
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.saved_jobs IS 'Jobs saved by users for later viewing';

-- ============================================
-- 7. Update applications RLS for drafts
-- ============================================

-- Allow users to update their own draft applications
DROP POLICY IF EXISTS "Applicant create application" ON public.applications;

CREATE POLICY "applications_user_insert" ON public.applications
  FOR INSERT
  WITH CHECK (auth.uid() = applicant_id);

CREATE POLICY "applications_user_update_draft" ON public.applications
  FOR UPDATE
  USING (auth.uid() = applicant_id AND is_draft = true);

-- ============================================
-- 8. Backfill existing jobs with default apply_method
-- ============================================

-- All existing jobs default to 'joblinca' apply method
-- This is handled by the DEFAULT value, no explicit backfill needed

-- ============================================
-- 9. Create helper function to check if job is accepting applications
-- ============================================

CREATE OR REPLACE FUNCTION public.job_is_accepting_applications(job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE id = job_id
    AND published = true
    AND approval_status = 'approved'
    AND (closes_at IS NULL OR closes_at > now())
  );
$$;

COMMENT ON FUNCTION public.job_is_accepting_applications IS 'Check if a job is currently accepting applications';
