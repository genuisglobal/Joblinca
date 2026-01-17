-- Migration 007_onboarding_enhancements.sql
--
-- This migration adds fields to support the new multi-step onboarding wizard.
-- It adds first/last name split, gender (using existing sex column), residence
-- location, onboarding progress tracking, and role-specific fields for enhanced
-- profile completion.

-- 1. Add onboarding tracking columns to profiles
ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS last_name TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS residence_location TEXT;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;

-- Note: We'll use the existing 'sex' column for gender. The column already exists
-- from migration 005. We can use it as-is for storing gender preference.

-- 2. Add location_interests to job_seeker_profiles
ALTER TABLE IF EXISTS public.job_seeker_profiles
  ADD COLUMN IF NOT EXISTS location_interests JSONB DEFAULT '[]'::jsonb;

-- 3. Add new fields to talent_profiles
ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS school_name TEXT;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS graduation_year INTEGER;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS field_of_study TEXT;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS location_interests JSONB DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.talent_profiles
  ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- 4. Add company_logo_url to recruiter_profiles
ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT;

-- 5. Create storage buckets for profile avatars and company logos
-- Note: These need to be created via Supabase dashboard or CLI, not raw SQL.
-- The buckets needed are:
--   - profile-avatars (public)
--   - company-logos (public)
--
-- To create via Supabase CLI:
--   supabase storage create profile-avatars --public
--   supabase storage create company-logos --public

-- 6. Backfill first_name and last_name from full_name for existing users
UPDATE public.profiles
SET
  first_name = COALESCE(
    NULLIF(TRIM(SPLIT_PART(full_name, ' ', 1)), ''),
    'User'
  ),
  last_name = COALESCE(
    NULLIF(TRIM(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1)), ''),
    ''
  )
WHERE first_name IS NULL AND full_name IS NOT NULL;

-- 7. Mark users who already have basic profile data as onboarding completed
-- This prevents existing users from being forced through onboarding again
UPDATE public.profiles p
SET onboarding_completed = TRUE
WHERE
  (p.full_name IS NOT NULL AND p.full_name != '') OR
  (p.first_name IS NOT NULL AND p.first_name != '');

-- 8. Index for faster onboarding status queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding
ON public.profiles (onboarding_completed, onboarding_skipped);

-- 9. Comments for documentation
COMMENT ON COLUMN public.profiles.first_name IS 'User first name, collected during onboarding';
COMMENT ON COLUMN public.profiles.last_name IS 'User last name, collected during onboarding';
COMMENT ON COLUMN public.profiles.residence_location IS 'City/region where user resides in Cameroon';
COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Whether user has completed the onboarding wizard';
COMMENT ON COLUMN public.profiles.onboarding_skipped IS 'Whether user skipped the onboarding wizard';
COMMENT ON COLUMN public.profiles.onboarding_step IS 'Current step in onboarding wizard (for resuming)';
COMMENT ON COLUMN public.job_seeker_profiles.location_interests IS 'JSON array of preferred work locations (remote, cities, etc.)';
COMMENT ON COLUMN public.talent_profiles.school_name IS 'Name of school/university';
COMMENT ON COLUMN public.talent_profiles.graduation_year IS 'Year of graduation or expected graduation';
COMMENT ON COLUMN public.talent_profiles.field_of_study IS 'Field/major of study';
COMMENT ON COLUMN public.talent_profiles.skills IS 'JSON array of skills with ratings: [{name, rating}]';
COMMENT ON COLUMN public.talent_profiles.location_interests IS 'JSON array of preferred work locations';
COMMENT ON COLUMN public.talent_profiles.resume_url IS 'URL to uploaded resume file';
COMMENT ON COLUMN public.recruiter_profiles.company_logo_url IS 'URL to company logo image';
