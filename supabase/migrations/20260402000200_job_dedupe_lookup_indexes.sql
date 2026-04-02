-- Speed up unified dedupe lookups for aggregation ingestion and publish-time
-- duplicate checks.

CREATE INDEX IF NOT EXISTS idx_discovered_job_sources_source_external_job_id
  ON public.discovered_job_sources(source_id, external_job_id)
  WHERE external_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovered_job_sources_original_job_url
  ON public.discovered_job_sources(original_job_url)
  WHERE original_job_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_original_job_url
  ON public.discovered_jobs(original_job_url)
  WHERE original_job_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_apply_url
  ON public.discovered_jobs(apply_url)
  WHERE apply_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_external_apply_url_live
  ON public.jobs(external_apply_url, created_at DESC)
  WHERE published = true
    AND approval_status = 'approved'
    AND removed_at IS NULL
    AND external_apply_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_external_url_live
  ON public.jobs(external_url, created_at DESC)
  WHERE published = true
    AND approval_status = 'approved'
    AND removed_at IS NULL
    AND external_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_source_attr_original_job_url_live
  ON public.jobs (((source_attribution_json ->> 'original_job_url')), created_at DESC)
  WHERE published = true
    AND approval_status = 'approved'
    AND removed_at IS NULL
    AND (source_attribution_json ->> 'original_job_url') IS NOT NULL;
