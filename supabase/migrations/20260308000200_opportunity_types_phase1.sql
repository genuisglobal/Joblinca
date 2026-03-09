-- Opportunity types phase 1
-- Adds explicit internship tracks, applicant eligibility metadata, and
-- internship-specific requirements without replacing the existing job_type model.

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'internship_track_enum') THEN
    CREATE TYPE public.internship_track_enum AS ENUM (
      'unspecified',
      'education',
      'professional'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'apply_intake_mode_enum') THEN
    CREATE TYPE public.apply_intake_mode_enum AS ENUM (
      'native',
      'managed_whatsapp',
      'managed_email',
      'external_redirect',
      'hybrid'
    );
  END IF;
END;
$$;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS internship_track public.internship_track_enum
    NOT NULL DEFAULT 'unspecified';

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS eligible_roles public.role_enum[]
    NOT NULL DEFAULT ARRAY['job_seeker']::public.role_enum[];

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS apply_intake_mode public.apply_intake_mode_enum
    NOT NULL DEFAULT 'native';

COMMENT ON COLUMN public.jobs.internship_track IS
  'Explicit internship distinction: educational vs professional. Unspecified is legacy-only.';
COMMENT ON COLUMN public.jobs.eligible_roles IS
  'Allowed applicant profile roles for this opportunity.';
COMMENT ON COLUMN public.jobs.apply_intake_mode IS
  'How Joblinca handles ATS intake for this opportunity.';

ALTER TABLE IF EXISTS public.jobs
  DROP CONSTRAINT IF EXISTS jobs_non_empty_eligible_roles_chk;

ALTER TABLE IF EXISTS public.jobs
  ADD CONSTRAINT jobs_non_empty_eligible_roles_chk
  CHECK (COALESCE(array_length(eligible_roles, 1), 0) > 0);

ALTER TABLE IF EXISTS public.jobs
  DROP CONSTRAINT IF EXISTS jobs_internship_track_consistency_chk;

ALTER TABLE IF EXISTS public.jobs
  ADD CONSTRAINT jobs_internship_track_consistency_chk
  CHECK (
    job_type = 'internship'
    OR internship_track = 'unspecified'
  );

CREATE TABLE IF NOT EXISTS public.job_internship_requirements (
  job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  internship_track public.internship_track_enum NOT NULL,
  school_required boolean NOT NULL DEFAULT false,
  allowed_schools text[] NOT NULL DEFAULT '{}',
  allowed_fields_of_study text[] NOT NULL DEFAULT '{}',
  allowed_school_years text[] NOT NULL DEFAULT '{}',
  graduation_year_min integer,
  graduation_year_max integer,
  credit_bearing boolean NOT NULL DEFAULT false,
  requires_school_convention boolean NOT NULL DEFAULT false,
  academic_calendar text,
  academic_supervisor_required boolean NOT NULL DEFAULT false,
  portfolio_required boolean NOT NULL DEFAULT false,
  minimum_project_count integer,
  minimum_badge_count integer,
  conversion_possible boolean NOT NULL DEFAULT false,
  expected_weekly_availability text,
  stipend_type text,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_internship_requirements_year_window_chk
    CHECK (
      graduation_year_min IS NULL
      OR graduation_year_max IS NULL
      OR graduation_year_min <= graduation_year_max
    )
);

DROP TRIGGER IF EXISTS trg_job_internship_requirements_updated_at
  ON public.job_internship_requirements;
CREATE TRIGGER trg_job_internship_requirements_updated_at
  BEFORE UPDATE ON public.job_internship_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

CREATE INDEX IF NOT EXISTS idx_jobs_opportunity_browse
  ON public.jobs(job_type, internship_track, published, approval_status, visibility, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_eligible_roles
  ON public.jobs USING gin (eligible_roles);

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS application_channel text
    DEFAULT 'native_apply'
    CHECK (
      application_channel IN (
        'native_apply',
        'dashboard_quick_apply',
        'managed_whatsapp',
        'managed_email',
        'external_redirect',
        'whatsapp',
        'api'
      )
    );

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS eligibility_status text
    DEFAULT 'eligible'
    CHECK (eligibility_status IN ('eligible', 'ineligible', 'needs_review'));

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS eligibility_reasons jsonb;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS candidate_snapshot jsonb;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS applicant_role public.role_enum;

CREATE INDEX IF NOT EXISTS idx_applications_applicant_role_created
  ON public.applications(applicant_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_eligibility_status_created
  ON public.applications(eligibility_status, created_at DESC);

UPDATE public.jobs
SET internship_track = 'unspecified'
WHERE internship_track IS NULL;

UPDATE public.jobs
SET eligible_roles = CASE
  WHEN job_type = 'internship' THEN ARRAY['job_seeker', 'talent']::public.role_enum[]
  WHEN visibility = 'talent_only' THEN ARRAY['talent']::public.role_enum[]
  ELSE ARRAY['job_seeker']::public.role_enum[]
END
WHERE eligible_roles IS NULL
   OR COALESCE(array_length(eligible_roles, 1), 0) = 0;

UPDATE public.jobs
SET apply_intake_mode = CASE apply_method
  WHEN 'whatsapp' THEN 'managed_whatsapp'::public.apply_intake_mode_enum
  WHEN 'email' THEN 'managed_email'::public.apply_intake_mode_enum
  WHEN 'external_url' THEN 'external_redirect'::public.apply_intake_mode_enum
  WHEN 'multiple' THEN 'hybrid'::public.apply_intake_mode_enum
  ELSE 'native'::public.apply_intake_mode_enum
END;

INSERT INTO public.job_internship_requirements (
  job_id,
  internship_track
)
SELECT id, internship_track
FROM public.jobs
WHERE job_type = 'internship'
ON CONFLICT (job_id) DO NOTHING;

UPDATE public.applications a
SET applicant_role = mapped.applicant_role
FROM (
  SELECT
    p.id,
    CASE p.role
      WHEN 'candidate' THEN 'job_seeker'::public.role_enum
      WHEN 'job_seeker' THEN 'job_seeker'::public.role_enum
      WHEN 'talent' THEN 'talent'::public.role_enum
      WHEN 'recruiter' THEN 'recruiter'::public.role_enum
      WHEN 'vetting_officer' THEN 'vetting_officer'::public.role_enum
      WHEN 'verification_officer' THEN 'verification_officer'::public.role_enum
      WHEN 'admin' THEN 'admin'::public.role_enum
      WHEN 'staff' THEN 'staff'::public.role_enum
      ELSE NULL
    END AS applicant_role
  FROM public.profiles p
) AS mapped
WHERE mapped.id = a.applicant_id
  AND a.applicant_role IS NULL
  AND mapped.applicant_role IS NOT NULL;

UPDATE public.applications
SET
  started_at = COALESCE(started_at, created_at),
  submitted_at = CASE
    WHEN COALESCE(is_draft, false) = false THEN COALESCE(submitted_at, created_at)
    ELSE submitted_at
  END,
  application_channel = COALESCE(application_channel, 'native_apply'),
  eligibility_status = COALESCE(eligibility_status, 'eligible')
WHERE started_at IS NULL
   OR submitted_at IS NULL
   OR application_channel IS NULL
   OR eligibility_status IS NULL;
