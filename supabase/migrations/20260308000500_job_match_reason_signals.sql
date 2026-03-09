ALTER TABLE public.job_match_notifications
  ADD COLUMN IF NOT EXISTS match_reason_signals jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.job_match_notifications
SET match_reason_signals = COALESCE(
  (
    SELECT jsonb_agg(trimmed_reason)
    FROM (
      SELECT NULLIF(BTRIM(part), '') AS trimmed_reason
      FROM unnest(regexp_split_to_array(COALESCE(match_reason, ''), '\s*;\s*')) AS part
    ) normalized
    WHERE trimmed_reason IS NOT NULL
  ),
  '[]'::jsonb
)
WHERE COALESCE(jsonb_array_length(match_reason_signals), 0) = 0
  AND COALESCE(NULLIF(BTRIM(match_reason), ''), '') <> '';
