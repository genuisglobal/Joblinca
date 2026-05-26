-- Talent Challenges V2 — Value Layer (Sprint 0)
--
-- 1) Extend talent_challenges with access tier + sponsorship metadata
-- 2) Add talent_challenge_question_refs (AI-suggested + admin-approved
--    "study this if you missed this" links per quiz question)
-- 3) Add talent_spotlights (Top-3-per-domain weekly featured carousel)
-- 4) Document the expected bilingual quiz_question shape inside
--    talent_challenges.config

-- ---------------------------------------------------------------------------
-- 1) talent_challenges: access tier + sponsorship
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_challenges
  ADD COLUMN IF NOT EXISTS access_tier text NOT NULL DEFAULT 'free'
    CHECK (access_tier IN ('free', 'paid'));

ALTER TABLE public.talent_challenges
  ADD COLUMN IF NOT EXISTS is_sponsored boolean NOT NULL DEFAULT false;

ALTER TABLE public.talent_challenges
  ADD COLUMN IF NOT EXISTS sponsor_recruiter_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.talent_challenges
  ADD COLUMN IF NOT EXISTS sponsor_company text;

ALTER TABLE public.talent_challenges
  ADD COLUMN IF NOT EXISTS sponsor_prize_text text;

ALTER TABLE public.talent_challenges
  ADD COLUMN IF NOT EXISTS sponsor_prize_text_fr text;

-- Sponsored challenges must always live behind the paid tier.
ALTER TABLE public.talent_challenges
  DROP CONSTRAINT IF EXISTS talent_challenges_sponsored_requires_paid_chk;
ALTER TABLE public.talent_challenges
  ADD CONSTRAINT talent_challenges_sponsored_requires_paid_chk
    CHECK (NOT is_sponsored OR access_tier = 'paid');

CREATE INDEX IF NOT EXISTS idx_talent_challenges_access_tier
  ON public.talent_challenges(access_tier, status);

CREATE INDEX IF NOT EXISTS idx_talent_challenges_sponsor
  ON public.talent_challenges(sponsor_recruiter_id)
  WHERE sponsor_recruiter_id IS NOT NULL;

COMMENT ON COLUMN public.talent_challenges.access_tier IS
  'free: any authenticated talent can attempt. paid: requires active subscription.';
COMMENT ON COLUMN public.talent_challenges.is_sponsored IS
  'true when a recruiter sponsors this challenge for a guaranteed-interview prize.';
COMMENT ON COLUMN public.talent_challenges.config IS
  'Quiz config jsonb. Expected shape:
   {
     "questions": [
       {
         "id": "q1",                       -- stable identifier; required for refs
         "question": "EN prompt",
         "question_fr": "FR prompt",
         "options": ["a","b","c","d"],
         "options_fr": ["a","b","c","d"],
         "correct_index": 1,
         "explanation": "EN why",
         "explanation_fr": "FR pourquoi"
       }
     ],
     "time_limit_seconds": 600,
     "shuffle_questions": true
   }';

-- ---------------------------------------------------------------------------
-- 2) talent_challenge_question_refs
--    "If you missed question X, study this" — sourced by AI, gated by admin
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_challenge_question_refs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id uuid NOT NULL REFERENCES public.talent_challenges(id) ON DELETE CASCADE,
  question_id text NOT NULL,

  -- One of the following target columns must be populated.
  target_course_id uuid REFERENCES public.learning_courses(id) ON DELETE SET NULL,
  target_module_id uuid REFERENCES public.learning_modules(id) ON DELETE SET NULL,
  external_provider text,
  external_url text,
  external_url_fr text,

  -- Moderation state
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  suggested_by text NOT NULL DEFAULT 'ai'
    CHECK (suggested_by IN ('ai', 'admin')),
  suggested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  confidence numeric(4, 3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  rationale text,
  display_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT talent_question_refs_target_present_chk
    CHECK (
      target_course_id IS NOT NULL
      OR target_module_id IS NOT NULL
      OR external_url IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_question_refs_challenge_question
  ON public.talent_challenge_question_refs(challenge_id, question_id, status);

CREATE INDEX IF NOT EXISTS idx_question_refs_pending_review
  ON public.talent_challenge_question_refs(status, suggested_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_question_refs_updated_at ON public.talent_challenge_question_refs;
CREATE TRIGGER trg_question_refs_updated_at
  BEFORE UPDATE ON public.talent_challenge_question_refs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

-- ---------------------------------------------------------------------------
-- 3) talent_spotlights
--    Featured Talent carousel rows. Cron inserts Top 3 per domain weekly.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_spotlights (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL
    CHECK (source_type IN ('weekly_winner', 'manual', 'recruiter_sponsored')),
  source_ref uuid,
  domain text,
  rank int CHECK (rank IS NULL OR rank > 0),
  week_key text,
  headline text,
  headline_fr text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_spotlights_window_chk CHECK (ends_at > starts_at)
);

-- Prevent duplicates: same source can't produce two spotlights for the same user.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_talent_spotlights_source
  ON public.talent_spotlights(user_id, source_type, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talent_spotlights_active
  ON public.talent_spotlights(domain, ends_at DESC)
  WHERE ends_at > now();

CREATE INDEX IF NOT EXISTS idx_talent_spotlights_user_active
  ON public.talent_spotlights(user_id, ends_at DESC);

-- ---------------------------------------------------------------------------
-- 4) RLS — question refs (admin write, recruiters/talents see approved only)
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_challenge_question_refs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_refs_select" ON public.talent_challenge_question_refs;
CREATE POLICY "question_refs_select"
  ON public.talent_challenge_question_refs FOR SELECT
  USING (
    status = 'approved'
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "question_refs_admin_insert" ON public.talent_challenge_question_refs;
CREATE POLICY "question_refs_admin_insert"
  ON public.talent_challenge_question_refs FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "question_refs_admin_update" ON public.talent_challenge_question_refs;
CREATE POLICY "question_refs_admin_update"
  ON public.talent_challenge_question_refs FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "question_refs_admin_delete" ON public.talent_challenge_question_refs;
CREATE POLICY "question_refs_admin_delete"
  ON public.talent_challenge_question_refs FOR DELETE
  USING (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- 5) RLS — spotlights (public read of active, admin write)
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_spotlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "talent_spotlights_select" ON public.talent_spotlights;
CREATE POLICY "talent_spotlights_select"
  ON public.talent_spotlights FOR SELECT
  USING (
    ends_at > now()
    OR user_id = auth.uid()
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "talent_spotlights_admin_insert" ON public.talent_spotlights;
CREATE POLICY "talent_spotlights_admin_insert"
  ON public.talent_spotlights FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_spotlights_admin_update" ON public.talent_spotlights;
CREATE POLICY "talent_spotlights_admin_update"
  ON public.talent_spotlights FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_spotlights_admin_delete" ON public.talent_spotlights;
CREATE POLICY "talent_spotlights_admin_delete"
  ON public.talent_spotlights FOR DELETE
  USING (public.is_active_admin());
