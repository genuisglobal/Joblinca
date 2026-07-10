-- Adds salary range fields to public.jobs so JobPosting JSON-LD can emit a
-- proper baseSalary range, and so recruiters can publish bands instead of a
-- single point. The legacy `salary` column is preserved (still written/read by
-- older code paths); new fields take precedence in display and structured data.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salary_min numeric,
  ADD COLUMN IF NOT EXISTS salary_max numeric,
  ADD COLUMN IF NOT EXISTS salary_currency text NOT NULL DEFAULT 'XAF',
  ADD COLUMN IF NOT EXISTS salary_period text NOT NULL DEFAULT 'MONTH';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_salary_period_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_salary_period_check
      CHECK (salary_period IN ('HOUR','DAY','WEEK','MONTH','YEAR'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_salary_range_check'
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_salary_range_check
      CHECK (
        salary_min IS NULL
        OR salary_max IS NULL
        OR salary_max >= salary_min
      );
  END IF;
END $$;

-- Backfill: for rows that have a single legacy salary value but no range,
-- treat the legacy value as both min and max so structured data still works.
UPDATE public.jobs
SET salary_min = salary,
    salary_max = salary
WHERE salary IS NOT NULL
  AND salary_min IS NULL
  AND salary_max IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON public.jobs (salary_min)
  WHERE salary_min IS NOT NULL;
