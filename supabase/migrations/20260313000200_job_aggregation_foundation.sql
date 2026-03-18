-- Job aggregation foundation
--
-- Establishes a separate discovered_jobs subsystem for trusted aggregation
-- operations. This is intentionally additive and admin-first.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aggregation_source_type_enum') THEN
    CREATE TYPE public.aggregation_source_type_enum AS ENUM (
      'api',
      'rss',
      'ats',
      'html',
      'manual'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aggregation_run_status_enum') THEN
    CREATE TYPE public.aggregation_run_status_enum AS ENUM (
      'queued',
      'running',
      'completed',
      'failed',
      'partial',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discovered_job_verification_enum') THEN
    CREATE TYPE public.discovered_job_verification_enum AS ENUM (
      'discovered',
      'claimed',
      'verified',
      'rejected',
      'expired',
      'suspicious'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'discovered_job_claim_enum') THEN
    CREATE TYPE public.discovered_job_claim_enum AS ENUM (
      'unclaimed',
      'invite_pending',
      'claim_requested',
      'claim_under_review',
      'claim_approved',
      'claim_rejected',
      'converted'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ingestion_status_enum') THEN
    CREATE TYPE public.ingestion_status_enum AS ENUM (
      'normalized',
      'deduped',
      'review_required',
      'published',
      'hidden',
      'failed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.aggregation_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  source_type public.aggregation_source_type_enum NOT NULL,
  platform_region_id text NOT NULL REFERENCES public.platform_regions(id) ON DELETE RESTRICT,
  base_url text,
  source_home_url text,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  requires_attribution boolean NOT NULL DEFAULT true,
  attribution_text text,
  poll_interval_minutes integer NOT NULL DEFAULT 360 CHECK (poll_interval_minutes >= 5),
  max_pages_per_run integer NOT NULL DEFAULT 20 CHECK (max_pages_per_run >= 1),
  rate_limit_per_minute integer NOT NULL DEFAULT 30 CHECK (rate_limit_per_minute >= 1),
  trust_tier integer NOT NULL DEFAULT 50 CHECK (trust_tier BETWEEN 0 AND 100),
  enabled boolean NOT NULL DEFAULT false,
  health_status text NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'failing', 'paused')),
  next_run_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aggregation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.aggregation_sources(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'manual',
  status public.aggregation_run_status_enum NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  fetched_count integer NOT NULL DEFAULT 0,
  parsed_count integer NOT NULL DEFAULT 0,
  normalized_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  suspicious_count integer NOT NULL DEFAULT 0,
  expired_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  error_summary text,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discovered_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_region_id text NOT NULL REFERENCES public.platform_regions(id) ON DELETE RESTRICT,
  primary_source_id uuid REFERENCES public.aggregation_sources(id) ON DELETE SET NULL,
  source_type public.aggregation_source_type_enum NOT NULL,
  source_name text NOT NULL,
  source_url text,
  original_job_url text,
  primary_external_job_id text,
  title text NOT NULL,
  company_name text,
  company_domain text,
  recruiter_email text,
  recruiter_phone text,
  location text,
  country text,
  city text,
  remote_type text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  currency text,
  description_raw text,
  description_clean text,
  apply_url text,
  posted_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  verification_status public.discovered_job_verification_enum NOT NULL DEFAULT 'discovered',
  claim_status public.discovered_job_claim_enum NOT NULL DEFAULT 'unclaimed',
  trust_score integer NOT NULL DEFAULT 0 CHECK (trust_score BETWEEN 0 AND 100),
  scam_score integer NOT NULL DEFAULT 0 CHECK (scam_score BETWEEN 0 AND 100),
  ingestion_status public.ingestion_status_enum NOT NULL DEFAULT 'review_required',
  dedupe_hash text,
  language text,
  tags text[] NOT NULL DEFAULT '{}',
  quality_flags_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  native_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  published_at timestamptz,
  hidden_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aggregation_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.aggregation_runs(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.aggregation_sources(id) ON DELETE CASCADE,
  external_job_id text,
  original_job_url text,
  source_payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  parse_status text NOT NULL DEFAULT 'parsed',
  parse_error text,
  raw_hash text,
  normalized_hash text,
  discovered_job_id uuid REFERENCES public.discovered_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discovered_job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_job_id uuid NOT NULL REFERENCES public.discovered_jobs(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.aggregation_sources(id) ON DELETE CASCADE,
  run_item_id uuid REFERENCES public.aggregation_run_items(id) ON DELETE SET NULL,
  external_job_id text,
  original_job_url text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_primary boolean NOT NULL DEFAULT false,
  source_confidence integer NOT NULL DEFAULT 50 CHECK (source_confidence BETWEEN 0 AND 100),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discovered_job_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_job_id uuid NOT NULL REFERENCES public.discovered_jobs(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status public.discovered_job_verification_enum,
  to_status public.discovered_job_verification_enum,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discovered_job_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_job_id uuid NOT NULL REFERENCES public.discovered_jobs(id) ON DELETE CASCADE,
  recruiter_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_email text,
  invite_phone text,
  invite_token_hash text,
  token_expires_at timestamptz,
  status public.discovered_job_claim_enum NOT NULL DEFAULT 'unclaimed',
  claim_evidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  conversion_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recruiter_outreach_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_job_id uuid REFERENCES public.discovered_jobs(id) ON DELETE SET NULL,
  company_name text,
  company_domain text,
  contact_email text,
  contact_phone text,
  matched_recruiter_id uuid REFERENCES public.recruiters(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'queued', 'contacted', 'responded', 'converted', 'closed')),
  channel text CHECK (channel IN ('email', 'phone', 'whatsapp', 'manual')),
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  response_status text CHECK (response_status IN ('unknown', 'positive', 'negative', 'no_response')),
  owner_admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.recruiter_profiles
  ADD COLUMN IF NOT EXISTS company_domains text[] NOT NULL DEFAULT '{}';

ALTER TABLE IF EXISTS public.jobs
  ADD COLUMN IF NOT EXISTS origin_type text NOT NULL DEFAULT 'native',
  ADD COLUMN IF NOT EXISTS source_attribution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS origin_discovered_job_id uuid REFERENCES public.discovered_jobs(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_origin_type_check'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_origin_type_check
      CHECK (origin_type IN ('native', 'admin_import', 'claimed_discovered'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_aggregation_sources_enabled_next_run
  ON public.aggregation_sources(enabled, next_run_at);

CREATE INDEX IF NOT EXISTS idx_aggregation_sources_region
  ON public.aggregation_sources(platform_region_id, enabled);

CREATE INDEX IF NOT EXISTS idx_aggregation_runs_source_status
  ON public.aggregation_runs(source_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aggregation_run_items_run_id
  ON public.aggregation_run_items(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_aggregation_run_items_discovered_job_id
  ON public.aggregation_run_items(discovered_job_id)
  WHERE discovered_job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_discovered_jobs_dedupe_hash
  ON public.discovered_jobs(dedupe_hash)
  WHERE dedupe_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_review_queue
  ON public.discovered_jobs(verification_status, ingestion_status, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_claim_queue
  ON public.discovered_jobs(claim_status, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_company_domain
  ON public.discovered_jobs(company_domain)
  WHERE company_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovered_jobs_native_job_id
  ON public.discovered_jobs(native_job_id)
  WHERE native_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discovered_job_sources_job_id
  ON public.discovered_job_sources(discovered_job_id, is_primary DESC, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovered_job_claims_status
  ON public.discovered_job_claims(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruiter_outreach_leads_status
  ON public.recruiter_outreach_leads(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_origin_type
  ON public.jobs(origin_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_origin_discovered_job_id
  ON public.jobs(origin_discovered_job_id)
  WHERE origin_discovered_job_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_aggregation_sources_touch_updated_at ON public.aggregation_sources;
CREATE TRIGGER trg_aggregation_sources_touch_updated_at
  BEFORE UPDATE ON public.aggregation_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_aggregation_runs_touch_updated_at ON public.aggregation_runs;
CREATE TRIGGER trg_aggregation_runs_touch_updated_at
  BEFORE UPDATE ON public.aggregation_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_discovered_jobs_touch_updated_at ON public.discovered_jobs;
CREATE TRIGGER trg_discovered_jobs_touch_updated_at
  BEFORE UPDATE ON public.discovered_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_discovered_job_sources_touch_updated_at ON public.discovered_job_sources;
CREATE TRIGGER trg_discovered_job_sources_touch_updated_at
  BEFORE UPDATE ON public.discovered_job_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_discovered_job_claims_touch_updated_at ON public.discovered_job_claims;
CREATE TRIGGER trg_discovered_job_claims_touch_updated_at
  BEFORE UPDATE ON public.discovered_job_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

DROP TRIGGER IF EXISTS trg_recruiter_outreach_leads_touch_updated_at ON public.recruiter_outreach_leads;
CREATE TRIGGER trg_recruiter_outreach_leads_touch_updated_at
  BEFORE UPDATE ON public.recruiter_outreach_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at_generic();

ALTER TABLE public.aggregation_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregation_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_job_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_job_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_outreach_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage aggregation_sources" ON public.aggregation_sources;
CREATE POLICY "Admin manage aggregation_sources" ON public.aggregation_sources
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access aggregation_sources" ON public.aggregation_sources;
CREATE POLICY "Service role full access aggregation_sources" ON public.aggregation_sources
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage aggregation_runs" ON public.aggregation_runs;
CREATE POLICY "Admin manage aggregation_runs" ON public.aggregation_runs
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access aggregation_runs" ON public.aggregation_runs;
CREATE POLICY "Service role full access aggregation_runs" ON public.aggregation_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage aggregation_run_items" ON public.aggregation_run_items;
CREATE POLICY "Admin manage aggregation_run_items" ON public.aggregation_run_items
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access aggregation_run_items" ON public.aggregation_run_items;
CREATE POLICY "Service role full access aggregation_run_items" ON public.aggregation_run_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage discovered_jobs" ON public.discovered_jobs;
CREATE POLICY "Admin manage discovered_jobs" ON public.discovered_jobs
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access discovered_jobs" ON public.discovered_jobs;
CREATE POLICY "Service role full access discovered_jobs" ON public.discovered_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage discovered_job_sources" ON public.discovered_job_sources;
CREATE POLICY "Admin manage discovered_job_sources" ON public.discovered_job_sources
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access discovered_job_sources" ON public.discovered_job_sources;
CREATE POLICY "Service role full access discovered_job_sources" ON public.discovered_job_sources
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage discovered_job_reviews" ON public.discovered_job_reviews;
CREATE POLICY "Admin manage discovered_job_reviews" ON public.discovered_job_reviews
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access discovered_job_reviews" ON public.discovered_job_reviews;
CREATE POLICY "Service role full access discovered_job_reviews" ON public.discovered_job_reviews
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage discovered_job_claims" ON public.discovered_job_claims;
CREATE POLICY "Admin manage discovered_job_claims" ON public.discovered_job_claims
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Recruiters manage their own discovered job claims" ON public.discovered_job_claims;
CREATE POLICY "Recruiters manage their own discovered job claims" ON public.discovered_job_claims
  FOR ALL
  USING (recruiter_user_id = auth.uid())
  WITH CHECK (recruiter_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access discovered_job_claims" ON public.discovered_job_claims;
CREATE POLICY "Service role full access discovered_job_claims" ON public.discovered_job_claims
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin manage recruiter_outreach_leads" ON public.recruiter_outreach_leads;
CREATE POLICY "Admin manage recruiter_outreach_leads" ON public.recruiter_outreach_leads
  FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Service role full access recruiter_outreach_leads" ON public.recruiter_outreach_leads;
CREATE POLICY "Service role full access recruiter_outreach_leads" ON public.recruiter_outreach_leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
