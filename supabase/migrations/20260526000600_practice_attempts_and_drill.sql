-- Sprint 5 / C1 + C2 — Adaptive practice + daily WhatsApp drill
--
-- 1) talent_practice_attempts — one row per question attempt outside of
--    ranked challenge submissions. Drives spaced repetition.
-- 2) daily_drill_subscriptions — opt-in to a daily WhatsApp drill per domain.
-- 3) daily_drill_dispatches — one row per question sent over WhatsApp so the
--    inbound webhook can map an "A/B/C/D" reply back to the question.

-- ---------------------------------------------------------------------------
-- 1) talent_practice_attempts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_practice_attempts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.talent_challenges(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  domain text,
  was_correct boolean NOT NULL,
  source text NOT NULL DEFAULT 'practice'
    CHECK (source IN ('practice', 'daily_drill')),
  answer_index int,
  correct_index int,
  consecutive_correct int NOT NULL DEFAULT 0,
  interval_days int NOT NULL DEFAULT 1,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  next_due_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_question
  ON public.talent_practice_attempts(user_id, question_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_next_due
  ON public.talent_practice_attempts(user_id, next_due_at);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_domain_due
  ON public.talent_practice_attempts(domain, next_due_at);

ALTER TABLE public.talent_practice_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_attempts_owner_select"
  ON public.talent_practice_attempts;
CREATE POLICY "practice_attempts_owner_select"
  ON public.talent_practice_attempts FOR SELECT
  USING (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS "practice_attempts_owner_insert"
  ON public.talent_practice_attempts;
CREATE POLICY "practice_attempts_owner_insert"
  ON public.talent_practice_attempts FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_active_admin());

-- ---------------------------------------------------------------------------
-- 2) daily_drill_subscriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_drill_subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  phone_e164 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_daily_drill_subscriptions_active
  ON public.daily_drill_subscriptions(domain, active)
  WHERE active = true;

DROP TRIGGER IF EXISTS trg_daily_drill_subscriptions_updated_at
  ON public.daily_drill_subscriptions;
CREATE TRIGGER trg_daily_drill_subscriptions_updated_at
  BEFORE UPDATE ON public.daily_drill_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.daily_drill_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drill_subs_owner_all" ON public.daily_drill_subscriptions;
CREATE POLICY "drill_subs_owner_all"
  ON public.daily_drill_subscriptions FOR ALL
  USING (user_id = auth.uid() OR public.is_active_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_active_admin());

-- ---------------------------------------------------------------------------
-- 3) daily_drill_dispatches
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.daily_drill_dispatches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.daily_drill_subscriptions(id) ON DELETE SET NULL,
  challenge_id uuid NOT NULL REFERENCES public.talent_challenges(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  domain text,
  options jsonb NOT NULL,
  correct_index int NOT NULL,
  phone_e164 text NOT NULL,
  delivery_channel text NOT NULL DEFAULT 'whatsapp_template'
    CHECK (delivery_channel IN ('whatsapp_template', 'whatsapp_text')),
  send_status text NOT NULL DEFAULT 'sent'
    CHECK (send_status IN ('sent', 'failed')),
  send_error text,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  practice_attempt_id uuid REFERENCES public.talent_practice_attempts(id) ON DELETE SET NULL,
  drill_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Douala')::date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, drill_date, domain)
);

CREATE INDEX IF NOT EXISTS idx_drill_dispatches_phone_unanswered
  ON public.daily_drill_dispatches(phone_e164, dispatched_at DESC)
  WHERE answered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drill_dispatches_user
  ON public.daily_drill_dispatches(user_id, dispatched_at DESC);

ALTER TABLE public.daily_drill_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drill_dispatches_owner_select"
  ON public.daily_drill_dispatches;
CREATE POLICY "drill_dispatches_owner_select"
  ON public.daily_drill_dispatches FOR SELECT
  USING (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS "drill_dispatches_admin_insert"
  ON public.daily_drill_dispatches;
CREATE POLICY "drill_dispatches_admin_insert"
  ON public.daily_drill_dispatches FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "drill_dispatches_admin_update"
  ON public.daily_drill_dispatches;
CREATE POLICY "drill_dispatches_admin_update"
  ON public.daily_drill_dispatches FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

COMMENT ON COLUMN public.daily_drill_dispatches.drill_date IS
  'The Africa/Douala date the drill is scheduled for. Combined with (user_id, domain) it enforces one drill per day per domain.';
