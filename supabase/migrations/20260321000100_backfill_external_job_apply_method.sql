-- ---------------------------------------------------------------------------
-- Backfill apply_method and external_apply_url for already-published
-- scraped jobs (origin_type = 'admin_import') that still have the default
-- 'joblinca' apply_method.
-- ---------------------------------------------------------------------------

UPDATE public.jobs
SET
  apply_method = 'multiple',
  external_apply_url = COALESCE(
    external_url,
    (source_attribution_json ->> 'original_job_url')
  )
WHERE origin_type = 'admin_import'
  AND apply_method = 'joblinca'
  AND (
    external_url IS NOT NULL
    OR (source_attribution_json ->> 'original_job_url') IS NOT NULL
  );
