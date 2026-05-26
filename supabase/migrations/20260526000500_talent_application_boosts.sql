-- Sprint 4 / A2 + A3 — Quiz-verified application boost + auto-intro
--
-- 1) talent_application_boosts: tokens granted to weekly winners. Each token
--    is consumed when the talent applies with `use_boost: true`.
-- 2) applications.quiz_verified + quiz_verified_meta: marks an application as
--    quiz-backed so the recruiter pipeline can sort and badge it.
-- 3) Widen recruiter_candidate_outreach_events.source check to allow auto-
--    intro events produced by the spotlight cron.

-- ---------------------------------------------------------------------------
-- 1) talent_application_boosts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_application_boosts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_for text NOT NULL,
  source_type text NOT NULL DEFAULT 'weekly_winner'
    CHECK (source_type IN ('weekly_winner', 'manual', 'recruiter_sponsored')),
  source_ref uuid,
  domain text,
  tokens_granted int NOT NULL CHECK (tokens_granted > 0),
  tokens_remaining int NOT NULL CHECK (tokens_remaining >= 0),
  expires_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_application_boosts_remaining_le_granted_chk
    CHECK (tokens_remaining <= tokens_granted),
  CONSTRAINT talent_application_boosts_granted_for_user_uq
    UNIQUE (user_id, granted_for)
);

CREATE INDEX IF NOT EXISTS idx_talent_application_boosts_user_active
  ON public.talent_application_boosts(user_id, expires_at)
  WHERE tokens_remaining > 0;

DROP TRIGGER IF EXISTS trg_talent_application_boosts_updated_at
  ON public.talent_application_boosts;
CREATE TRIGGER trg_talent_application_boosts_updated_at
  BEFORE UPDATE ON public.talent_application_boosts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.talent_application_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "boosts_owner_select" ON public.talent_application_boosts;
CREATE POLICY "boosts_owner_select"
  ON public.talent_application_boosts FOR SELECT
  USING (user_id = auth.uid() OR public.is_active_admin());

DROP POLICY IF EXISTS "boosts_admin_insert" ON public.talent_application_boosts;
CREATE POLICY "boosts_admin_insert"
  ON public.talent_application_boosts FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "boosts_admin_update" ON public.talent_application_boosts;
CREATE POLICY "boosts_admin_update"
  ON public.talent_application_boosts FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "boosts_admin_delete" ON public.talent_application_boosts;
CREATE POLICY "boosts_admin_delete"
  ON public.talent_application_boosts FOR DELETE
  USING (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- 2) applications.quiz_verified + quiz_verified_meta
-- ---------------------------------------------------------------------------

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS quiz_verified boolean NOT NULL DEFAULT false;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS quiz_verified_meta jsonb;

CREATE INDEX IF NOT EXISTS idx_applications_quiz_verified
  ON public.applications(quiz_verified, created_at DESC)
  WHERE quiz_verified = true;

COMMENT ON COLUMN public.applications.quiz_verified IS
  'true when the applicant submitted via a Quiz-Verified Application Boost token.';
COMMENT ON COLUMN public.applications.quiz_verified_meta IS
  'Snapshot of the boost that backed this application: source boost row, week_key, challenge_id, score, etc. Frozen at submission time.';

-- ---------------------------------------------------------------------------
-- 3) Widen recruiter_candidate_outreach_events.source to allow auto-intros
-- ---------------------------------------------------------------------------

ALTER TABLE public.recruiter_candidate_outreach_events
  DROP CONSTRAINT IF EXISTS recruiter_candidate_outreach_events_source_check;

ALTER TABLE public.recruiter_candidate_outreach_events
  ADD CONSTRAINT recruiter_candidate_outreach_events_source_check
    CHECK (source IN ('candidate_search', 'candidate_detail', 'spotlight_auto_intro'));

COMMENT ON COLUMN public.recruiter_candidate_outreach_events.source IS
  'candidate_search | candidate_detail | spotlight_auto_intro. spotlight_auto_intro rows are inserted by the weekly leaderboard cron.';
