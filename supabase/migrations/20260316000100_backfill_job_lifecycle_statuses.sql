-- Replay the lifecycle trigger for existing jobs so rows created before the
-- lifecycle rollout become visible under the current RLS policies.
UPDATE public.jobs
SET
  published = published,
  approval_status = approval_status,
  closes_at = closes_at,
  archived_at = archived_at,
  filled_at = filled_at,
  removed_at = removed_at,
  closed_at = closed_at,
  closed_reason = closed_reason,
  target_hire_date = target_hire_date,
  retention_expires_at = retention_expires_at;
