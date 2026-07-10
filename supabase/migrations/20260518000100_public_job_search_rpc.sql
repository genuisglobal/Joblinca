-- Ranked public job search helpers for the /jobs marketplace.
-- These functions keep browse counts and pagination aligned with the
-- full filtered result set, while using bilingual-friendly full-text
-- search over title, description, and company name.

CREATE INDEX IF NOT EXISTS idx_jobs_fts_simple
  ON public.jobs
  USING GIN (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(company_name, '')
    )
  );

CREATE OR REPLACE FUNCTION public.search_public_jobs(
  p_search text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_work_type text DEFAULT NULL,
  p_job_type text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_preferred_language text DEFAULT NULL,
  p_browse_type text DEFAULT 'all',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  location text,
  salary numeric,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text,
  company_name text,
  company_logo_url text,
  work_type text,
  job_type text,
  language text,
  created_at timestamptz,
  closes_at timestamptz,
  lifecycle_status text,
  visibility text,
  published boolean,
  approval_status text,
  apply_method text,
  external_apply_url text,
  image_url text,
  internship_track text,
  boost_until timestamptz,
  origin_type text,
  source_attribution_json jsonb,
  relevance_score real
)
LANGUAGE sql
STABLE
AS $$
  WITH normalized_input AS (
    SELECT
      NULLIF(BTRIM(p_search), '') AS search_text,
      NULLIF(BTRIM(p_location), '') AS location_text,
      NULLIF(BTRIM(p_work_type), '') AS work_type_text,
      NULLIF(BTRIM(p_job_type), '') AS job_type_text,
      CASE WHEN p_language IN ('en', 'fr') THEN p_language ELSE NULL END AS language_text,
      CASE
        WHEN p_preferred_language IN ('en', 'fr') THEN p_preferred_language
        ELSE NULL
      END AS preferred_language_text,
      CASE
        WHEN p_browse_type IN ('job', 'internship_education', 'internship_professional', 'gig')
          THEN p_browse_type
        ELSE 'all'
      END AS browse_type,
      GREATEST(LEAST(COALESCE(p_limit, 24), 200), 1) AS page_limit,
      GREATEST(COALESCE(p_offset, 0), 0) AS page_offset
  ),
  base AS (
    SELECT
      j.id,
      j.title,
      j.description,
      j.location,
      j.salary,
      j.salary_min,
      j.salary_max,
      j.salary_currency,
      j.salary_period,
      j.company_name,
      j.company_logo_url,
      j.work_type,
      j.job_type,
      COALESCE(
        j.language,
        CASE
          WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
            '(recrutement|emploi|poste|offre|candidature|entreprise|profil|recherche|contrat|stage|mission|francais)'
            THEN 'fr'
          WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
            '(recruitment|hiring|position|vacancy|apply|company|opportunity|contract|internship|job|english|requirements)'
            THEN 'en'
          ELSE NULL
        END
      ) AS language,
      j.created_at,
      j.closes_at,
      j.lifecycle_status::text AS lifecycle_status,
      j.visibility,
      j.published,
      j.approval_status,
      j.apply_method,
      j.external_apply_url,
      j.image_url,
      j.internship_track,
      j.boost_until,
      j.origin_type,
      j.source_attribution_json,
      CASE
        WHEN j.job_type = 'internship' AND j.internship_track = 'education'
          THEN 'internship_education'
        WHEN j.job_type = 'internship' AND j.internship_track = 'professional'
          THEN 'internship_professional'
        WHEN j.job_type = 'gig'
          THEN 'gig'
        ELSE 'job'
      END AS browse_category,
      CASE
        WHEN input.search_text IS NULL THEN 0::real
        ELSE ts_rank(
          to_tsvector(
            'simple',
            coalesce(j.title, '') || ' ' || coalesce(j.description, '') || ' ' || coalesce(j.company_name, '')
          ),
          websearch_to_tsquery('simple', input.search_text)
        )
      END AS lexical_rank,
      CASE
        WHEN input.search_text IS NULL THEN 0::real
        WHEN lower(j.title) = lower(input.search_text) THEN 3.0::real
        WHEN lower(j.title) LIKE lower(input.search_text) || '%' THEN 2.0::real
        WHEN lower(coalesce(j.company_name, '')) = lower(input.search_text) THEN 1.5::real
        WHEN lower(coalesce(j.company_name, '')) LIKE lower(input.search_text) || '%' THEN 1.0::real
        WHEN lower(j.title) LIKE '%' || lower(input.search_text) || '%' THEN 0.75::real
        ELSE 0::real
      END AS exact_match_bonus,
      CASE
        WHEN input.preferred_language_text IS NOT NULL
          AND COALESCE(
            j.language,
            CASE
              WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
                '(recrutement|emploi|poste|offre|candidature|entreprise|profil|recherche|contrat|stage|mission|francais)'
                THEN 'fr'
              WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
                '(recruitment|hiring|position|vacancy|apply|company|opportunity|contract|internship|job|english|requirements)'
                THEN 'en'
              ELSE NULL
            END
          ) = input.preferred_language_text
          THEN 0.2::real
        ELSE 0::real
      END AS locale_bonus,
      CASE
        WHEN j.boost_until IS NOT NULL AND j.boost_until > now() THEN 1
        ELSE 0
      END AS boosted
    FROM public.jobs AS j
    CROSS JOIN normalized_input AS input
    WHERE j.published = true
      AND j.approval_status = 'approved'
      AND j.visibility = 'public'
      AND j.removed_at IS NULL
      AND j.lifecycle_status = 'live'
      AND (j.closes_at IS NULL OR j.closes_at > now())
      AND (
        input.language_text IS NULL
        OR COALESCE(
          j.language,
          CASE
            WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
              '(recrutement|emploi|poste|offre|candidature|entreprise|profil|recherche|contrat|stage|mission|francais)'
              THEN 'fr'
            WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
              '(recruitment|hiring|position|vacancy|apply|company|opportunity|contract|internship|job|english|requirements)'
              THEN 'en'
            ELSE NULL
          END
        ) = input.language_text
      )
      AND (input.work_type_text IS NULL OR j.work_type = input.work_type_text)
      AND (input.job_type_text IS NULL OR j.job_type::text = input.job_type_text)
      AND (input.location_text IS NULL OR j.location ILIKE '%' || input.location_text || '%')
      AND (
        input.search_text IS NULL
        OR to_tsvector(
          'simple',
          coalesce(j.title, '') || ' ' || coalesce(j.description, '') || ' ' || coalesce(j.company_name, '')
        ) @@ websearch_to_tsquery('simple', input.search_text)
        OR j.title ILIKE '%' || input.search_text || '%'
        OR coalesce(j.company_name, '') ILIKE '%' || input.search_text || '%'
        OR j.description ILIKE '%' || input.search_text || '%'
      )
  ),
  filtered AS (
    SELECT
      base.*,
      (base.lexical_rank + base.exact_match_bonus + base.locale_bonus) AS relevance_score
    FROM base
    CROSS JOIN normalized_input AS input
    WHERE input.browse_type = 'all' OR base.browse_category = input.browse_type
  )
  SELECT
    filtered.id,
    filtered.title,
    filtered.description,
    filtered.location,
    filtered.salary,
    filtered.salary_min,
    filtered.salary_max,
    filtered.salary_currency,
    filtered.salary_period,
    filtered.company_name,
    filtered.company_logo_url,
    filtered.work_type,
    filtered.job_type,
    filtered.language,
    filtered.created_at,
    filtered.closes_at,
    filtered.lifecycle_status,
    filtered.visibility,
    filtered.published,
    filtered.approval_status,
    filtered.apply_method,
    filtered.external_apply_url,
    filtered.image_url,
    filtered.internship_track,
    filtered.boost_until,
    filtered.origin_type,
    filtered.source_attribution_json,
    filtered.relevance_score
  FROM filtered
  CROSS JOIN normalized_input AS input
  ORDER BY
    filtered.boosted DESC,
    filtered.relevance_score DESC,
    filtered.created_at DESC
  LIMIT (SELECT page_limit FROM normalized_input)
  OFFSET (SELECT page_offset FROM normalized_input);
