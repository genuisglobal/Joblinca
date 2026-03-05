-- WhatsApp Job Agent Phase 1
-- Adds:
-- 1) Public short IDs for jobs (JL-000001 style)
-- 2) WhatsApp lead lifecycle table with monthly counters (GMT+1 reset)
-- 3) WhatsApp talent lead profile table

-- ---------------------------------------------------------------------------
-- 1) Jobs public short ID
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.jobs_public_id_seq START WITH 1000 INCREMENT BY 1;

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS public_id text;

CREATE OR REPLACE FUNCTION public.generate_job_public_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := 'JL-' || lpad(nextval('public.jobs_public_id_seq')::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.jobs j WHERE j.public_id = candidate
    );
  END LOOP;

  RETURN candidate;
END;
$$;

UPDATE public.jobs
SET public_id = public.generate_job_public_id()
WHERE public_id IS NULL;

ALTER TABLE public.jobs
  ALTER COLUMN public_id SET DEFAULT public.generate_job_public_id();

CREATE UNIQUE INDEX IF NOT EXISTS jobs_public_id_uidx
  ON public.jobs(public_id)
  WHERE public_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Helpers for GMT+1 month/week buckets
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wa_month_bucket_gmt_plus_1(p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char((p_now AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM');
$$;

CREATE OR REPLACE FUNCTION public.wa_week_bucket_gmt_plus_1(p_now timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char((p_now AT TIME ZONE 'Africa/Lagos'), 'IYYY-IW');
$$;

-- ---------------------------------------------------------------------------
-- 3) WhatsApp leads
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wa_leads (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  wa_id text,
  phone_e164 text NOT NULL UNIQUE,
  display_name text,
  linked_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  has_website_account boolean NOT NULL DEFAULT false,
  role_selected text CHECK (role_selected IN ('jobseeker', 'recruiter', 'talent')),
  conversation_state text NOT NULL DEFAULT 'idle',
  state_payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Monthly counters for free-tier limits.
  month_bucket text NOT NULL DEFAULT public.wa_month_bucket_gmt_plus_1(now()),
  views_month_count int NOT NULL DEFAULT 0 CHECK (views_month_count >= 0),
  applies_month_count int NOT NULL DEFAULT 0 CHECK (applies_month_count >= 0),

  -- Persist last search context for NEXT pagination.
  last_search_location text,
  last_search_role_keywords text,
  last_search_time_filter text CHECK (last_search_time_filter IN ('24h', '7d', '30d')),
  last_search_offset int NOT NULL DEFAULT 0 CHECK (last_search_offset >= 0),

  -- Pending apply intent for users without website accounts yet.
  pending_apply_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  pending_apply_job_public_id text,

  -- Weekly matched jobs bookkeeping.
  last_matched_jobs_sent_at timestamptz,
  last_matched_jobs_week_key text,

  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_leads_conversation_uidx
  ON public.wa_leads(wa_conversation_id)
  WHERE wa_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_leads_linked_user_idx
  ON public.wa_leads(linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_leads_role_idx
  ON public.wa_leads(role_selected)
  WHERE role_selected IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_leads_seen_idx
  ON public.wa_leads(last_seen_at DESC);

CREATE INDEX IF NOT EXISTS wa_leads_pending_apply_idx
  ON public.wa_leads(pending_apply_job_id)
  WHERE pending_apply_job_id IS NOT NULL;

-- Backfill wa_leads from existing conversations.
INSERT INTO public.wa_leads (
  wa_conversation_id,
  wa_id,
  phone_e164,
  display_name,
  linked_user_id,
  has_website_account,
  last_seen_at
)
SELECT
  c.id,
  regexp_replace(c.wa_phone, '^\+', ''),
  c.wa_phone,
  c.display_name,
  c.user_id,
  (c.user_id IS NOT NULL),
  COALESCE(c.last_inbound_at, now())
FROM public.wa_conversations c
ON CONFLICT (phone_e164) DO UPDATE
SET
  wa_conversation_id = EXCLUDED.wa_conversation_id,
  wa_id = EXCLUDED.wa_id,
  display_name = COALESCE(EXCLUDED.display_name, public.wa_leads.display_name),
  linked_user_id = COALESCE(EXCLUDED.linked_user_id, public.wa_leads.linked_user_id),
  has_website_account = EXCLUDED.has_website_account,
  last_seen_at = GREATEST(public.wa_leads.last_seen_at, EXCLUDED.last_seen_at);

-- ---------------------------------------------------------------------------
-- 4) WhatsApp talent lead profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wa_talent_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_lead_id uuid NOT NULL UNIQUE REFERENCES public.wa_leads(id) ON DELETE CASCADE,
  full_name text,
  institution_name text,
  town text,
  course_or_major text,
  cv_or_projects text,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_talent_profiles_completed_idx
  ON public.wa_talent_profiles(completed, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 5) Updated-at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_leads_updated_at ON public.wa_leads;
CREATE TRIGGER trg_wa_leads_updated_at
  BEFORE UPDATE ON public.wa_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_wa_talent_profiles_updated_at ON public.wa_talent_profiles;
CREATE TRIGGER trg_wa_talent_profiles_updated_at
  BEFORE UPDATE ON public.wa_talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

-- ---------------------------------------------------------------------------
-- 6) RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.wa_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_talent_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access wa_leads" ON public.wa_leads;
CREATE POLICY "Service role full access wa_leads"
  ON public.wa_leads FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access wa_talent_profiles" ON public.wa_talent_profiles;
CREATE POLICY "Service role full access wa_talent_profiles"
  ON public.wa_talent_profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins read wa_leads" ON public.wa_leads;
CREATE POLICY "Admins read wa_leads"
  ON public.wa_leads FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read wa_talent_profiles" ON public.wa_talent_profiles;
CREATE POLICY "Admins read wa_talent_profiles"
  ON public.wa_talent_profiles FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Users read own wa_lead" ON public.wa_leads;
CREATE POLICY "Users read own wa_lead"
  ON public.wa_leads FOR SELECT
  USING (linked_user_id = auth.uid());
