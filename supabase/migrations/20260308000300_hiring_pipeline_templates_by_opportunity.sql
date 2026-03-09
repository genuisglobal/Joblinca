-- Opportunity-specific structured hiring templates.
-- Keeps the same public.create_default_job_hiring_pipeline(p_job_id uuid)
-- entry point, but changes the chosen template based on job_type and
-- internship_track.

WITH upsert_template AS (
  INSERT INTO public.hiring_pipeline_templates (
    slug,
    name,
    description,
    is_system
  )
  VALUES (
    'joblinca-job-v1',
    'Job Structured Hiring',
    'Default hiring pipeline for standard jobs and gigs.',
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
    ('screening', 'Screening', 'screening', 2, 1::numeric, false, true, '{}'::jsonb),
    ('recruiter_review', 'Recruiter Review', 'review', 3, 1::numeric, false, true, '{}'::jsonb),
    ('hiring_manager_review', 'Hiring Manager Review', 'review', 4, 1::numeric, false, true, '{}'::jsonb),
    ('interview', 'Interview', 'interview', 5, 1::numeric, false, true, '{"scorecard":"default"}'::jsonb),
    ('offer', 'Offer', 'offer', 6, 1::numeric, false, true, '{}'::jsonb),
    ('hired', 'Hired', 'hire', 7, 0::numeric, true, false, '{}'::jsonb),
    ('rejected', 'Rejected', 'rejected', 8, 0::numeric, true, false, '{}'::jsonb)
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

WITH upsert_template AS (
  INSERT INTO public.hiring_pipeline_templates (
    slug,
    name,
    description,
    is_system
  )
  VALUES (
    'joblinca-internship-education-v1',
    'Educational Internship Hiring',
    'Default hiring pipeline for academic and school-aligned internships.',
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
    ('eligibility_check', 'Eligibility Check', 'screening', 2, 1::numeric, false, true, '{"kind":"education_eligibility"}'::jsonb),
    ('academic_review', 'Academic Review', 'review', 3, 1::numeric, false, true, '{"owner":"school"}'::jsonb),
    ('recruiter_review', 'Recruiter Review', 'review', 4, 1::numeric, false, true, '{"owner":"recruiter"}'::jsonb),
    ('supervisor_review', 'Supervisor Review', 'review', 5, 1::numeric, false, true, '{"owner":"supervisor"}'::jsonb),
    ('placement_confirmed', 'Placement Confirmed', 'hire', 6, 0::numeric, true, false, '{"kind":"placement"}'::jsonb),
    ('rejected', 'Rejected', 'rejected', 7, 0::numeric, true, false, '{}'::jsonb)
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

WITH upsert_template AS (
  INSERT INTO public.hiring_pipeline_templates (
    slug,
    name,
    description,
    is_system
  )
  VALUES (
    'joblinca-internship-professional-v1',
    'Professional Internship Hiring',
    'Default hiring pipeline for professional internships and conversion-focused placements.',
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
    ('recruiter_screen', 'Recruiter Screen', 'screening', 2, 1::numeric, false, true, '{"owner":"recruiter"}'::jsonb),
    ('assessment', 'Assessment', 'review', 3, 1::numeric, false, true, '{"kind":"assessment"}'::jsonb),
    ('interview', 'Interview', 'interview', 4, 1::numeric, false, true, '{"scorecard":"default"}'::jsonb),
    ('offer', 'Offer', 'offer', 5, 1::numeric, false, true, '{}'::jsonb),
    ('hired', 'Hired', 'hire', 6, 0::numeric, true, false, '{}'::jsonb),
    ('rejected', 'Rejected', 'rejected', 7, 0::numeric, true, false, '{}'::jsonb)
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

CREATE OR REPLACE FUNCTION public.default_hiring_template_slug_for_job(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_type text;
  v_internship_track text;
BEGIN
  SELECT job_type, COALESCE(internship_track::text, 'unspecified')
  INTO v_job_type, v_internship_track
  FROM public.jobs
  WHERE id = p_job_id;

  IF v_job_type = 'internship' AND v_internship_track = 'education' THEN
    RETURN 'joblinca-internship-education-v1';
  END IF;

  IF v_job_type = 'internship' AND v_internship_track = 'professional' THEN
    RETURN 'joblinca-internship-professional-v1';
  END IF;

  RETURN 'joblinca-job-v1';
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
  v_template_slug text;
  v_template_name text;
BEGIN
  SELECT id
  INTO v_job_pipeline_id
  FROM public.job_hiring_pipelines
  WHERE job_id = p_job_id
  LIMIT 1;

  IF v_job_pipeline_id IS NOT NULL THEN
    RETURN v_job_pipeline_id;
  END IF;

  v_template_slug := public.default_hiring_template_slug_for_job(p_job_id);

  SELECT id, name
  INTO v_template_id, v_template_name
  FROM public.hiring_pipeline_templates
  WHERE slug = v_template_slug
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Default structured hiring template is missing for slug %', v_template_slug;
  END IF;

  INSERT INTO public.job_hiring_pipelines (
    job_id,
    template_id,
    name
  )
  VALUES (
    p_job_id,
    v_template_id,
    v_template_name
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

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.jobs LOOP
    PERFORM public.create_default_job_hiring_pipeline(r.id);
  END LOOP;
END;
$$;
