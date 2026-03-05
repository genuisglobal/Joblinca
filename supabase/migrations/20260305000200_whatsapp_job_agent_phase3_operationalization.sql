-- WhatsApp Job Agent Phase 3 (Operationalization)
-- Adds idempotent dispatch tracking for scheduled matched-job messages.

CREATE TABLE IF NOT EXISTS public.wa_matched_job_dispatches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_lead_id uuid NOT NULL REFERENCES public.wa_leads(id) ON DELETE CASCADE,
  dispatch_key text NOT NULL,
  period_key text NOT NULL,
  is_subscribed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  jobs_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_matched_job_dispatches_dispatch_key_uidx
  ON public.wa_matched_job_dispatches(dispatch_key);

CREATE INDEX IF NOT EXISTS wa_matched_job_dispatches_lead_created_idx
  ON public.wa_matched_job_dispatches(wa_lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wa_matched_job_dispatches_status_idx
  ON public.wa_matched_job_dispatches(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_wa_matched_job_dispatches_updated_at ON public.wa_matched_job_dispatches;
CREATE TRIGGER trg_wa_matched_job_dispatches_updated_at
  BEFORE UPDATE ON public.wa_matched_job_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.wa_matched_job_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access wa_matched_job_dispatches" ON public.wa_matched_job_dispatches;
CREATE POLICY "Service role full access wa_matched_job_dispatches"
  ON public.wa_matched_job_dispatches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins read wa_matched_job_dispatches" ON public.wa_matched_job_dispatches;
CREATE POLICY "Admins read wa_matched_job_dispatches"
  ON public.wa_matched_job_dispatches FOR SELECT
  USING (public.is_active_admin());

