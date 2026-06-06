-- Admin-adjustable auto-publish thresholds for the scraping pipeline.
--
-- Previously the auto-publish gate (trust >= 60, scam < 30) was hardcoded in
-- lib/scrapers/auto-pipeline.ts. This makes both knobs editable from the admin
-- Aggregation Control Room. Single-row table (id is pinned to 1).

CREATE TABLE IF NOT EXISTS public.aggregation_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_publish_trust_min integer NOT NULL DEFAULT 60
    CHECK (auto_publish_trust_min BETWEEN 0 AND 100),
  auto_publish_scam_max integer NOT NULL DEFAULT 30
    CHECK (auto_publish_scam_max BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Seed the singleton row with the historical defaults.
INSERT INTO public.aggregation_settings (id, auto_publish_trust_min, auto_publish_scam_max)
VALUES (1, 60, 30)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_aggregation_settings_updated_at ON public.aggregation_settings;
CREATE TRIGGER trg_aggregation_settings_updated_at
  BEFORE UPDATE ON public.aggregation_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.aggregation_settings ENABLE ROW LEVEL SECURITY;

-- Admins (super/operations) can read the thresholds for the dashboard.
-- Writes go through the API using the service-role key, which bypasses RLS.
DROP POLICY IF EXISTS "aggregation_settings_select_admin" ON public.aggregation_settings;
CREATE POLICY "aggregation_settings_select_admin" ON public.aggregation_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.admin_type IN ('super', 'operations')
    )
  );
