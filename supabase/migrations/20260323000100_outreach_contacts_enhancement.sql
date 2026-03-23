-- Migration: Enhance contact extraction and recruiter outreach tracking
-- Adds contact columns to external_jobs, adds contact_whatsapp to discovered_jobs,
-- and adds recruiter_name + notes to recruiter_outreach_leads.

-- 1. Add contact columns to external_jobs (older pipeline)
ALTER TABLE external_jobs
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_whatsapp text;

-- 2. Add contact_* columns to discovered_jobs
--    (original schema only had recruiter_email / recruiter_phone;
--     ingestion + admin pages use contact_email / contact_phone)
ALTER TABLE discovered_jobs
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_whatsapp text,
  ADD COLUMN IF NOT EXISTS recruiter_name text;

-- 3. Backfill contact_email/phone from recruiter_email/phone where available
UPDATE discovered_jobs
  SET contact_email = recruiter_email
  WHERE recruiter_email IS NOT NULL AND contact_email IS NULL;

UPDATE discovered_jobs
  SET contact_phone = recruiter_phone
  WHERE recruiter_phone IS NOT NULL AND contact_phone IS NULL;

-- 4. Add helpful columns to recruiter_outreach_leads
ALTER TABLE recruiter_outreach_leads
  ADD COLUMN IF NOT EXISTS contact_whatsapp text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS seeker_count int DEFAULT 0;

-- 5. Create index for outreach queries (jobs with contacts)
CREATE INDEX IF NOT EXISTS idx_discovered_jobs_has_contact
  ON discovered_jobs (discovered_at DESC)
  WHERE contact_email IS NOT NULL OR contact_phone IS NOT NULL OR contact_whatsapp IS NOT NULL;

-- 6. Create index on outreach leads status
CREATE INDEX IF NOT EXISTS idx_outreach_leads_status
  ON recruiter_outreach_leads (status, created_at DESC);
