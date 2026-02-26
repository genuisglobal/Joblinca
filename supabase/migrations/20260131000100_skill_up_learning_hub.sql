-- Migration 20260131000100_skill_up_learning_hub.sql
--
-- Skill Up Microlearning Hub:
-- 1. learning_tracks - top-level groupings
-- 2. learning_courses - courses within tracks
-- 3. learning_modules - individual lessons with quizzes
-- 4. learning_progress - per-user per-module progress
-- 5. learning_streaks - per-user gamification stats
-- 6. profiles alterations for career goals / learning interests

-- ============================================
-- 1. learning_tracks
-- ============================================

CREATE TABLE IF NOT EXISTS public.learning_tracks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  title_fr text,
  description text,
  description_fr text,
  slug text NOT NULL UNIQUE,
  icon text DEFAULT 'book',
  target_roles text[] NOT NULL DEFAULT '{}',
  display_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_tracks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_learning_tracks_slug ON public.learning_tracks(slug);
CREATE INDEX IF NOT EXISTS idx_learning_tracks_order ON public.learning_tracks(display_order);

COMMENT ON TABLE public.learning_tracks IS 'Top-level learning track groupings for the Skill Up hub';
COMMENT ON COLUMN public.learning_tracks.target_roles IS 'Array of roles that can see this track (e.g. job_seeker, talent)';

-- ============================================
-- 2. learning_courses
-- ============================================

CREATE TABLE IF NOT EXISTS public.learning_courses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  track_id uuid NOT NULL REFERENCES public.learning_tracks(id) ON DELETE CASCADE,
  title text NOT NULL,
  title_fr text,
  description text,
  description_fr text,
  slug text NOT NULL UNIQUE,
  difficulty text NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_minutes int NOT NULL DEFAULT 15,
  thumbnail_url text,
  partner_name text,
  partner_url text,
  display_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_courses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_learning_courses_track ON public.learning_courses(track_id);
CREATE INDEX IF NOT EXISTS idx_learning_courses_slug ON public.learning_courses(slug);

COMMENT ON TABLE public.learning_courses IS 'Courses within learning tracks';
COMMENT ON COLUMN public.learning_courses.difficulty IS 'beginner, intermediate, or advanced';
COMMENT ON COLUMN public.learning_courses.partner_name IS 'External partner name (e.g. DataGenius Academy)';

-- ============================================
-- 3. learning_modules
-- ============================================

CREATE TABLE IF NOT EXISTS public.learning_modules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL REFERENCES public.learning_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  title_fr text,
  content_type text NOT NULL DEFAULT 'article' CHECK (content_type IN ('video', 'article', 'external')),
  video_url text,
  article_body text,
  article_body_fr text,
  external_url text,
  duration_minutes int NOT NULL DEFAULT 5,
  quiz_questions jsonb NOT NULL DEFAULT '[]',
  display_order int NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_modules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_learning_modules_course ON public.learning_modules(course_id);

COMMENT ON TABLE public.learning_modules IS 'Individual lessons within courses, with quiz questions';
COMMENT ON COLUMN public.learning_modules.quiz_questions IS 'JSONB array of {question, question_fr, options, options_fr, correct_index, explanation, explanation_fr}';

-- ============================================
-- 4. learning_progress
-- ============================================

CREATE TABLE IF NOT EXISTS public.learning_progress (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.learning_modules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  quiz_score smallint CHECK (quiz_score IS NULL OR (quiz_score >= 0 AND quiz_score <= 100)),
  quiz_answers jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(user_id, module_id)
);

ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON public.learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_module ON public.learning_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_learning_progress_user_status ON public.learning_progress(user_id, status);

COMMENT ON TABLE public.learning_progress IS 'Per-user per-module learning progress';

-- ============================================
-- 5. learning_streaks
-- ============================================

CREATE TABLE IF NOT EXISTS public.learning_streaks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  current_streak int NOT NULL DEFAULT 0,
  longest_streak int NOT NULL DEFAULT 0,
  last_activity_date date,
  total_modules_completed int NOT NULL DEFAULT 0,
  total_courses_completed int NOT NULL DEFAULT 0,
  xp_points int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_streaks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_learning_streaks_user ON public.learning_streaks(user_id);

COMMENT ON TABLE public.learning_streaks IS 'Per-user gamification stats: streaks, XP, completion counts';

-- ============================================
-- 6. Alter profiles table
-- ============================================

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS career_goals text[] DEFAULT '{}';

ALTER TABLE IF EXISTS public.profiles
  ADD COLUMN IF NOT EXISTS learning_interests text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.career_goals IS 'User career goal tags for AI course recommendations';
COMMENT ON COLUMN public.profiles.learning_interests IS 'User learning interest flags (e.g. ai_career_counselor)';

-- ============================================
-- 7. RLS Policies
-- ============================================

-- Tracks: readable by all authenticated users (published only)
CREATE POLICY "learning_tracks_select" ON public.learning_tracks
  FOR SELECT
  USING (published = true);

-- Courses: readable by all authenticated users (published only)
CREATE POLICY "learning_courses_select" ON public.learning_courses
  FOR SELECT
  USING (published = true);

-- Modules: readable by all authenticated users (published only)
CREATE POLICY "learning_modules_select" ON public.learning_modules
  FOR SELECT
  USING (published = true);

-- Progress: users can only see/manage their own
CREATE POLICY "learning_progress_select" ON public.learning_progress
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "learning_progress_insert" ON public.learning_progress
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "learning_progress_update" ON public.learning_progress
  FOR UPDATE
  USING (user_id = auth.uid());

-- Streaks: users can only see/manage their own
CREATE POLICY "learning_streaks_select" ON public.learning_streaks
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "learning_streaks_insert" ON public.learning_streaks
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "learning_streaks_update" ON public.learning_streaks
  FOR UPDATE
  USING (user_id = auth.uid());
