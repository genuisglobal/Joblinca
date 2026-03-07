-- Talent Challenges MVP (Phase 1)
-- Adds weekly challenge infrastructure for quiz/project submissions,
-- leaderboard snapshots, and achievement records.

-- Ensure shared updated_at trigger function exists.
CREATE OR REPLACE FUNCTION public.touch_updated_at_generic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1) Core challenge definition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_challenges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  title_fr text,
  description text,
  description_fr text,
  challenge_type text NOT NULL CHECK (challenge_type IN ('quiz', 'project')),
  domain text,
  difficulty text NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  timezone text NOT NULL DEFAULT 'Africa/Douala',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'published')),
  max_ranked_attempts int NOT NULL DEFAULT 1 CHECK (max_ranked_attempts > 0),
  top_n int NOT NULL DEFAULT 10 CHECK (top_n BETWEEN 1 AND 100),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_challenges_time_window_chk CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_talent_challenges_status_time
  ON public.talent_challenges(status, starts_at DESC, ends_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_challenges_domain_status
  ON public.talent_challenges(domain, status);

DROP TRIGGER IF EXISTS trg_talent_challenges_updated_at ON public.talent_challenges;
CREATE TRIGGER trg_talent_challenges_updated_at
  BEFORE UPDATE ON public.talent_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

-- ---------------------------------------------------------------------------
-- 2) Participant submissions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_challenge_submissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id uuid NOT NULL REFERENCES public.talent_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_no int NOT NULL CHECK (attempt_no > 0),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  project_submission jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_score numeric(6,2),
  manual_score numeric(6,2),
  final_score numeric(6,2),
  completion_seconds int,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'graded', 'disqualified')),
  graded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS idx_talent_submissions_challenge_status_score
  ON public.talent_challenge_submissions(challenge_id, status, final_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_talent_submissions_user_created
  ON public.talent_challenge_submissions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_submissions_challenge_user
  ON public.talent_challenge_submissions(challenge_id, user_id);

DROP TRIGGER IF EXISTS trg_talent_challenge_submissions_updated_at ON public.talent_challenge_submissions;
CREATE TRIGGER trg_talent_challenge_submissions_updated_at
  BEFORE UPDATE ON public.talent_challenge_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

-- ---------------------------------------------------------------------------
-- 3) Weekly leaderboard snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_weekly_leaderboards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_key text NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  challenge_id uuid NOT NULL REFERENCES public.talent_challenges(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rank int NOT NULL CHECK (rank > 0),
  score numeric(6,2) NOT NULL,
  tie_breaker numeric(12,2) NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (week_key, challenge_id, user_id),
  UNIQUE (week_key, challenge_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_talent_weekly_leaderboards_week_rank
  ON public.talent_weekly_leaderboards(week_key, rank);

CREATE INDEX IF NOT EXISTS idx_talent_weekly_leaderboards_user
  ON public.talent_weekly_leaderboards(user_id, published_at DESC);

-- ---------------------------------------------------------------------------
-- 4) Achievement records (normalized)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.talent_achievements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_key text NOT NULL,
  title text NOT NULL,
  description text,
  issuer text NOT NULL DEFAULT 'Joblinca',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key)
);

CREATE INDEX IF NOT EXISTS idx_talent_achievements_user_issued
  ON public.talent_achievements(user_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_talent_achievements_source
  ON public.talent_achievements(source_type, issued_at DESC);

-- ---------------------------------------------------------------------------
-- 5) RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_challenge_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_weekly_leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_achievements ENABLE ROW LEVEL SECURITY;

-- talent_challenges
DROP POLICY IF EXISTS "talent_challenges_select" ON public.talent_challenges;
CREATE POLICY "talent_challenges_select"
  ON public.talent_challenges FOR SELECT
  USING (
    status IN ('active', 'closed', 'published')
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "talent_challenges_admin_insert" ON public.talent_challenges;
CREATE POLICY "talent_challenges_admin_insert"
  ON public.talent_challenges FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_challenges_admin_update" ON public.talent_challenges;
CREATE POLICY "talent_challenges_admin_update"
  ON public.talent_challenges FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_challenges_admin_delete" ON public.talent_challenges;
CREATE POLICY "talent_challenges_admin_delete"
  ON public.talent_challenges FOR DELETE
  USING (public.is_active_admin());

-- submissions
DROP POLICY IF EXISTS "talent_submissions_select" ON public.talent_challenge_submissions;
CREATE POLICY "talent_submissions_select"
  ON public.talent_challenge_submissions FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_active_admin()
  );

DROP POLICY IF EXISTS "talent_submissions_insert_own" ON public.talent_challenge_submissions;
CREATE POLICY "talent_submissions_insert_own"
  ON public.talent_challenge_submissions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.talent_challenges c
      WHERE c.id = challenge_id
        AND c.status IN ('active', 'published')
    )
  );

DROP POLICY IF EXISTS "talent_submissions_admin_manage" ON public.talent_challenge_submissions;
CREATE POLICY "talent_submissions_admin_manage"
  ON public.talent_challenge_submissions FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_submissions_admin_delete" ON public.talent_challenge_submissions;
CREATE POLICY "talent_submissions_admin_delete"
  ON public.talent_challenge_submissions FOR DELETE
  USING (public.is_active_admin());

-- weekly leaderboards
DROP POLICY IF EXISTS "talent_weekly_leaderboards_select" ON public.talent_weekly_leaderboards;
CREATE POLICY "talent_weekly_leaderboards_select"
  ON public.talent_weekly_leaderboards FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "talent_weekly_leaderboards_admin_insert" ON public.talent_weekly_leaderboards;
CREATE POLICY "talent_weekly_leaderboards_admin_insert"
  ON public.talent_weekly_leaderboards FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_weekly_leaderboards_admin_update" ON public.talent_weekly_leaderboards;
CREATE POLICY "talent_weekly_leaderboards_admin_update"
  ON public.talent_weekly_leaderboards FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_weekly_leaderboards_admin_delete" ON public.talent_weekly_leaderboards;
CREATE POLICY "talent_weekly_leaderboards_admin_delete"
  ON public.talent_weekly_leaderboards FOR DELETE
  USING (public.is_active_admin());

-- achievements
DROP POLICY IF EXISTS "talent_achievements_select" ON public.talent_achievements;
CREATE POLICY "talent_achievements_select"
  ON public.talent_achievements FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_active_admin()
    OR EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.applicant_id = public.talent_achievements.user_id
        AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "talent_achievements_admin_insert" ON public.talent_achievements;
CREATE POLICY "talent_achievements_admin_insert"
  ON public.talent_achievements FOR INSERT
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_achievements_admin_update" ON public.talent_achievements;
CREATE POLICY "talent_achievements_admin_update"
  ON public.talent_achievements FOR UPDATE
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "talent_achievements_admin_delete" ON public.talent_achievements;
CREATE POLICY "talent_achievements_admin_delete"
  ON public.talent_achievements FOR DELETE
  USING (public.is_active_admin());
