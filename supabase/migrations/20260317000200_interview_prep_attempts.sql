CREATE TABLE IF NOT EXISTS public.interview_prep_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.interview_prep_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  question text,
  user_message text NOT NULL,
  feedback_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_score int NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  model_used text,
  tokens_used int NOT NULL DEFAULT 0 CHECK (tokens_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_prep_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own interview prep attempts" ON public.interview_prep_attempts;
CREATE POLICY "Users can manage own interview prep attempts"
  ON public.interview_prep_attempts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interview_prep_attempts_session_created
  ON public.interview_prep_attempts(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_prep_attempts_application_created
  ON public.interview_prep_attempts(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_prep_attempts_user_created
  ON public.interview_prep_attempts(user_id, created_at DESC);
