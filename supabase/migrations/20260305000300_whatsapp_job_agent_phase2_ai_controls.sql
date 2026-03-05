-- WhatsApp Job Agent Phase 2 (AI controls)
-- Adds configurable AI screening controls at job and recruiter profile level.

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS wa_ai_screening_enabled boolean;

ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS wa_ai_screening_enabled boolean;

COMMENT ON COLUMN public.jobs.wa_ai_screening_enabled IS
  'Per-job AI screening override for WhatsApp applications: true=force on, false=force off, null=inherit recruiter/package policy';

COMMENT ON COLUMN public.recruiter_profiles.wa_ai_screening_enabled IS
  'Recruiter default AI screening policy for WhatsApp applications: true=on, false=off, null=derive from package/tier policy';

