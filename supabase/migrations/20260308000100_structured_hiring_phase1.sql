-- Structured hiring phase 1
-- Adds per-job hiring pipelines, stage movement history, scorecards, and
-- stage feedback while keeping the existing applications.status field usable.

CREATE TABLE IF NOT EXISTS public.hiring_pipeline_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hiring_pipeline_template_stages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL REFERENCES public.hiring_pipeline_templates(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  label text NOT NULL,
  stage_type text NOT NULL CHECK (stage_type IN ('applied', 'screening', 'review', 'interview', 'offer', 'hire', 'rejected')),
  order_index integer NOT NULL CHECK (order_index > 0),
  score_weight numeric NOT NULL DEFAULT 1 CHECK (score_weight >= 0),
  is_terminal boolean NOT NULL DEFAULT false,
  allows_feedback boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, stage_key),
  UNIQUE(template_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.job_hiring_pipelines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE UNIQUE,
  template_id uuid REFERENCES public.hiring_pipeline_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_hiring_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_pipeline_id uuid NOT NULL REFERENCES public.job_hiring_pipelines(id) ON DELETE CASCADE,
  source_template_stage_id uuid REFERENCES public.hiring_pipeline_template_stages(id) ON DELETE SET NULL,
  stage_key text NOT NULL,
  label text NOT NULL,
  stage_type text NOT NULL CHECK (stage_type IN ('applied', 'screening', 'review', 'interview', 'offer', 'hire', 'rejected')),
  order_index integer NOT NULL CHECK (order_index > 0),
  score_weight numeric NOT NULL DEFAULT 1 CHECK (score_weight >= 0),
  is_terminal boolean NOT NULL DEFAULT false,
  allows_feedback boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_pipeline_id, stage_key),
  UNIQUE(job_pipeline_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.application_stage_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_stage_id uuid REFERENCES public.job_hiring_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES public.job_hiring_pipeline_stages(id) ON DELETE RESTRICT,
  transition_reason text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_scorecards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_pipeline_stage_id uuid NOT NULL REFERENCES public.job_hiring_pipeline_stages(id) ON DELETE CASCADE,
  name text NOT NULL,
  instructions text,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_pipeline_stage_id, name)
);

