-- WhatsApp Recruiter Phase 3 (productization)
-- Idempotency hardening for recruiter notification fanout + retry performance.

-- Keep only the newest row per session/channel before adding uniqueness.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY session_id, channel
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.wa_screening_notifications
)
DELETE FROM public.wa_screening_notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS wa_screening_notifications_session_channel_uidx
  ON public.wa_screening_notifications (session_id, channel);

CREATE INDEX IF NOT EXISTS wa_screening_notifications_retry_idx
  ON public.wa_screening_notifications (status, attempt_count, created_at)
  WHERE status IN ('pending', 'failed');
