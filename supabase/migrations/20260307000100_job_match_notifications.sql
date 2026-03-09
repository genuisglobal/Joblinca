-- Job matching notification dispatch log
-- Tracks per-channel deliveries for each (job, user) pair to ensure idempotency.

CREATE TABLE IF NOT EXISTS public.job_match_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  match_score integer NOT NULL DEFAULT 0,
  match_reason text,
  trigger_source text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, user_id, channel)
);

CREATE INDEX IF NOT EXISTS job_match_notifications_job_idx
  ON public.job_match_notifications(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_match_notifications_user_idx
  ON public.job_match_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS job_match_notifications_status_idx
  ON public.job_match_notifications(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_job_match_notifications_updated_at ON public.job_match_notifications;
CREATE TRIGGER trg_job_match_notifications_updated_at
  BEFORE UPDATE ON public.job_match_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.job_match_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access job_match_notifications" ON public.job_match_notifications;
CREATE POLICY "Service role full access job_match_notifications"
  ON public.job_match_notifications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins read job_match_notifications" ON public.job_match_notifications;
CREATE POLICY "Admins read job_match_notifications"
  ON public.job_match_notifications
  FOR SELECT
  USING (public.is_active_admin());
