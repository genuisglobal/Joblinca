-- Add Cameroon-specific columns to external_jobs table
-- These support the new local scrapers (ReliefWeb, KamerPower, MinaJobs, etc.)

ALTER TABLE external_jobs
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS language text CHECK (language IN ('fr', 'en')),
  ADD COLUMN IF NOT EXISTS is_cameroon_local boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS closing_at timestamptz;

-- Index for filtering Cameroon-local jobs
CREATE INDEX IF NOT EXISTS idx_external_jobs_cameroon_local
  ON external_jobs (is_cameroon_local)
  WHERE is_cameroon_local = true;

-- Index for filtering by region
CREATE INDEX IF NOT EXISTS idx_external_jobs_region
  ON external_jobs (region)
  WHERE region IS NOT NULL;

-- Index for filtering by language
CREATE INDEX IF NOT EXISTS idx_external_jobs_language
  ON external_jobs (language)
  WHERE language IS NOT NULL;

-- Comment
COMMENT ON COLUMN external_jobs.region IS 'Cameroon administrative region (Littoral, Centre, etc.)';
COMMENT ON COLUMN external_jobs.language IS 'Primary language of the posting (fr or en)';
COMMENT ON COLUMN external_jobs.is_cameroon_local IS 'True if scraped from a Cameroon-specific platform';
COMMENT ON COLUMN external_jobs.posted_at IS 'Original posting date from the source platform';
COMMENT ON COLUMN external_jobs.closing_at IS 'Application deadline from the source platform';
