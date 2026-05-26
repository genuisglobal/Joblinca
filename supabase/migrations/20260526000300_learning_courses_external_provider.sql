-- Sprint 2 / B1 — External provider catalog
--
-- Extend learning_courses so a course row can either reference an in-house
-- course (existing track/module data) OR point to an external provider
-- (Coursera, ALX, OpenClassrooms, YouTube, etc.). The wrong-answer
-- recommendation flow consumes these rows once admin has approved them.

ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS external_provider text;

ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS external_url text;

ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS external_url_fr text;

ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS affiliate_code text;

ALTER TABLE public.learning_courses
  ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.learning_courses.external_provider IS
  'When the course lives off-platform, the provider name (e.g. coursera, alx, openclassrooms, youtube, udemy). Null for in-house courses.';
COMMENT ON COLUMN public.learning_courses.external_url IS
  'EN landing URL of an external course; null for in-house courses.';
COMMENT ON COLUMN public.learning_courses.external_url_fr IS
  'FR variant of the landing URL when the provider offers one.';
COMMENT ON COLUMN public.learning_courses.affiliate_code IS
  'Affiliate / referral code appended to external_url when present.';
COMMENT ON COLUMN public.learning_courses.is_free IS
  'true when the resource is accessible without payment. Free options are surfaced first in recommendations.';

CREATE INDEX IF NOT EXISTS idx_learning_courses_external_provider
  ON public.learning_courses(external_provider)
  WHERE external_provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_learning_courses_is_free
  ON public.learning_courses(is_free, published)
  WHERE published = true;
