-- Career Counselor & Skill Mapping Migration
-- Adds AI career counselor sessions, partner courses, skill category tagging

-- =============================================================================
-- 1. career_counselor_sessions — stores AI chat conversations
-- =============================================================================
CREATE TABLE IF NOT EXISTS career_counselor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New Conversation',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  context_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE career_counselor_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own counselor sessions"
  ON career_counselor_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_counselor_sessions_user ON career_counselor_sessions(user_id);
CREATE INDEX idx_counselor_sessions_updated ON career_counselor_sessions(updated_at DESC);

-- =============================================================================
-- 2. partner_courses — external partner course catalog
-- =============================================================================
CREATE TABLE IF NOT EXISTS partner_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name text NOT NULL,
  title text NOT NULL,
  title_fr text,
  description text,
  description_fr text,
  url text NOT NULL,
  duration_minutes int,
  level text CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  cost_type text CHECK (cost_type IN ('free', 'paid', 'freemium')),
  category text,
  referral_url text,
  featured boolean NOT NULL DEFAULT false,
  referral_clicks int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partner_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view partner courses"
  ON partner_courses
  FOR SELECT
  TO authenticated
  USING (true);

-- Admin-only insert/update (service role bypasses RLS)

CREATE INDEX idx_partner_courses_category ON partner_courses(category);
CREATE INDEX idx_partner_courses_featured ON partner_courses(featured) WHERE featured = true;

-- =============================================================================
-- 3. Column additions to existing tables
-- =============================================================================

-- Tag courses with skill categories for gap matching
ALTER TABLE learning_courses
  ADD COLUMN IF NOT EXISTS skill_categories text[] DEFAULT '{}';

CREATE INDEX idx_learning_courses_skill_categories
  ON learning_courses USING GIN (skill_categories);

-- Fix: existing code writes metadata to user_badges but column may be missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_badges' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE user_badges ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- =============================================================================
-- 4. Recruiter badge visibility RLS
-- =============================================================================
-- Recruiters can see badges of applicants who applied to their jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'recruiter_view_applicant_badges'
      AND tablename = 'user_badges'
  ) THEN
    CREATE POLICY recruiter_view_applicant_badges
      ON user_badges
      FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM applications a
          JOIN jobs j ON j.id = a.job_id
          WHERE a.applicant_id = user_badges.user_id
            AND j.recruiter_id = auth.uid()
        )
      );
  END IF;
END $$;

-- =============================================================================
-- 5. Auto-update updated_at trigger for counselor sessions
-- =============================================================================
CREATE OR REPLACE FUNCTION update_counselor_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_counselor_session_updated_at ON career_counselor_sessions;
CREATE TRIGGER trg_counselor_session_updated_at
  BEFORE UPDATE ON career_counselor_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_counselor_session_updated_at();
