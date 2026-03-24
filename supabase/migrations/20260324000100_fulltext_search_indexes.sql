-- Migration: Full-text search indexes for jobs
-- Adds GIN indexes for Postgres full-text search on jobs and external_jobs

-- Jobs table: composite tsvector on title + description + company_name
CREATE INDEX IF NOT EXISTS idx_jobs_fts ON jobs
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(company_name, '')));

-- External jobs table: composite tsvector on title + description
CREATE INDEX IF NOT EXISTS idx_external_jobs_fts ON external_jobs
  USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));
