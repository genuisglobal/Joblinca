-- Fix language detection for jobs that were incorrectly classified as English.
-- The previous heuristic missed common French patterns like verb forms (recrute),
-- structural words (des, les, l', d'), and Cameroon-specific job titles (commercial,
-- comptable, chauffeur). This migration re-runs detection with an improved approach.

-- Step 1: Re-detect language for admin_import jobs using improved French detection.
-- French structural patterns (articles, prepositions, contractions) are strong signals.
WITH lang_redetect AS (
  SELECT
    id,
    lower(coalesce(title, '') || ' ' || coalesce(description, '')) AS txt
  FROM public.jobs
  WHERE origin_type = 'admin_import'
),
scored AS (
  SELECT
    id,
    CASE
      -- French structural words are very strong signals
      WHEN txt ~ '( des | les | une | pour | dans | aux | sur | est | sont | avec | cette | votre | nous | notre | leur )'
        OR txt ~ $re$( l'| d'| n'| s'| qu')$re$
        THEN 'fr'
      -- French job-specific keywords (expanded)
      WHEN txt ~ '(recrute|recrutement|recherche|cherche|emploi|offre|poste|candidature|pourvoir|société|societe|entreprise|agence|contrat|stage|mission|disponible|profil|expérience|compétences|competences|candidat|diplôme|diplome|formation|travail|salaire|rémunération|remuneration|envoyez|envoyer|postuler|postulez|responsable|directeur|gestionnaire|comptable|commercial|technicien|ingénieur|ingenieur|secrétaire|secretaire|chauffeur|caissier)'
        THEN 'fr'
      -- English keywords
      WHEN txt ~ '(recruitment|hiring|position|vacancy|apply|company|opportunity|looking for|contract|internship|requirements|required|qualified|candidate|resume|salary|deadline|submit|manager|officer|engineer|accountant)'
        THEN 'en'
      -- Default to French for Cameroon (French-majority country)
      ELSE 'fr'
    END AS detected_lang
  FROM lang_redetect
)
UPDATE public.jobs AS j
SET language = s.detected_lang
FROM scored AS s
WHERE j.id = s.id
  AND (j.language IS NULL OR j.language != s.detected_lang);

-- Step 2: Also fix discovered_jobs language for future publishes.
WITH dj_redetect AS (
  SELECT
    id,
    lower(coalesce(title, '') || ' ' || coalesce(description_raw, '') || ' ' || coalesce(description_clean, '')) AS txt
  FROM public.discovered_jobs
),
dj_scored AS (
  SELECT
    id,
    CASE
      WHEN txt ~ '( des | les | une | pour | dans | aux | sur | est | sont | avec | cette | votre | nous | notre | leur )'
        OR txt ~ $re$( l'| d'| n'| s'| qu')$re$
        THEN 'fr'
      WHEN txt ~ '(recrute|recrutement|recherche|cherche|emploi|offre|poste|candidature|pourvoir|société|societe|entreprise|agence|contrat|stage|mission|disponible|profil|expérience|compétences|competences|candidat|diplôme|diplome|formation|travail|salaire|rémunération|remuneration|envoyez|envoyer|postuler|postulez|responsable|directeur|gestionnaire|comptable|commercial|technicien|ingénieur|ingenieur|secrétaire|secretaire|chauffeur|caissier)'
        THEN 'fr'
      WHEN txt ~ '(recruitment|hiring|position|vacancy|apply|company|opportunity|looking for|contract|internship|requirements|required|qualified|candidate|resume|salary|deadline|submit|manager|officer|engineer|accountant)'
        THEN 'en'
      ELSE 'fr'
    END AS detected_lang
  FROM dj_redetect
)
UPDATE public.discovered_jobs AS dj
SET language = s.detected_lang
FROM dj_scored AS s
WHERE dj.id = s.id
  AND (dj.language IS NULL OR dj.language != s.detected_lang);
