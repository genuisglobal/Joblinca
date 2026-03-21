ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text
  CHECK (preferred_locale IN ('en', 'fr'));

COMMENT ON COLUMN public.profiles.preferred_locale
  IS 'Preferred UI locale for the authenticated user (en or fr).';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS language text
  CHECK (language IN ('en', 'fr'));

COMMENT ON COLUMN public.jobs.language
  IS 'Primary language of the job posting content (en or fr).';

UPDATE public.jobs AS jobs
SET language = discovered.language
FROM public.discovered_jobs AS discovered
WHERE jobs.origin_discovered_job_id = discovered.id
  AND jobs.language IS NULL
  AND discovered.language IN ('en', 'fr');

WITH inferred_language AS (
  SELECT
    id,
    CASE
      WHEN lower(coalesce(title, '') || ' ' || coalesce(description, '')) ~
        '(recrutement|emploi|poste|offre|candidature|entreprise|profil|recherche|contrat|stage|mission|francais)'
        THEN 'fr'
      WHEN lower(coalesce(title, '') || ' ' || coalesce(description, '')) ~
        '(recruitment|hiring|position|vacancy|apply|company|opportunity|contract|internship|job|english|requirements)'
        THEN 'en'
      ELSE NULL
    END AS language
  FROM public.jobs
  WHERE language IS NULL
)
UPDATE public.jobs AS jobs
SET language = inferred.language
FROM inferred_language AS inferred
WHERE jobs.id = inferred.id
  AND inferred.language IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_language
  ON public.jobs (language)
  WHERE language IS NOT NULL;