$$;

COMMENT ON FUNCTION public.search_public_jobs(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer
) IS
  'Returns ranked, publicly listable jobs for the /jobs marketplace with browse-type filtering applied server-side.';

CREATE OR REPLACE FUNCTION public.search_public_job_counts(
  p_search text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_work_type text DEFAULT NULL,
  p_job_type text DEFAULT NULL,
  p_language text DEFAULT NULL,
  p_browse_type text DEFAULT 'all'
)
RETURNS TABLE (
  total_count bigint,
  all_count bigint,
  job_count bigint,
  internship_education_count bigint,
  internship_professional_count bigint,
  gig_count bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH normalized_input AS (
    SELECT
      NULLIF(BTRIM(p_search), '') AS search_text,
      NULLIF(BTRIM(p_location), '') AS location_text,
      NULLIF(BTRIM(p_work_type), '') AS work_type_text,
      NULLIF(BTRIM(p_job_type), '') AS job_type_text,
      CASE WHEN p_language IN ('en', 'fr') THEN p_language ELSE NULL END AS language_text,
      CASE
        WHEN p_browse_type IN ('job', 'internship_education', 'internship_professional', 'gig')
          THEN p_browse_type
        ELSE 'all'
      END AS browse_type
  ),
  base AS (
    SELECT
      CASE
        WHEN j.job_type = 'internship' AND j.internship_track = 'education'
          THEN 'internship_education'
        WHEN j.job_type = 'internship' AND j.internship_track = 'professional'
          THEN 'internship_professional'
        WHEN j.job_type = 'gig'
          THEN 'gig'
        ELSE 'job'
      END AS browse_category
    FROM public.jobs AS j
    CROSS JOIN normalized_input AS input
    WHERE j.published = true
      AND j.approval_status = 'approved'
      AND j.visibility = 'public'
      AND j.removed_at IS NULL
      AND j.lifecycle_status = 'live'
      AND (j.closes_at IS NULL OR j.closes_at > now())
      AND (
        input.language_text IS NULL
        OR COALESCE(
          j.language,
          CASE
            WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
              '(recrutement|emploi|poste|offre|candidature|entreprise|profil|recherche|contrat|stage|mission|francais)'
              THEN 'fr'
            WHEN lower(coalesce(j.title, '') || ' ' || coalesce(j.description, '')) ~
              '(recruitment|hiring|position|vacancy|apply|company|opportunity|contract|internship|job|english|requirements)'
              THEN 'en'
            ELSE NULL
          END
        ) = input.language_text
      )
      AND (input.work_type_text IS NULL OR j.work_type = input.work_type_text)
      AND (input.job_type_text IS NULL OR j.job_type::text = input.job_type_text)
      AND (input.location_text IS NULL OR j.location ILIKE '%' || input.location_text || '%')
      AND (
        input.search_text IS NULL
        OR to_tsvector(
          'simple',
          coalesce(j.title, '') || ' ' || coalesce(j.description, '') || ' ' || coalesce(j.company_name, '')
        ) @@ websearch_to_tsquery('simple', input.search_text)
        OR j.title ILIKE '%' || input.search_text || '%'
        OR coalesce(j.company_name, '') ILIKE '%' || input.search_text || '%'
        OR j.description ILIKE '%' || input.search_text || '%'
      )
  )
  SELECT
    COUNT(*) FILTER (
      WHERE input.browse_type = 'all' OR base.browse_category = input.browse_type
    )::bigint AS total_count,
    COUNT(*)::bigint AS all_count,
    COUNT(*) FILTER (WHERE base.browse_category = 'job')::bigint AS job_count,
    COUNT(*) FILTER (WHERE base.browse_category = 'internship_education')::bigint AS internship_education_count,
    COUNT(*) FILTER (WHERE base.browse_category = 'internship_professional')::bigint AS internship_professional_count,
    COUNT(*) FILTER (WHERE base.browse_category = 'gig')::bigint AS gig_count
  FROM base
  CROSS JOIN normalized_input AS input;
$$;

COMMENT ON FUNCTION public.search_public_job_counts(
  text,
  text,
  text,
  text,
  text,
  text
) IS
  'Returns exact browse-tab counts and filtered totals for the /jobs marketplace.';
