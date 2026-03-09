CREATE OR REPLACE FUNCTION public.compute_application_ranking(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_app RECORD;
  v_ai RECORD;
  v_latest_feedback RECORD;
  v_score numeric := 0;
  v_breakdown jsonb := '{}';
  v_recency numeric := 0;
  v_completeness numeric := 0;
  v_ai_match numeric := 0;
  v_rating numeric := 0;
  v_stage_score numeric := 0;
  v_feedback_signal numeric := 0;
  v_eligibility_signal numeric := 0;
  v_decision_signal numeric := 0;
BEGIN
  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_ai
  FROM public.ai_application_insights
  WHERE application_id = p_application_id
    AND status = 'completed'
  ORDER BY completed_at DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  SELECT recommendation, score
  INTO v_latest_feedback
  FROM public.application_stage_feedback
  WHERE application_id = p_application_id
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  v_recency := ROUND(
    GREATEST(0, 15 - ((EXTRACT(EPOCH FROM (now() - v_app.created_at)) / 86400.0) * 0.5))::numeric,
    2
  );

  v_completeness :=
    CASE WHEN NULLIF(TRIM(COALESCE(v_app.resume_url, '')), '') IS NOT NULL THEN 8 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(COALESCE(v_app.cover_letter, '')), '') IS NOT NULL THEN 4 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(COALESCE(v_app.contact_info ->> 'email', '')), '') IS NOT NULL THEN 2 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(COALESCE(v_app.contact_info ->> 'phone', '')), '') IS NOT NULL THEN 1 ELSE 0 END;

  v_ai_match := ROUND(
    LEAST(30, GREATEST(0, COALESCE(v_ai.match_score, 0) * 0.30))::numeric,
    2
  );

  v_rating := ROUND(
    GREATEST(0, COALESCE(v_app.recruiter_rating, 0) * 2)::numeric,
    2
  );

  v_stage_score := ROUND(
    LEAST(15, GREATEST(0, COALESCE(v_app.overall_stage_score, 0) * 0.15))::numeric,
    2
  );

  v_feedback_signal :=
    CASE COALESCE(v_latest_feedback.recommendation, '')
      WHEN 'strong_yes' THEN 10
      WHEN 'yes' THEN 6
      WHEN 'mixed' THEN 1
      WHEN 'no' THEN -4
      WHEN 'strong_no' THEN -8
      ELSE 0
    END;

  v_eligibility_signal :=
    CASE COALESCE(v_app.eligibility_status, '')
      WHEN 'eligible' THEN 10
      WHEN 'needs_review' THEN 4
      WHEN 'ineligible' THEN -10
      ELSE 0
    END;

  v_decision_signal :=
    CASE COALESCE(v_app.decision_status, '')
      WHEN 'hired' THEN 8
      WHEN 'rejected' THEN -8
      WHEN 'withdrawn' THEN -6
      ELSE 0
    END;

  v_breakdown := jsonb_build_object(
    'recency', v_recency,
    'completeness', v_completeness,
    'ai_match', v_ai_match,
    'rating', v_rating,
    'stage_score', v_stage_score,
    'feedback_signal', v_feedback_signal,
    'eligibility', v_eligibility_signal,
    'decision', v_decision_signal
  );

  v_score :=
    v_recency +
    v_completeness +
    v_ai_match +
    v_rating +
    v_stage_score +
    v_feedback_signal +
    v_eligibility_signal +
    v_decision_signal;

  UPDATE public.applications
  SET
    ranking_score = ROUND(v_score, 2),
    ranking_breakdown = v_breakdown
  WHERE id = p_application_id;
END;
$$;

COMMENT ON FUNCTION public.compute_application_ranking IS
  'Computes ranking using AI, recruiter rating, structured feedback, eligibility diagnostics, and hiring decisions';

DROP TRIGGER IF EXISTS applications_compute_ranking ON public.applications;

CREATE TRIGGER applications_compute_ranking
  AFTER INSERT OR UPDATE OF recruiter_rating, resume_url, cover_letter, contact_info, overall_stage_score, decision_status, eligibility_status
  ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_compute_ranking();

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.applications LOOP
    PERFORM public.compute_application_ranking(r.id);
  END LOOP;
END;
$$;