CREATE TABLE IF NOT EXISTS public.application_stage_feedback (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_pipeline_stage_id uuid NOT NULL REFERENCES public.job_hiring_pipeline_stages(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  interview_scorecard_id uuid REFERENCES public.interview_scorecards(id) ON DELETE SET NULL,
  score numeric NOT NULL DEFAULT 0,
  recommendation text CHECK (recommendation IN ('strong_yes', 'yes', 'mixed', 'no', 'strong_no')),
  summary text,
  feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_hiring_requirements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE UNIQUE,
  must_have_skills text[] NOT NULL DEFAULT '{}',
  nice_to_have_skills text[] NOT NULL DEFAULT '{}',
  required_languages text[] NOT NULL DEFAULT '{}',
  education_requirements text[] NOT NULL DEFAULT '{}',
  min_years_experience numeric,
  location_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  screening_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS current_stage_id uuid REFERENCES public.job_hiring_pipeline_stages(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS decision_status text NOT NULL DEFAULT 'active'
    CHECK (decision_status IN ('active', 'hired', 'rejected', 'withdrawn'));

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS disposition_reason text;

ALTER TABLE IF EXISTS public.applications
  ADD COLUMN IF NOT EXISTS overall_stage_score numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS hiring_pipeline_template_stages_template_idx
  ON public.hiring_pipeline_template_stages(template_id, order_index);

CREATE INDEX IF NOT EXISTS job_hiring_pipeline_stages_pipeline_idx
  ON public.job_hiring_pipeline_stages(job_pipeline_id, order_index);

CREATE INDEX IF NOT EXISTS application_stage_events_application_idx
  ON public.application_stage_events(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS application_stage_events_stage_idx
  ON public.application_stage_events(to_stage_id, created_at DESC);

CREATE INDEX IF NOT EXISTS application_stage_feedback_application_idx
  ON public.application_stage_feedback(application_id, created_at DESC);

CREATE INDEX IF NOT EXISTS application_stage_feedback_stage_idx
  ON public.application_stage_feedback(job_pipeline_stage_id, created_at DESC);

CREATE INDEX IF NOT EXISTS applications_current_stage_idx
  ON public.applications(current_stage_id, stage_entered_at DESC);

CREATE INDEX IF NOT EXISTS applications_decision_status_idx
  ON public.applications(job_id, decision_status, created_at DESC);

DROP TRIGGER IF EXISTS trg_hiring_pipeline_templates_updated_at ON public.hiring_pipeline_templates;
CREATE TRIGGER trg_hiring_pipeline_templates_updated_at
  BEFORE UPDATE ON public.hiring_pipeline_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_hiring_pipeline_template_stages_updated_at ON public.hiring_pipeline_template_stages;
CREATE TRIGGER trg_hiring_pipeline_template_stages_updated_at
  BEFORE UPDATE ON public.hiring_pipeline_template_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_job_hiring_pipelines_updated_at ON public.job_hiring_pipelines;
CREATE TRIGGER trg_job_hiring_pipelines_updated_at
  BEFORE UPDATE ON public.job_hiring_pipelines
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_job_hiring_pipeline_stages_updated_at ON public.job_hiring_pipeline_stages;
CREATE TRIGGER trg_job_hiring_pipeline_stages_updated_at
  BEFORE UPDATE ON public.job_hiring_pipeline_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_interview_scorecards_updated_at ON public.interview_scorecards;
CREATE TRIGGER trg_interview_scorecards_updated_at
  BEFORE UPDATE ON public.interview_scorecards
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_application_stage_feedback_updated_at ON public.application_stage_feedback;
CREATE TRIGGER trg_application_stage_feedback_updated_at
  BEFORE UPDATE ON public.application_stage_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_job_hiring_requirements_updated_at ON public.job_hiring_requirements;
CREATE TRIGGER trg_job_hiring_requirements_updated_at
  BEFORE UPDATE ON public.job_hiring_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.hiring_pipeline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hiring_pipeline_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_hiring_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_hiring_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_stage_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_hiring_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access hiring_pipeline_templates" ON public.hiring_pipeline_templates;
CREATE POLICY "Service role full access hiring_pipeline_templates"
  ON public.hiring_pipeline_templates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access hiring_pipeline_template_stages" ON public.hiring_pipeline_template_stages;
CREATE POLICY "Service role full access hiring_pipeline_template_stages"
  ON public.hiring_pipeline_template_stages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access job_hiring_pipelines" ON public.job_hiring_pipelines;
CREATE POLICY "Service role full access job_hiring_pipelines"
  ON public.job_hiring_pipelines
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access job_hiring_pipeline_stages" ON public.job_hiring_pipeline_stages;
CREATE POLICY "Service role full access job_hiring_pipeline_stages"
  ON public.job_hiring_pipeline_stages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access application_stage_events" ON public.application_stage_events;
CREATE POLICY "Service role full access application_stage_events"
  ON public.application_stage_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access interview_scorecards" ON public.interview_scorecards;
CREATE POLICY "Service role full access interview_scorecards"
  ON public.interview_scorecards
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access application_stage_feedback" ON public.application_stage_feedback;
CREATE POLICY "Service role full access application_stage_feedback"
  ON public.application_stage_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access job_hiring_requirements" ON public.job_hiring_requirements;
CREATE POLICY "Service role full access job_hiring_requirements"
  ON public.job_hiring_requirements
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins read structured hiring templates" ON public.hiring_pipeline_templates;
CREATE POLICY "Admins read structured hiring templates"
  ON public.hiring_pipeline_templates
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read structured hiring template stages" ON public.hiring_pipeline_template_stages;
CREATE POLICY "Admins read structured hiring template stages"
  ON public.hiring_pipeline_template_stages
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read job hiring pipelines" ON public.job_hiring_pipelines;
CREATE POLICY "Admins read job hiring pipelines"
  ON public.job_hiring_pipelines
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read job hiring pipeline stages" ON public.job_hiring_pipeline_stages;
CREATE POLICY "Admins read job hiring pipeline stages"
  ON public.job_hiring_pipeline_stages
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read application stage events" ON public.application_stage_events;
CREATE POLICY "Admins read application stage events"
  ON public.application_stage_events
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read interview scorecards" ON public.interview_scorecards;
CREATE POLICY "Admins read interview scorecards"
  ON public.interview_scorecards
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read application stage feedback" ON public.application_stage_feedback;
CREATE POLICY "Admins read application stage feedback"
  ON public.application_stage_feedback
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins read job hiring requirements" ON public.job_hiring_requirements;
CREATE POLICY "Admins read job hiring requirements"
  ON public.job_hiring_requirements
  FOR SELECT
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "Recruiters read own job hiring pipelines" ON public.job_hiring_pipelines;
CREATE POLICY "Recruiters read own job hiring pipelines"
  ON public.job_hiring_pipelines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recruiters read own job hiring pipeline stages" ON public.job_hiring_pipeline_stages;
CREATE POLICY "Recruiters read own job hiring pipeline stages"
  ON public.job_hiring_pipeline_stages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_hiring_pipelines p
      JOIN public.jobs j ON j.id = p.job_id
      WHERE p.id = job_pipeline_id AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recruiters read own application stage events" ON public.application_stage_events;
CREATE POLICY "Recruiters read own application stage events"
  ON public.application_stage_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recruiters read own interview scorecards" ON public.interview_scorecards;
CREATE POLICY "Recruiters read own interview scorecards"
  ON public.interview_scorecards
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_hiring_pipeline_stages s
      JOIN public.job_hiring_pipelines p ON p.id = s.job_pipeline_id
      JOIN public.jobs j ON j.id = p.job_id
      WHERE s.id = job_pipeline_stage_id AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recruiters read own application stage feedback" ON public.application_stage_feedback;
CREATE POLICY "Recruiters read own application stage feedback"
  ON public.application_stage_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.jobs j ON j.id = a.job_id
      WHERE a.id = application_id AND j.recruiter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Recruiters read own job hiring requirements" ON public.job_hiring_requirements;
CREATE POLICY "Recruiters read own job hiring requirements"
  ON public.job_hiring_requirements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      WHERE j.id = job_id AND j.recruiter_id = auth.uid()
    )
  );

ALTER TABLE public.application_activity
  DROP CONSTRAINT IF EXISTS application_activity_action_check;

ALTER TABLE public.application_activity
  ADD CONSTRAINT application_activity_action_check
  CHECK (action IN (
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
    'ai_analyzed',
    'stage_changed',
    'feedback_submitted',
    'scorecard_completed',
    'decision_recorded'
  ));

WITH upsert_template AS (
  INSERT INTO public.hiring_pipeline_templates (
    slug,
    name,
    description,
    is_system
  )
  VALUES (
    'joblinca-default-v1',
    'Joblinca Default Structured Hiring',
    'Default structured hiring pipeline for jobs and internships.',
    true
  )
  ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      is_system = EXCLUDED.is_system,
      updated_at = now()
  RETURNING id
)
INSERT INTO public.hiring_pipeline_template_stages (
  template_id,
  stage_key,
  label,
  stage_type,
  order_index,
  score_weight,
  is_terminal,
  allows_feedback,
  config
)
SELECT
  upsert_template.id,
  seeded.stage_key,
  seeded.label,
  seeded.stage_type,
  seeded.order_index,
  seeded.score_weight,
  seeded.is_terminal,
  seeded.allows_feedback,
  seeded.config
FROM upsert_template
CROSS JOIN (
  VALUES
    ('applied', 'Applied', 'applied', 1, 1::numeric, false, false, '{}'::jsonb),
    ('phone_screen', 'Phone Screen', 'screening', 2, 1::numeric, false, true, '{"channel":"phone"}'::jsonb),
    ('recruiter_review', 'Recruiter Review', 'review', 3, 1::numeric, false, true, '{}'::jsonb),
    ('hiring_manager_review', 'Hiring Manager Review', 'review', 4, 1::numeric, false, true, '{}'::jsonb),
    ('interview', 'Interview', 'interview', 5, 1::numeric, false, true, '{"scorecard":"default"}'::jsonb),
    ('final_review', 'Final Review', 'review', 6, 1::numeric, false, true, '{}'::jsonb),
    ('offer', 'Offer', 'offer', 7, 1::numeric, false, true, '{}'::jsonb),
    ('hired', 'Hired', 'hire', 8, 0::numeric, true, false, '{}'::jsonb),
    ('rejected', 'Rejected', 'rejected', 9, 0::numeric, true, false, '{}'::jsonb)
) AS seeded(stage_key, label, stage_type, order_index, score_weight, is_terminal, allows_feedback, config)
ON CONFLICT (template_id, stage_key) DO UPDATE
  SET
    label = EXCLUDED.label,
    stage_type = EXCLUDED.stage_type,
    order_index = EXCLUDED.order_index,
    score_weight = EXCLUDED.score_weight,
    is_terminal = EXCLUDED.is_terminal,
    allows_feedback = EXCLUDED.allows_feedback,
    config = EXCLUDED.config,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.compat_application_status_for_stage_type(p_stage_type text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_stage_type
    WHEN 'applied' THEN
      RETURN 'submitted';
    WHEN 'screening' THEN
      RETURN 'submitted';
    WHEN 'review' THEN
      RETURN 'shortlisted';
    WHEN 'offer' THEN
      RETURN 'shortlisted';
    WHEN 'interview' THEN
      RETURN 'interviewed';
    WHEN 'hire' THEN
      RETURN 'hired';
    WHEN 'rejected' THEN
      RETURN 'rejected';
    ELSE
      RETURN 'submitted';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.default_stage_key_for_application_status(p_status text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  CASE p_status
    WHEN 'submitted' THEN
      RETURN 'applied';
    WHEN 'shortlisted' THEN
      RETURN 'recruiter_review';
    WHEN 'interviewed' THEN
      RETURN 'interview';
    WHEN 'hired' THEN
      RETURN 'hired';
    WHEN 'rejected' THEN
      RETURN 'rejected';
    ELSE
      RETURN 'applied';
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_job_hiring_pipeline(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_pipeline_id uuid;
  v_template_id uuid;
BEGIN
  SELECT id
  INTO v_job_pipeline_id
  FROM public.job_hiring_pipelines
  WHERE job_id = p_job_id
  LIMIT 1;

  IF v_job_pipeline_id IS NOT NULL THEN
    RETURN v_job_pipeline_id;
  END IF;

  SELECT id
  INTO v_template_id
  FROM public.hiring_pipeline_templates
  WHERE slug = 'joblinca-default-v1'
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Default structured hiring template is missing';
  END IF;

  INSERT INTO public.job_hiring_pipelines (
    job_id,
    template_id,
    name
  )
  VALUES (
    p_job_id,
    v_template_id,
    'Default Structured Hiring'
  )
  ON CONFLICT (job_id) DO UPDATE
    SET template_id = COALESCE(public.job_hiring_pipelines.template_id, EXCLUDED.template_id)
  RETURNING id INTO v_job_pipeline_id;

  INSERT INTO public.job_hiring_pipeline_stages (
    job_pipeline_id,
    source_template_stage_id,
    stage_key,
    label,
    stage_type,
    order_index,
    score_weight,
    is_terminal,
    allows_feedback,
    config
  )
  SELECT
    v_job_pipeline_id,
    template_stage.id,
    template_stage.stage_key,
    template_stage.label,
    template_stage.stage_type,
    template_stage.order_index,
    template_stage.score_weight,
    template_stage.is_terminal,
    template_stage.allows_feedback,
    template_stage.config
  FROM public.hiring_pipeline_template_stages template_stage
  WHERE template_stage.template_id = v_template_id
  ORDER BY template_stage.order_index
  ON CONFLICT (job_pipeline_id, stage_key) DO NOTHING;

  INSERT INTO public.job_hiring_requirements (job_id)
  VALUES (p_job_id)
  ON CONFLICT (job_id) DO NOTHING;

  RETURN v_job_pipeline_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_job_pipeline_stage_for_status(
  p_job_id uuid,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_pipeline_id uuid;
  v_stage_id uuid;
  v_stage_key text;
BEGIN
  v_job_pipeline_id := public.create_default_job_hiring_pipeline(p_job_id);
  v_stage_key := public.default_stage_key_for_application_status(p_status);

  SELECT stage.id
  INTO v_stage_id
  FROM public.job_hiring_pipeline_stages stage
  WHERE stage.job_pipeline_id = v_job_pipeline_id
    AND stage.stage_key = v_stage_key
  LIMIT 1;

  IF v_stage_id IS NOT NULL THEN
    RETURN v_stage_id;
  END IF;

  SELECT stage.id
  INTO v_stage_id
  FROM public.job_hiring_pipeline_stages stage
  WHERE stage.job_pipeline_id = v_job_pipeline_id
  ORDER BY stage.order_index
  LIMIT 1;

  RETURN v_stage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_application_stage_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage_type text;
  v_compat_status text;
  v_target_stage_id uuid;
BEGIN
  IF COALESCE(NEW.is_draft, false) THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_default_job_hiring_pipeline(NEW.job_id);

  IF TG_OP = 'UPDATE'
     AND NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id
     AND NEW.current_stage_id IS NOT NULL THEN
    SELECT stage_type
    INTO v_stage_type
    FROM public.job_hiring_pipeline_stages
    WHERE id = NEW.current_stage_id;

    v_compat_status := public.compat_application_status_for_stage_type(v_stage_type);

    IF v_compat_status IS NOT NULL THEN
      NEW.status := v_compat_status;
    END IF;

    IF NEW.stage_entered_at IS NULL OR NEW.stage_entered_at = OLD.stage_entered_at THEN
      NEW.stage_entered_at := now();
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.current_stage_id IS NULL THEN
    v_target_stage_id := public.resolve_job_pipeline_stage_for_status(NEW.job_id, COALESCE(NEW.status, 'submitted'));

    IF v_target_stage_id IS NOT NULL THEN
      NEW.current_stage_id := v_target_stage_id;
      NEW.stage_entered_at := COALESCE(NEW.stage_entered_at, now());
    END IF;
  END IF;

  IF NEW.current_stage_id IS NOT NULL THEN
    SELECT stage_type
    INTO v_stage_type
    FROM public.job_hiring_pipeline_stages
    WHERE id = NEW.current_stage_id;

    v_compat_status := public.compat_application_status_for_stage_type(v_stage_type);

    IF v_compat_status IS NOT NULL THEN
      NEW.status := v_compat_status;
    END IF;
  END IF;

  IF NEW.decision_status IS NULL THEN
    NEW.decision_status := 'active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_job_hiring_pipeline_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.create_default_job_hiring_pipeline(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_create_default_hiring_pipeline ON public.jobs;
CREATE TRIGGER trg_jobs_create_default_hiring_pipeline
  AFTER INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_job_hiring_pipeline_trigger();

DROP TRIGGER IF EXISTS trg_applications_stage_consistency ON public.applications;
CREATE TRIGGER trg_applications_stage_consistency
  BEFORE INSERT OR UPDATE OF current_stage_id, status, job_id, is_draft
  ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_application_stage_consistency();

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.jobs LOOP
    PERFORM public.create_default_job_hiring_pipeline(r.id);
  END LOOP;
END;
$$;

UPDATE public.applications a
SET
  current_stage_id = public.resolve_job_pipeline_stage_for_status(a.job_id, a.status),
  stage_entered_at = COALESCE(a.stage_entered_at, a.updated_at, a.created_at),
  decision_status = CASE
    WHEN a.status = 'hired' THEN 'hired'
    WHEN a.status = 'rejected' THEN 'rejected'
    ELSE 'active'
  END
WHERE a.current_stage_id IS NULL
  AND COALESCE(a.is_draft, false) = false;
