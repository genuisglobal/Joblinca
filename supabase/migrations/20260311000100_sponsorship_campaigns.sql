-- =============================================================================
-- Migration: Sponsorship campaigns and sponsor event tracking
-- =============================================================================

CREATE TABLE IF NOT EXISTS sponsor_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_type text NOT NULL CHECK (sponsor_type IN ('job', 'employer', 'academy')),
  placement text NOT NULL CHECK (
    placement IN ('homepage_shelf', 'jobs_top', 'jobs_infeed', 'city_top', 'skillup_partners')
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'pending_approval', 'active', 'paused', 'ended', 'rejected')
  ),
  sponsor_name text NOT NULL,
  title text NOT NULL,
  short_copy text,
  cta_label text,
  cta_url text,
  image_url text,
  sponsor_logo_url text,
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE CASCADE,
  partner_course_id uuid,
  audience_roles text[] NOT NULL DEFAULT '{}'::text[],
  city_targets text[] NOT NULL DEFAULT '{}'::text[],
  priority integer NOT NULL DEFAULT 0,
  price_xaf integer NOT NULL DEFAULT 0 CHECK (price_xaf >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sponsor_campaigns
  ADD COLUMN IF NOT EXISTS partner_course_id uuid;

CREATE TABLE IF NOT EXISTS sponsor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.sponsor_campaigns(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('impression', 'click', 'cta_click')),
  placement text NOT NULL DEFAULT 'homepage_shelf',
  session_key text,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_status_placement_priority
  ON public.sponsor_campaigns(status, placement, priority DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_live_window
  ON public.sponsor_campaigns(starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_linked_job
  ON public.sponsor_campaigns(job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_linked_recruiter
  ON public.sponsor_campaigns(recruiter_id)
  WHERE recruiter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sponsor_campaigns_linked_partner_course
  ON public.sponsor_campaigns(partner_course_id)
  WHERE partner_course_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sponsor_events_campaign_created
  ON public.sponsor_events(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sponsor_events_type_created
  ON public.sponsor_events(event_type, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'partner_courses'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'sponsor_campaigns_partner_course_id_fkey'
        AND conrelid = 'public.sponsor_campaigns'::regclass
    ) THEN
      ALTER TABLE public.sponsor_campaigns
        ADD CONSTRAINT sponsor_campaigns_partner_course_id_fkey
        FOREIGN KEY (partner_course_id)
        REFERENCES public.partner_courses(id)
        ON DELETE CASCADE;
    END IF;
  END IF;
END
$$;

ALTER TABLE public.sponsor_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access sponsor_campaigns" ON public.sponsor_campaigns;
CREATE POLICY "Service role full access sponsor_campaigns"
  ON public.sponsor_campaigns FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage sponsor_campaigns" ON public.sponsor_campaigns;
CREATE POLICY "Admins manage sponsor_campaigns"
  ON public.sponsor_campaigns FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.admin_type IN ('super', 'operations')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.admin_type IN ('super', 'operations')
    )
  );

DROP POLICY IF EXISTS "Service role full access sponsor_events" ON public.sponsor_events;
CREATE POLICY "Service role full access sponsor_events"
  ON public.sponsor_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins read sponsor_events" ON public.sponsor_events;
CREATE POLICY "Admins read sponsor_events"
  ON public.sponsor_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.admin_type IN ('super', 'operations')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_sponsor_campaigns_updated_at ON public.sponsor_campaigns;
CREATE TRIGGER trg_sponsor_campaigns_updated_at
  BEFORE UPDATE ON public.sponsor_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
