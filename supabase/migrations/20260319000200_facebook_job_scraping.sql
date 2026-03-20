-- Facebook job group monitoring and raw post storage.
-- Supports the Apify webhook → LLM extraction pipeline.

-- Monitored Facebook groups
CREATE TABLE IF NOT EXISTS facebook_job_groups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL UNIQUE,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  enabled boolean NOT NULL DEFAULT true,
  last_scraped_at timestamptz,
  post_count integer DEFAULT 0,
  job_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed with default groups
INSERT INTO facebook_job_groups (url, name, language) VALUES
  ('https://www.facebook.com/groups/305613197515850/', 'Job Opportunities in Cameroon', 'en'),
  ('https://www.facebook.com/groups/1931632440309708/', 'Offres d''emploi à Yaoundé', 'fr'),
  ('https://www.facebook.com/groups/374207869423832/', 'Offres d''emploi à Douala et au Cameroun', 'fr'),
  ('https://www.facebook.com/groups/2577280869082065/', 'Skilled and unskilled jobs opportunities in Cameroon', 'en')
ON CONFLICT (url) DO NOTHING;

-- Raw Facebook posts (stored before LLM extraction)
CREATE TABLE IF NOT EXISTS facebook_raw_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id text NOT NULL UNIQUE,
  text text NOT NULL DEFAULT '',
  url text,
  posted_at text,
  group_name text,
  group_url text,
  author text,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  image_urls jsonb DEFAULT '[]'::jsonb,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  extracted_job_id text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_facebook_raw_posts_processed
  ON facebook_raw_posts (processed) WHERE processed = false;

CREATE INDEX IF NOT EXISTS idx_facebook_raw_posts_group
  ON facebook_raw_posts (group_name);

CREATE INDEX IF NOT EXISTS idx_facebook_raw_posts_created
  ON facebook_raw_posts (created_at DESC);

-- RLS: service role only (no user-facing access)
ALTER TABLE facebook_job_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_raw_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY facebook_job_groups_service_role ON facebook_job_groups
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY facebook_raw_posts_service_role ON facebook_raw_posts
  FOR ALL USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE facebook_job_groups IS 'Monitored Facebook groups for job scraping via Apify';
COMMENT ON TABLE facebook_raw_posts IS 'Raw Facebook posts before LLM extraction into external_jobs';
COMMENT ON COLUMN facebook_raw_posts.processed IS 'True after LLM extraction has been attempted';
COMMENT ON COLUMN facebook_raw_posts.extracted_job_id IS 'Links to external_jobs.external_id if a job was extracted';
