-- WhatsApp Recruiter Phase 1
-- Screening state machine persistence, scoring records, and recruiter notifications

-- ---------------------------------------------------------------------------
-- 1) Screening sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_screening_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  wa_conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  wa_phone text NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  recruiter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  entry_source text NOT NULL DEFAULT 'unknown'
    CHECK (entry_source IN ('reply', 'apply_command', 'shortlink', 'unknown')),
  language_code text NOT NULL DEFAULT 'en'
    CHECK (language_code IN ('en', 'fr')),
  state text NOT NULL DEFAULT 'idle'
    CHECK (state IN (
      'idle',
      'awaiting_language',
      'awaiting_job_reference',
      'awaiting_consent',
      'awaiting_question',
      'completed',
      'quota_blocked',
      'cancelled'
    )),

  question_catalog jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_question_index int NOT NULL DEFAULT 0 CHECK (current_question_index >= 0),
  total_questions int NOT NULL DEFAULT 0 CHECK (total_questions >= 0),

  must_have_passed boolean,
  weighted_score int CHECK (weighted_score IS NULL OR (weighted_score >= 0 AND weighted_score <= 100)),
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  must_have_fail_reasons text[] NOT NULL DEFAULT '{}',
  result_label text CHECK (result_label IS NULL OR result_label IN ('qualified', 'review', 'reject')),

  -- Quota metadata captured at completion time
  daily_limit int NOT NULL DEFAULT 1 CHECK (daily_limit >= 1),
  daily_count_at_completion int CHECK (daily_count_at_completion IS NULL OR daily_count_at_completion >= 0),

  session_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_inbound_at timestamptz,
  last_inbound_message_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One WhatsApp session per phone/job/day to avoid duplicates and noisy retries.
CREATE UNIQUE INDEX IF NOT EXISTS wa_screening_sessions_phone_job_day_uidx
  ON public.wa_screening_sessions (wa_phone, job_id, session_day)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_screening_sessions_recruiter_idx
  ON public.wa_screening_sessions (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wa_screening_sessions_user_idx
  ON public.wa_screening_sessions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wa_screening_sessions_state_idx
  ON public.wa_screening_sessions (state, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2) Screening answers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_screening_answers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.wa_screening_sessions(id) ON DELETE CASCADE,
  question_key text NOT NULL,
  question_text text NOT NULL,
  answer_text text NOT NULL,
  normalized_answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_required boolean NOT NULL DEFAULT true,
  is_must_have boolean NOT NULL DEFAULT false,
  must_have_passed boolean,
  score_delta int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_screening_answers_session_question_uidx
  ON public.wa_screening_answers (session_id, question_key);

CREATE INDEX IF NOT EXISTS wa_screening_answers_session_idx
  ON public.wa_screening_answers (session_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- 3) Screening events (state transition + idempotency tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_screening_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.wa_screening_sessions(id) ON DELETE CASCADE,
  wa_message_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'system')),
  event_type text NOT NULL,
  state_before text,
  state_after text,
  message_text text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_screening_events_inbound_wa_message_uidx
  ON public.wa_screening_events (wa_message_id)
  WHERE direction = 'inbound' AND wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wa_screening_events_session_idx
  ON public.wa_screening_events (session_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- 4) Recruiter notification queue/log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_screening_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.wa_screening_sessions(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('dashboard', 'email', 'whatsapp')),
  destination text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count int NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_screening_notifications_recruiter_idx
  ON public.wa_screening_notifications (recruiter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS wa_screening_notifications_status_idx
  ON public.wa_screening_notifications (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5) Timestamp triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_wa_screening_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_screening_sessions_updated_at ON public.wa_screening_sessions;
CREATE TRIGGER trg_wa_screening_sessions_updated_at
  BEFORE UPDATE ON public.wa_screening_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_wa_screening_updated_at();

DROP TRIGGER IF EXISTS trg_wa_screening_notifications_updated_at ON public.wa_screening_notifications;
CREATE TRIGGER trg_wa_screening_notifications_updated_at
  BEFORE UPDATE ON public.wa_screening_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_wa_screening_updated_at();

-- ---------------------------------------------------------------------------
-- 6) Quota helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wa_user_daily_apply_limit(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  has_paid boolean := false;
BEGIN
  -- Unmatched WhatsApp users are treated as free tier.
  IF p_user_id IS NULL THEN
    RETURN 1;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.pricing_plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND (s.end_date IS NULL OR s.end_date >= current_date)
      AND p.role IN ('job_seeker', 'talent')
      AND p.is_active = true
  ) INTO has_paid;

  IF has_paid THEN
    RETURN 10;
  END IF;

  RETURN 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.wa_user_daily_apply_count(
  p_user_id uuid,
  p_wa_phone text,
  p_day date DEFAULT ((now() AT TIME ZONE 'utc')::date)
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT count(*)::int
  FROM public.wa_screening_sessions s
  WHERE s.session_day = p_day
    AND s.state = 'completed'
    AND (
      (p_user_id IS NOT NULL AND s.user_id = p_user_id)
      OR
      (p_user_id IS NULL AND s.user_id IS NULL AND s.wa_phone = p_wa_phone)
    );
$$;

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.wa_screening_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_screening_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_screening_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_screening_notifications ENABLE ROW LEVEL SECURITY;

-- Service role full access (webhook + server processing)
CREATE POLICY "Service role full access wa_screening_sessions"
  ON public.wa_screening_sessions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access wa_screening_answers"
  ON public.wa_screening_answers FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access wa_screening_events"
  ON public.wa_screening_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access wa_screening_notifications"
  ON public.wa_screening_notifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Recruiters can read their own screening sessions.
CREATE POLICY "Recruiters read own wa_screening_sessions"
  ON public.wa_screening_sessions FOR SELECT
  USING (recruiter_id = auth.uid());

CREATE POLICY "Recruiters read own wa_screening_answers"
  ON public.wa_screening_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.wa_screening_sessions s
      WHERE s.id = session_id
        AND s.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "Recruiters read own wa_screening_events"
  ON public.wa_screening_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.wa_screening_sessions s
      WHERE s.id = session_id
        AND s.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "Recruiters read own wa_screening_notifications"
  ON public.wa_screening_notifications FOR SELECT
  USING (recruiter_id = auth.uid());

-- Active admins can read everything.
CREATE POLICY "Admins read wa_screening_sessions"
  ON public.wa_screening_sessions FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read wa_screening_answers"
  ON public.wa_screening_answers FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read wa_screening_events"
  ON public.wa_screening_events FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read wa_screening_notifications"
  ON public.wa_screening_notifications FOR SELECT
  USING (public.is_active_admin());

