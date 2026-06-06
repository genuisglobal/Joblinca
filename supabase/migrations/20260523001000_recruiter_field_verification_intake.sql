DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'verification_submission_source_enum'
  ) THEN
    CREATE TYPE public.verification_submission_source_enum AS ENUM (
      'self_service',
      'field_agent'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'field_officer_recommendation_enum'
  ) THEN
    CREATE TYPE public.field_officer_recommendation_enum AS ENUM (
      'approve',
      'needs_review',
      'reject'
    );
  END IF;
END $$;

ALTER TABLE public.verifications
  ADD COLUMN IF NOT EXISTS submission_source public.verification_submission_source_enum
    NOT NULL DEFAULT 'self_service',
  ADD COLUMN IF NOT EXISTS submitted_by_officer_user_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS officer_code_snapshot text,
  ADD COLUMN IF NOT EXISTS company_name_snapshot text,
  ADD COLUMN IF NOT EXISTS business_registration_url text,
  ADD COLUMN IF NOT EXISTS office_location text,
  ADD COLUMN IF NOT EXISTS field_visit_notes text,
  ADD COLUMN IF NOT EXISTS field_officer_recommendation public.field_officer_recommendation_enum;

CREATE INDEX IF NOT EXISTS idx_verifications_submission_source
  ON public.verifications(submission_source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_verifications_submitted_by_officer
  ON public.verifications(submitted_by_officer_user_id, created_at DESC)
  WHERE submitted_by_officer_user_id IS NOT NULL;

COMMENT ON COLUMN public.verifications.submission_source IS
  'Whether the recruiter verification was submitted directly by the recruiter or by a field agent.';

COMMENT ON COLUMN public.verifications.submitted_by_officer_user_id IS
  'Field agent who captured the recruiter verification intake, when applicable.';

COMMENT ON COLUMN public.verifications.officer_code_snapshot IS
  'Officer code captured at submission time for auditability.';

COMMENT ON COLUMN public.verifications.company_name_snapshot IS
  'Company name captured at verification submission time.';

COMMENT ON COLUMN public.verifications.business_registration_url IS
  'Optional business registration or supporting company document uploaded during verification.';

COMMENT ON COLUMN public.verifications.office_location IS
  'Office or business address captured during recruiter verification intake.';

COMMENT ON COLUMN public.verifications.field_visit_notes IS
  'Field notes captured by the officer during an assisted recruiter verification visit.';

COMMENT ON COLUMN public.verifications.field_officer_recommendation IS
  'Officer recommendation for final recruiter verification review.';
