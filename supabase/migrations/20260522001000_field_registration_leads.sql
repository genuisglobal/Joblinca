-- Field registration leads
-- Adds:
-- 1) Officer-captured registration leads for partial and assisted signup
-- 2) Invite tokens for WhatsApp completion links
-- 3) Audited lead lifecycle events

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.registration_leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  officer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  officer_code_snapshot text NOT NULL,
  intended_role text NOT NULL
    CHECK (intended_role IN ('job_seeker', 'talent', 'recruiter')),
  capture_mode text NOT NULL
    CHECK (capture_mode IN ('quick_capture', 'assisted_signup')),
  full_name text NOT NULL,
  phone_e164 text NOT NULL,
  email text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_whatsapp boolean NOT NULL DEFAULT false,
  consent_recorded_at timestamptz,
  status text NOT NULL DEFAULT 'captured'
    CHECK (
      status IN (
        'captured',
        'invite_sent',
        'opened',
        'completed',
        'duplicate_existing_user',
        'opted_out',
        'expired',
        'cancelled'
      )
    ),
  existing_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_leads_officer_created_idx
  ON public.registration_leads(officer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS registration_leads_status_idx
  ON public.registration_leads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS registration_leads_phone_idx
  ON public.registration_leads(phone_e164);

CREATE UNIQUE INDEX IF NOT EXISTS registration_leads_active_phone_uidx
  ON public.registration_leads(phone_e164)
  WHERE status IN ('captured', 'invite_sent', 'opened');

CREATE TABLE IF NOT EXISTS public.registration_lead_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES public.registration_leads(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  template_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'opened', 'claimed', 'expired', 'failed')),
  sent_at timestamptz,
  opened_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_lead_invites_lead_created_idx
  ON public.registration_lead_invites(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS registration_lead_invites_expires_idx
  ON public.registration_lead_invites(expires_at);

CREATE TABLE IF NOT EXISTS public.registration_lead_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES public.registration_leads(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_lead_events_lead_created_idx
  ON public.registration_lead_events(lead_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_registration_leads_updated_at ON public.registration_leads;
CREATE TRIGGER trg_registration_leads_updated_at
  BEFORE UPDATE ON public.registration_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_registration_lead_invites_updated_at ON public.registration_lead_invites;
CREATE TRIGGER trg_registration_lead_invites_updated_at
  BEFORE UPDATE ON public.registration_lead_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.registration_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_lead_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_lead_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access registration_leads" ON public.registration_leads;
CREATE POLICY "Service role full access registration_leads"
  ON public.registration_leads FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access registration_lead_invites" ON public.registration_lead_invites;
CREATE POLICY "Service role full access registration_lead_invites"
  ON public.registration_lead_invites FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access registration_lead_events" ON public.registration_lead_events;
CREATE POLICY "Service role full access registration_lead_events"
  ON public.registration_lead_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins read registration_leads" ON public.registration_leads;
CREATE POLICY "Admins read registration_leads"
  ON public.registration_leads FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read registration_lead_invites" ON public.registration_lead_invites;
CREATE POLICY "Admins read registration_lead_invites"
  ON public.registration_lead_invites FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read registration_lead_events" ON public.registration_lead_events;
CREATE POLICY "Admins read registration_lead_events"
  ON public.registration_lead_events FOR SELECT
  USING (public.is_active_admin());

COMMENT ON TABLE public.registration_leads IS
  'Officer-captured partial or assisted registrations awaiting account completion.';

COMMENT ON TABLE public.registration_lead_invites IS
  'Completion-link invite records for officer-captured registration leads.';

COMMENT ON TABLE public.registration_lead_events IS
  'Audited lifecycle events for officer-captured registration leads.';
