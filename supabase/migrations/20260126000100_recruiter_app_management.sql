-- Migration 20260126000100_recruiter_app_management.sql
--
-- This migration adds comprehensive recruiter application management features:
-- 1. Application notes and ratings
-- 2. Application tags
-- 3. Activity/audit log for applications
-- 4. Review mode settings per job
-- 5. Application ranking scores
-- 6. AI insights storage

-- ============================================
-- 1. Add recruiter-specific fields to applications
-- ============================================

-- Internal recruiter rating (1-5 stars)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS recruiter_rating smallint CHECK (recruiter_rating IS NULL OR (recruiter_rating >= 1 AND recruiter_rating <= 5));

-- Recruiter tags (array of strings)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Whether application has been viewed by recruiter
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

-- Pinned for review (manual override to include in any review mode)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;

-- Force hidden (manual override to exclude from review)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

-- Ranking score (computed, used for sorting)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS ranking_score numeric DEFAULT 0;

-- Ranking breakdown (how score was computed)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS ranking_breakdown jsonb DEFAULT '{}';

-- When the application was reviewed (stage changed from submitted)
ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

COMMENT ON COLUMN public.applications.recruiter_rating IS 'Internal rating 1-5 stars given by recruiter';
COMMENT ON COLUMN public.applications.tags IS 'Array of tag strings for organizing applications';
COMMENT ON COLUMN public.applications.viewed_at IS 'When recruiter first viewed this application';
COMMENT ON COLUMN public.applications.is_pinned IS 'Manually pinned to always show in review modes';
COMMENT ON COLUMN public.applications.is_hidden IS 'Manually hidden from all review modes';
COMMENT ON COLUMN public.applications.ranking_score IS 'Computed ranking score for sorting';
COMMENT ON COLUMN public.applications.ranking_breakdown IS 'JSON breakdown of ranking score components';
COMMENT ON COLUMN public.applications.reviewed_at IS 'When application was first reviewed (moved from submitted)';

-- Index for ranking queries
CREATE INDEX IF NOT EXISTS idx_applications_ranking ON public.applications(job_id, ranking_score DESC);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(job_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_viewed ON public.applications(job_id, viewed_at) WHERE viewed_at IS NULL;

-- ============================================
-- 2. Create application_notes table
-- ============================================

CREATE TABLE IF NOT EXISTS public.application_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_private boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_application_notes_app ON public.application_notes(application_id);
CREATE INDEX IF NOT EXISTS idx_application_notes_recruiter ON public.application_notes(recruiter_id);

COMMENT ON TABLE public.application_notes IS 'Internal notes added by recruiters on applications';
COMMENT ON COLUMN public.application_notes.is_private IS 'If true, only the note author can see it (for team scenarios)';

-- ============================================
-- 3. Create application_activity table
-- ============================================

CREATE TABLE IF NOT EXISTS public.application_activity (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'created',
    'status_changed',
    'note_added',
    'rating_changed',
    'tag_added',
    'tag_removed',
    'viewed',
    'pinned',
    'unpinned',
    'hidden',
    'unhidden',
    'ai_analyzed'
  )),
  old_value text,
  new_value text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.application_activity ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_application_activity_app ON public.application_activity(application_id);
CREATE INDEX IF NOT EXISTS idx_application_activity_created ON public.application_activity(created_at DESC);

COMMENT ON TABLE public.application_activity IS 'Audit log of all actions on applications';

-- ============================================
-- 4. Create job_review_settings table
-- ============================================

CREATE TYPE review_mode_enum AS ENUM (
  'all',
  'top_n',
  'top_percent',
  'must_have',
  'daily_batch'
);

CREATE TABLE IF NOT EXISTS public.job_review_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE UNIQUE,
  review_mode review_mode_enum NOT NULL DEFAULT 'all',
  top_n_value int CHECK (top_n_value IS NULL OR top_n_value > 0),
  top_percent_value int CHECK (top_percent_value IS NULL OR (top_percent_value > 0 AND top_percent_value <= 100)),
  daily_batch_size int CHECK (daily_batch_size IS NULL OR daily_batch_size > 0),
  must_have_rules jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_review_settings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.job_review_settings IS 'Review mode settings per job';
COMMENT ON COLUMN public.job_review_settings.review_mode IS 'Current review mode: all, top_n, top_percent, must_have, daily_batch';
COMMENT ON COLUMN public.job_review_settings.must_have_rules IS 'JSON rules like {min_experience: 2, required_skills: ["Excel"], location: "Douala"}';

-- ============================================
-- 5. Create ai_application_insights table
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_application_insights (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE UNIQUE,

  -- Parsed profile data
  parsed_profile jsonb DEFAULT '{}',

  -- Match analysis
  match_score smallint CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 100)),
  strengths text[] DEFAULT '{}',
  gaps text[] DEFAULT '{}',
  reasoning text,

  -- Processing metadata
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retry')),
  error_message text,
  model_used text,
  tokens_used int,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.ai_application_insights ENABLE ROW LEVEL SECURITY;

-- Index
CREATE INDEX IF NOT EXISTS idx_ai_insights_status ON public.ai_application_insights(status) WHERE status != 'completed';

COMMENT ON TABLE public.ai_application_insights IS 'Cached AI analysis results for applications';
COMMENT ON COLUMN public.ai_application_insights.parsed_profile IS 'Structured data: {skills: [], experience: [], education: [], location: "", links: {}}';
COMMENT ON COLUMN public.ai_application_insights.match_score IS 'AI-computed match score 0-100';
COMMENT ON COLUMN public.ai_application_insights.strengths IS 'Array of strength bullet points';
COMMENT ON COLUMN public.ai_application_insights.gaps IS 'Array of gap/risk bullet points';
COMMENT ON COLUMN public.ai_application_insights.reasoning IS 'Short paragraph explaining the match assessment';

