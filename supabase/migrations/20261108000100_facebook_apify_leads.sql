-- Facebook via Apify: run ledger + recruiter leads from business Pages.
--
-- apify_runs        one row per actor run Joblinca starts; the webhook marks it
--                   processed so Apify's retries never double-process a run.
-- facebook_page_leads  business Pages (recruitment agencies, hiring companies)
--                   found by the weekly search. Business contact details only;
--                   personal profiles are never collected.
--
-- Both tables are server-only: RLS on with no client policies, and client
-- grants revoked, so only the service role (cron, webhook, admin API) can
-- read or write them.

CREATE TABLE IF NOT EXISTS public.apify_runs (
  run_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('fb_groups', 'fb_search', 'fb_pages')),
  actor text NOT NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'started'
    CHECK (status IN ('started', 'processing', 'processed', 'failed')),
  items_received integer,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_apify_runs_kind_started
  ON public.apify_runs (kind, started_at DESC);

CREATE TABLE IF NOT EXISTS public.facebook_page_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_url text NOT NULL UNIQUE,
  page_id text,
  name text NOT NULL,
  categories text[] NOT NULL DEFAULT '{}',
  intro text,
  email text,
  phone text,
  whatsapp text,
  website text,
  address text,
  followers integer,
  recruiter_signal boolean NOT NULL DEFAULT false,
  search_keyword text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'responded', 'converted', 'not_relevant')),
  notes text,
  source_run_id text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facebook_page_leads_status
  ON public.facebook_page_leads (status, recruiter_signal DESC, first_seen_at DESC);

ALTER TABLE public.apify_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_page_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.apify_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.facebook_page_leads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.apify_runs TO service_role;
GRANT ALL ON public.facebook_page_leads TO service_role;

COMMENT ON TABLE public.apify_runs IS 'Apify actor runs started by Joblinca; webhook processing ledger';
COMMENT ON TABLE public.facebook_page_leads IS 'Recruiter leads from public Facebook business Pages (no personal profiles)';
