-- Activate content admins and add job content workflow tracking.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'admin_type'
      AND e.enumlabel = 'content'
  ) THEN
    ALTER TYPE public.admin_type ADD VALUE 'content';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND admin_type::text IN ('super', 'operations', 'content')
  );
$$;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS content_status text NOT NULL DEFAULT 'not_started'
    CHECK (content_status IN ('not_started', 'in_progress', 'created', 'skipped')),
  ADD COLUMN IF NOT EXISTS content_marked_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS content_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS content_notes text;

CREATE INDEX IF NOT EXISTS idx_jobs_content_status
  ON public.jobs(content_status, content_marked_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_content_marked_by
  ON public.jobs(content_marked_by)
  WHERE content_marked_by IS NOT NULL;

COMMENT ON COLUMN public.jobs.content_status IS
  'Content workflow state for Joblinca content admins: not_started, in_progress, created, skipped.';
COMMENT ON COLUMN public.jobs.content_marked_by IS
  'Admin profile that last updated content_status.';
COMMENT ON COLUMN public.jobs.content_marked_at IS
  'Timestamp of the last content workflow update.';
COMMENT ON COLUMN public.jobs.content_notes IS
  'Short internal note for content workflow context.';
