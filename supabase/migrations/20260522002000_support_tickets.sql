DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_category_enum') THEN
    CREATE TYPE public.support_ticket_category_enum AS ENUM (
      'login',
      'verification',
      'profile',
      'payment',
      'application',
      'bug',
      'other'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_priority_enum') THEN
    CREATE TYPE public.support_ticket_priority_enum AS ENUM (
      'low',
      'normal',
      'high',
      'urgent'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_status_enum') THEN
    CREATE TYPE public.support_ticket_status_enum AS ENUM (
      'open',
      'in_progress',
      'waiting_on_user',
      'escalated',
      'resolved',
      'closed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_ticket_team_enum') THEN
    CREATE TYPE public.support_ticket_team_enum AS ENUM (
      'support',
      'operations',
      'engineering'
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  field_agent_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_officer_code_snapshot text,
  registration_lead_id uuid REFERENCES public.registration_leads(id) ON DELETE SET NULL,
  target_role text NOT NULL CHECK (target_role IN ('job_seeker', 'talent', 'recruiter')),
  subject_full_name text NOT NULL,
  subject_phone_e164 text,
  subject_email text,
  category public.support_ticket_category_enum NOT NULL DEFAULT 'other',
  priority public.support_ticket_priority_enum NOT NULL DEFAULT 'normal',
  assigned_team public.support_ticket_team_enum NOT NULL DEFAULT 'operations',
  status public.support_ticket_status_enum NOT NULL DEFAULT 'open',
  assigned_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text NOT NULL,
  resolution_summary text,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_kind text NOT NULL CHECK (author_kind IN ('field_agent', 'admin', 'system')),
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_field_agent_created
  ON public.support_tickets(field_agent_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created
  ON public.support_tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_team_status_created
  ON public.support_tickets(assigned_team, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_requester
  ON public.support_tickets(requester_user_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_registration_lead
  ON public.support_tickets(registration_lead_id);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created
  ON public.support_ticket_messages(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_ticket_events_ticket_created
  ON public.support_ticket_events(ticket_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_select_field_or_requester_or_admin" ON public.support_tickets;
CREATE POLICY "support_tickets_select_field_or_requester_or_admin" ON public.support_tickets
  FOR SELECT
  USING (
    auth.uid() = field_agent_user_id
    OR auth.uid() = requester_user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.admin_type IN ('super', 'operations')
    )
  );

DROP POLICY IF EXISTS "support_ticket_messages_select_related_or_admin" ON public.support_ticket_messages;
CREATE POLICY "support_ticket_messages_select_related_or_admin" ON public.support_ticket_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND (
          auth.uid() = t.field_agent_user_id
          OR auth.uid() = t.requester_user_id
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.admin_type IN ('super', 'operations')
          )
        )
    )
  );

DROP POLICY IF EXISTS "support_ticket_events_select_admin_only" ON public.support_ticket_events;
CREATE POLICY "support_ticket_events_select_admin_only" ON public.support_ticket_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.admin_type IN ('super', 'operations')
    )
  );

COMMENT ON TABLE public.support_tickets IS
  'Operational support cases filed by field agents or staff on behalf of job seekers, talents, and recruiters.';

COMMENT ON TABLE public.support_ticket_messages IS
  'Timeline messages for support tickets. Internal notes remain hidden from non-admin views.';

COMMENT ON TABLE public.support_ticket_events IS
  'Audit events for support ticket lifecycle changes.';
