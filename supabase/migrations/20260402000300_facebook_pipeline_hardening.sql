-- Harden Facebook raw-post processing by tracking retryable extraction status
-- and failure details, and by indexing the retry/group lookups used by the
-- webhook and reprocess flows.

ALTER TABLE public.facebook_raw_posts
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processed', 'skipped', 'failed')),
  ADD COLUMN IF NOT EXISTS extraction_error text,
  ADD COLUMN IF NOT EXISTS extraction_attempts integer NOT NULL DEFAULT 0
    CHECK (extraction_attempts >= 0),
  ADD COLUMN IF NOT EXISTS last_extracted_at timestamptz;

UPDATE public.facebook_raw_posts
SET extraction_status = CASE
  WHEN processed = true AND extracted_job_id IS NOT NULL THEN 'processed'
  WHEN processed = true THEN 'skipped'
  ELSE 'pending'
END
WHERE extraction_status IS NULL
   OR extraction_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_facebook_raw_posts_extraction_status
  ON public.facebook_raw_posts(extraction_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_facebook_raw_posts_group_url
  ON public.facebook_raw_posts(group_url)
  WHERE group_url IS NOT NULL;
