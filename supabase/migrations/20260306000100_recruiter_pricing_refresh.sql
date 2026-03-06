-- =============================================================================
-- Migration: Recruiter pay-per-job pricing refresh
-- =============================================================================

-- Keep recruiter posting on two active pay-per-job tiers (15,000 and 50,000 XAF)
UPDATE pricing_plans
SET
  amount_xaf = 15000,
  updated_at = now()
WHERE slug = 'job_tier1_diy';

UPDATE pricing_plans
SET
  amount_xaf = 50000,
  updated_at = now()
WHERE slug = 'job_tier2_shortlist';

-- Featured add-on remains available for tier1 (15,000 XAF)
UPDATE pricing_plans
SET
  is_active = true,
  updated_at = now()
WHERE slug = 'job_tier1_featured';

-- Social Promotion add-on is retired
UPDATE pricing_plans
SET
  is_active = false,
  updated_at = now()
WHERE slug = 'job_tier1_social';
