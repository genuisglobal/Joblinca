-- Sprint 3 / D1 — Recruiter score filter
--
-- Index supporting the recruiter "find quiz-verified candidates" query path:
--   SELECT user_id, MAX(final_score)
--   FROM talent_challenge_submissions
--   WHERE status IN ('submitted','graded')
--     AND final_score >= :min
--     AND created_at >= :since
--   GROUP BY user_id;
--
-- The existing MVP indexes cover challenge-level lookups but do not let us
-- scan only "rankable" submissions efficiently.

CREATE INDEX IF NOT EXISTS idx_talent_submissions_recruiter_filter
  ON public.talent_challenge_submissions(final_score DESC, created_at DESC, user_id)
  WHERE status IN ('submitted', 'graded') AND final_score IS NOT NULL;

-- A second partial index for the domain-scoped variant, where the recruiter
-- already knows which challenges they care about. Lets a server-side
-- (challenge_id, score) filter avoid a sequential scan.
CREATE INDEX IF NOT EXISTS idx_talent_submissions_recruiter_filter_by_challenge
  ON public.talent_challenge_submissions(challenge_id, final_score DESC, created_at DESC)
  WHERE status IN ('submitted', 'graded') AND final_score IS NOT NULL;
