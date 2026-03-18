CREATE TABLE IF NOT EXISTS public.interview_prep_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  title text NOT NULL,
  prep_pack jsonb NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_prep_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own interview prep sessions" ON public.interview_prep_sessions;
CREATE POLICY "Users can manage own interview prep sessions"
  ON public.interview_prep_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interview_prep_sessions_user
  ON public.interview_prep_sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_prep_sessions_application
  ON public.interview_prep_sessions(application_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.update_interview_prep_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interview_prep_sessions_updated_at ON public.interview_prep_sessions;
CREATE TRIGGER trg_interview_prep_sessions_updated_at
  BEFORE UPDATE ON public.interview_prep_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_interview_prep_sessions_updated_at();