-- ============================================
-- 6. RLS Policies
-- ============================================

-- Application notes: recruiters can manage notes on applications for their jobs
CREATE POLICY "application_notes_recruiter_select" ON public.application_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "application_notes_recruiter_insert" ON public.application_notes
  FOR INSERT
  WITH CHECK (
    recruiter_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "application_notes_recruiter_update" ON public.application_notes
  FOR UPDATE
  USING (recruiter_id = auth.uid());

CREATE POLICY "application_notes_recruiter_delete" ON public.application_notes
  FOR DELETE
  USING (recruiter_id = auth.uid());

-- Application activity: recruiters can view activity for their job applications
CREATE POLICY "application_activity_recruiter_select" ON public.application_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "application_activity_insert" ON public.application_activity
  FOR INSERT
  WITH CHECK (actor_id = auth.uid());

-- Job review settings: recruiters manage settings for their jobs
CREATE POLICY "job_review_settings_recruiter_select" ON public.job_review_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "job_review_settings_recruiter_insert" ON public.job_review_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

CREATE POLICY "job_review_settings_recruiter_update" ON public.job_review_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

-- AI insights: recruiters can view insights for their job applications
CREATE POLICY "ai_insights_recruiter_select" ON public.ai_application_insights
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id AND j.recruiter_id = auth.uid()
    )
  );

-- Only system (service role) can insert/update AI insights
-- We don't add insert/update policies here - they'll use service role

-- ============================================
-- 7. Allow recruiters to update applications they have access to
-- ============================================

-- Drop existing policy if it exists and create new one
DROP POLICY IF EXISTS "Recruiter update applications for their jobs" ON public.applications;

CREATE POLICY "Recruiter update applications for their jobs" ON public.applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

-- ============================================
-- 8. Helper functions
-- ============================================

-- Function to log application activity
CREATE OR REPLACE FUNCTION public.log_application_activity(
  p_application_id uuid,
  p_actor_id uuid,
  p_action text,
  p_old_value text DEFAULT NULL,
  p_new_value text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.application_activity (
    application_id, actor_id, action, old_value, new_value, metadata
  ) VALUES (
    p_application_id, p_actor_id, p_action, p_old_value, p_new_value, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Function to compute basic ranking score (can be enhanced)
CREATE OR REPLACE FUNCTION public.compute_application_ranking(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app RECORD;
  v_job RECORD;
  v_ai RECORD;
  v_score numeric := 0;
  v_breakdown jsonb := '{}';
BEGIN
  -- Get application
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Get job
  SELECT * INTO v_job FROM public.jobs WHERE id = v_app.job_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Get AI insights if available
  SELECT * INTO v_ai FROM public.ai_application_insights
  WHERE application_id = p_application_id AND status = 'completed';

  -- Base score components

  -- 1. Recency bonus (max 20 points, decreases over time)
  v_breakdown := v_breakdown || jsonb_build_object(
    'recency', GREATEST(0, 20 - EXTRACT(DAY FROM (now() - v_app.created_at)))
  );
  v_score := v_score + (v_breakdown->>'recency')::numeric;

  -- 2. Profile completeness (max 20 points)
  v_breakdown := v_breakdown || jsonb_build_object(
    'completeness',
    CASE
      WHEN v_app.resume_url IS NOT NULL AND v_app.cover_letter IS NOT NULL THEN 20
      WHEN v_app.resume_url IS NOT NULL OR v_app.cover_letter IS NOT NULL THEN 10
      ELSE 0
    END
  );
  v_score := v_score + (v_breakdown->>'completeness')::numeric;

  -- 3. AI match score (max 50 points)
  IF v_ai.match_score IS NOT NULL THEN
    v_breakdown := v_breakdown || jsonb_build_object(
      'ai_match', (v_ai.match_score * 0.5)::numeric
    );
    v_score := v_score + (v_breakdown->>'ai_match')::numeric;
  ELSE
    v_breakdown := v_breakdown || jsonb_build_object('ai_match', 0);
  END IF;

  -- 4. Recruiter rating bonus (max 10 points)
  IF v_app.recruiter_rating IS NOT NULL THEN
    v_breakdown := v_breakdown || jsonb_build_object(
      'rating', (v_app.recruiter_rating * 2)::numeric
    );
    v_score := v_score + (v_breakdown->>'rating')::numeric;
  ELSE
    v_breakdown := v_breakdown || jsonb_build_object('rating', 0);
  END IF;

  -- Update application
  UPDATE public.applications
  SET ranking_score = v_score, ranking_breakdown = v_breakdown
  WHERE id = p_application_id;
END;
$$;

COMMENT ON FUNCTION public.log_application_activity IS 'Logs an activity entry for an application';
COMMENT ON FUNCTION public.compute_application_ranking IS 'Computes and updates the ranking score for an application';

-- ============================================
-- 9. Trigger to compute ranking on insert/update
-- ============================================

CREATE OR REPLACE FUNCTION public.trigger_compute_ranking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Compute ranking asynchronously (for now, sync)
  PERFORM public.compute_application_ranking(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS applications_compute_ranking ON public.applications;

CREATE TRIGGER applications_compute_ranking
  AFTER INSERT OR UPDATE OF recruiter_rating, resume_url, cover_letter
  ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_compute_ranking();

-- ============================================
-- 10. Compute initial rankings for existing applications
-- ============================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.applications LOOP
    PERFORM public.compute_application_ranking(r.id);
  END LOOP;
END;
$$;
