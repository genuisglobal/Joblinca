-- ---------------------------------------------------------------------------
-- Allow publishing discovered (scraped) jobs to the main jobs table.
--
-- The jobs.recruiter_id column was NOT NULL, but admin-imported / scraped
-- jobs have no recruiter owner.  This migration makes it nullable so that
-- discovered jobs can be promoted to native listings without a recruiter.
-- ---------------------------------------------------------------------------

-- 1. Drop the existing FK + NOT NULL constraint on recruiter_id
ALTER TABLE public.jobs
  ALTER COLUMN recruiter_id DROP NOT NULL;

-- 2. Add a comment explaining the nullable semantics
COMMENT ON COLUMN public.jobs.recruiter_id IS
  'Owner recruiter. NULL for admin-imported or scraped jobs (origin_type != native).';
