-- Supports per-user daily/weekly throttling lookups used by the matching dispatcher.
CREATE INDEX IF NOT EXISTS job_match_notifications_user_status_created_idx
  ON public.job_match_notifications(user_id, status, created_at DESC);
