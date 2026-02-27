-- WhatsApp enhanced schema
-- Extends whatsapp_logs and adds wa_conversations + wa_statuses tables

-- ─── Extend existing whatsapp_logs ───────────────────────────────────────────
ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS wa_message_id     text,
  ADD COLUMN IF NOT EXISTS wa_conversation_id text,
  ADD COLUMN IF NOT EXISTS message_type      text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS template_name     text,
  ADD COLUMN IF NOT EXISTS raw_payload       jsonb;

-- Idempotency index: Meta can deliver the same webhook event more than once
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_logs_wa_message_id_idx
  ON public.whatsapp_logs (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- ─── wa_conversations ─────────────────────────────────────────────────────────
-- One row per WhatsApp contact (phone number). Tracks opt-in state and
-- links to a JobLinca user when we can match the number.
CREATE TABLE IF NOT EXISTS public.wa_conversations (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_phone        text        NOT NULL UNIQUE,          -- E.164 number, e.g. +237612345678
  display_name    text,                                 -- from Meta profile
  user_id         uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  opted_in        boolean     NOT NULL DEFAULT false,
  opted_in_at     timestamptz,
  opted_out_at    timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_conversations_user_id_idx  ON public.wa_conversations (user_id);
CREATE INDEX IF NOT EXISTS wa_conversations_wa_phone_idx ON public.wa_conversations (wa_phone);

-- Keep updated_at fresh automatically
CREATE OR REPLACE FUNCTION public.touch_wa_conversations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wa_conversations_updated_at ON public.wa_conversations;
CREATE TRIGGER wa_conversations_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_wa_conversations();

-- ─── wa_statuses ──────────────────────────────────────────────────────────────
-- Delivery / read status events delivered by Meta for outbound messages.
CREATE TABLE IF NOT EXISTS public.wa_statuses (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_message_id   text        NOT NULL,                 -- wamid from Meta
  status          text        NOT NULL,                 -- sent | delivered | read | failed
  timestamp       timestamptz NOT NULL,
  recipient_phone text,
  error_code      int,
  error_title     text,
  raw_payload     jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_statuses_wa_message_id_idx ON public.wa_statuses (wa_message_id);
CREATE INDEX IF NOT EXISTS wa_statuses_created_at_idx    ON public.wa_statuses (created_at DESC);

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_statuses      ENABLE ROW LEVEL SECURITY;

-- Admins read everything
CREATE POLICY "Admins can read wa_conversations"
  ON public.wa_conversations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'super_admin')
  ));

CREATE POLICY "Admins can read wa_statuses"
  ON public.wa_statuses FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'super_admin')
  ));

-- Service role (used by API routes + cron) can do everything
CREATE POLICY "Service role full access to wa_conversations"
  ON public.wa_conversations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to wa_statuses"
  ON public.wa_statuses FOR ALL
  USING (auth.role() = 'service_role');

-- Users can read their own conversation record
CREATE POLICY "Users can read own wa_conversation"
  ON public.wa_conversations FOR SELECT
  USING (user_id = auth.uid());
