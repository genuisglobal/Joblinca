-- Job lifecycle management
--
-- Separates moderation (`approval_status`) from the post-publish hiring lifecycle.
-- Closed jobs can remain viewable for direct links while no longer accepting
-- applications or showing in open-job feeds.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_lifecycle_status_enum') THEN
    CREATE TYPE public.job_lifecycle_status_enum AS ENUM (
      'on_hold',
      'live',
      'closed_reviewing',
      'filled',
      'archived',
      'removed'
    );
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS lifecycle_status public.job_lifecycle_status_enum NOT NULL DEFAULT 'on_hold',
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS filled_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reposted_from_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_hire_date date,
  ADD COLUMN IF NOT EXISTS retention_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS removal_reason text;

CREATE INDEX IF NOT EXISTS idx_jobs_lifecycle_status
  ON public.jobs(lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_live_visibility
  ON public.jobs(published, approval_status, lifecycle_status, closes_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_retention_expires_at
  ON public.jobs(retention_expires_at)
  WHERE retention_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_reposted_from_job_id
  ON public.jobs(reposted_from_job_id)
  WHERE reposted_from_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_removed_at
  ON public.jobs(removed_at)
  WHERE removed_at IS NOT NULL;

COMMENT ON COLUMN public.jobs.lifecycle_status IS 'Hiring lifecycle state: on_hold, live, closed_reviewing, filled, archived, removed';
COMMENT ON COLUMN public.jobs.closed_at IS 'Timestamp when the posting stopped accepting new applications';
COMMENT ON COLUMN public.jobs.closed_reason IS 'Reason for closing: deadline_elapsed, manual_hold, filled, removed, etc.';
COMMENT ON COLUMN public.jobs.archived_at IS 'Timestamp when the job became read-only historical data';
COMMENT ON COLUMN public.jobs.filled_at IS 'Timestamp when the job reached a successful hire';
COMMENT ON COLUMN public.jobs.last_reopened_at IS 'Timestamp of the most recent reopen action';
COMMENT ON COLUMN public.jobs.reopen_count IS 'Number of times the job has been reopened after being closed';
COMMENT ON COLUMN public.jobs.reposted_from_job_id IS 'Original job when this posting is a reposted clone';
COMMENT ON COLUMN public.jobs.target_hire_date IS 'Planned hire/start date used for post-fill retention';
COMMENT ON COLUMN public.jobs.retention_expires_at IS 'When a filled/closed job is eligible for archival or purge';
COMMENT ON COLUMN public.jobs.removed_at IS 'Timestamp when the job was removed for moderation or abuse';
COMMENT ON COLUMN public.jobs.removed_by IS 'Admin who removed the job from publication';
COMMENT ON COLUMN public.jobs.removal_reason IS 'Removal reason for moderation or report-driven takedowns';

UPDATE public.jobs
SET
  removed_at = CASE
    WHEN approval_status = 'rejected'
      THEN COALESCE(removed_at, approved_at, updated_at, created_at, now())
    ELSE removed_at
  END,
  removed_by = CASE
    WHEN approval_status = 'rejected'
      THEN COALESCE(removed_by, approved_by)
    ELSE removed_by
  END,
  removal_reason = CASE
    WHEN approval_status = 'rejected'
      THEN COALESCE(NULLIF(BTRIM(removal_reason), ''), NULLIF(BTRIM(rejection_reason), ''), 'Removed by moderation')
    ELSE removal_reason
  END,
  lifecycle_status = CASE
    WHEN approval_status = 'rejected' OR removed_at IS NOT NULL THEN 'removed'::public.job_lifecycle_status_enum
    WHEN archived_at IS NOT NULL THEN 'archived'::public.job_lifecycle_status_enum
    WHEN filled_at IS NOT NULL THEN 'filled'::public.job_lifecycle_status_enum
    WHEN published = true AND approval_status = 'approved' AND closes_at IS NOT NULL AND closes_at <= now()
      THEN 'closed_reviewing'::public.job_lifecycle_status_enum
    WHEN published = true AND approval_status = 'approved'
      THEN 'live'::public.job_lifecycle_status_enum
    ELSE 'on_hold'::public.job_lifecycle_status_enum
  END,
  closed_at = CASE
    WHEN closed_at IS NOT NULL THEN closed_at
    WHEN approval_status = 'rejected'
      THEN COALESCE(approved_at, updated_at, created_at, now())
    WHEN published = true AND approval_status = 'approved' AND closes_at IS NOT NULL AND closes_at <= now()
      THEN closes_at
    ELSE closed_at
  END,
  closed_reason = CASE
    WHEN NULLIF(BTRIM(closed_reason), '') IS NOT NULL THEN closed_reason
    WHEN approval_status = 'rejected' THEN 'removed'
    WHEN published = true AND approval_status = 'approved' AND closes_at IS NOT NULL AND closes_at <= now()
      THEN 'deadline_elapsed'
    ELSE closed_reason
  END,
  retention_expires_at = CASE
    WHEN retention_expires_at IS NOT NULL THEN retention_expires_at
    WHEN filled_at IS NOT NULL
      THEN COALESCE(target_hire_date::timestamptz, filled_at) + interval '30 days'
    WHEN published = true AND approval_status = 'approved' AND closes_at IS NOT NULL AND closes_at <= now()
      THEN COALESCE(
        target_hire_date::timestamptz + interval '30 days',
        closes_at + interval '45 days'
      )
    ELSE retention_expires_at
  END,
  published = CASE
    WHEN approval_status = 'rejected' OR removed_at IS NOT NULL OR archived_at IS NOT NULL OR filled_at IS NOT NULL
      THEN false
    ELSE published
  END;

CREATE OR REPLACE FUNCTION public.sync_job_lifecycle_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now();
  v_old_status text := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.lifecycle_status::text, '') ELSE '' END;
  v_old_closed_at timestamptz := CASE WHEN TG_OP = 'UPDATE' THEN OLD.closed_at ELSE NULL END;
  v_old_reopen_count integer := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(OLD.reopen_count, 0) ELSE 0 END;
BEGIN
  NEW.reopen_count := GREATEST(COALESCE(NEW.reopen_count, 0), 0);

  IF NEW.approval_status = 'rejected' OR NEW.removed_at IS NOT NULL THEN
    NEW.lifecycle_status := 'removed';
    NEW.published := false;
    NEW.closed_reason := COALESCE(NULLIF(BTRIM(NEW.closed_reason), ''), 'removed');
    NEW.closed_at := COALESCE(NEW.closed_at, NEW.removed_at, v_now);
    NEW.removed_at := COALESCE(NEW.removed_at, v_now);
    NEW.removed_by := COALESCE(NEW.removed_by, NEW.approved_by);
    NEW.removal_reason := COALESCE(
      NULLIF(BTRIM(NEW.removal_reason), ''),
      NULLIF(BTRIM(NEW.rejection_reason), ''),
      'Removed by moderation'
    );
    RETURN NEW;
  END IF;

  IF NEW.archived_at IS NOT NULL THEN
    NEW.lifecycle_status := 'archived';
    NEW.published := false;
    NEW.closed_at := COALESCE(NEW.closed_at, NEW.archived_at, v_old_closed_at, v_now);
    NEW.closed_reason := COALESCE(NULLIF(BTRIM(NEW.closed_reason), ''), 'archived');
    RETURN NEW;
  END IF;

  IF NEW.filled_at IS NOT NULL THEN
    NEW.lifecycle_status := 'filled';
    NEW.published := false;
    NEW.closed_at := COALESCE(NEW.closed_at, NEW.filled_at, v_old_closed_at, v_now);
    NEW.closed_reason := COALESCE(NULLIF(BTRIM(NEW.closed_reason), ''), 'filled');
    IF NEW.retention_expires_at IS NULL THEN
      NEW.retention_expires_at := COALESCE(
        NEW.target_hire_date::timestamptz,
        NEW.filled_at
      ) + interval '30 days';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.published = true AND NEW.approval_status = 'approved' THEN
    IF NEW.closes_at IS NOT NULL AND NEW.closes_at <= v_now THEN
      NEW.lifecycle_status := 'closed_reviewing';
      NEW.closed_at := COALESCE(NEW.closed_at, NEW.closes_at, v_now);
      NEW.closed_reason := COALESCE(NULLIF(BTRIM(NEW.closed_reason), ''), 'deadline_elapsed');
      IF NEW.retention_expires_at IS NULL THEN
        NEW.retention_expires_at := COALESCE(
          NEW.target_hire_date::timestamptz + interval '30 days',
          NEW.closed_at + interval '45 days'
        );
      END IF;
    ELSE
      NEW.lifecycle_status := 'live';
      IF v_old_status = 'closed_reviewing' OR (v_old_status = 'on_hold' AND v_old_closed_at IS NOT NULL) THEN
        NEW.reopen_count := GREATEST(COALESCE(NEW.reopen_count, v_old_reopen_count), v_old_reopen_count + 1);
        NEW.last_reopened_at := COALESCE(NEW.last_reopened_at, v_now);
      END IF;
      NEW.closed_at := NULL;
      NEW.closed_reason := NULL;
      NEW.retention_expires_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  NEW.lifecycle_status := 'on_hold';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_sync_lifecycle_fields ON public.jobs;
CREATE TRIGGER trg_jobs_sync_lifecycle_fields
  BEFORE INSERT OR UPDATE OF published, approval_status, closes_at, archived_at, filled_at, removed_at, removed_by, removal_reason, closed_at, closed_reason, target_hire_date, retention_expires_at, reopen_count, last_reopened_at
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_job_lifecycle_fields();

CREATE OR REPLACE FUNCTION public.job_is_publicly_visible(job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs
    WHERE id = job_id
      AND published = true
      AND approval_status = 'approved'
      AND removed_at IS NULL
      AND lifecycle_status IN ('live', 'closed_reviewing')
  );
$$;

COMMENT ON FUNCTION public.job_is_publicly_visible IS 'Checks whether a job can be viewed publicly, including closed-but-still-visible posts';

CREATE OR REPLACE FUNCTION public.job_is_publicly_listed(job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs
    WHERE id = job_id
      AND published = true
      AND approval_status = 'approved'
      AND removed_at IS NULL
      AND lifecycle_status = 'live'
  );
$$;

COMMENT ON FUNCTION public.job_is_publicly_listed IS 'Checks whether a job should appear in open-job listings and feeds';

CREATE OR REPLACE FUNCTION public.job_is_accepting_applications(job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs
    WHERE id = job_id
      AND published = true
      AND approval_status = 'approved'
      AND removed_at IS NULL
      AND lifecycle_status = 'live'
      AND (closes_at IS NULL OR closes_at > now())
  );
$$;

COMMENT ON FUNCTION public.job_is_accepting_applications IS 'Check if a job is live and currently accepting applications';

DROP POLICY IF EXISTS "jobs_public_approved" ON public.jobs;
DROP POLICY IF EXISTS "jobs_talent_only_approved" ON public.jobs;

CREATE POLICY "jobs_public_approved" ON public.jobs
  FOR SELECT
  USING (
    published = true
    AND approval_status = 'approved'
    AND removed_at IS NULL
    AND lifecycle_status IN ('live', 'closed_reviewing')
    AND visibility = 'public'
  );

CREATE POLICY "jobs_talent_only_approved" ON public.jobs
  FOR SELECT
  USING (
    published = true
    AND approval_status = 'approved'
    AND removed_at IS NULL
    AND lifecycle_status IN ('live', 'closed_reviewing')
    AND visibility = 'talent_only'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'talent'
    )
  );
