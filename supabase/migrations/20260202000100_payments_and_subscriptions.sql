-- =============================================================================
-- Migration: Payment System, Pricing Plans, Promo Codes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pricing_plans — All plan definitions in one table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  role text NOT NULL CHECK (role IN ('job_seeker', 'talent', 'recruiter')),
  plan_type text NOT NULL CHECK (plan_type IN ('subscription', 'one_time', 'per_job')),
  amount_xaf integer NOT NULL CHECK (amount_xaf >= 0),
  duration_days integer, -- null for one-time / per-job
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. promo_codes — Admin-managed discount codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  max_uses integer, -- null = unlimited
  current_uses integer NOT NULL DEFAULT 0,
  min_amount numeric,
  max_discount numeric,
  applicable_plan_slugs text[], -- null = all plans
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure codes are always uppercase
CREATE OR REPLACE FUNCTION upper_promo_code() RETURNS trigger AS $$
BEGIN
  NEW.code := UPPER(TRIM(NEW.code));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_upper_promo_code
  BEFORE INSERT OR UPDATE ON promo_codes
  FOR EACH ROW EXECUTE FUNCTION upper_promo_code();

-- ---------------------------------------------------------------------------
-- 3. promo_code_redemptions — Track who used which code
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id),
  user_id uuid NOT NULL REFERENCES profiles(id),
  transaction_id uuid NOT NULL REFERENCES transactions(id),
  discount_applied numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promo_code_id, user_id)
);

-- ---------------------------------------------------------------------------
-- 4. Alter transactions — Add payment-specific columns
-- ---------------------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES pricing_plans(id),
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES promo_codes(id),
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES jobs(id),
  ADD COLUMN IF NOT EXISTS payment_phone text,
  ADD COLUMN IF NOT EXISTS provider_reference text,
  ADD COLUMN IF NOT EXISTS callback_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS original_amount numeric,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. Alter subscriptions — Add plan & transaction references
-- ---------------------------------------------------------------------------
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES pricing_plans(id),
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 6. Alter jobs — Add hiring tier columns
-- ---------------------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS hiring_tier text CHECK (hiring_tier IN ('tier1_diy', 'tier2_shortlist', 'tier3_managed', 'tier4_partner')),
  ADD COLUMN IF NOT EXISTS tier_transaction_id uuid REFERENCES transactions(id),
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS social_promotion boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 7. Seed pricing plans
-- ---------------------------------------------------------------------------
INSERT INTO pricing_plans (slug, name, description, role, plan_type, amount_xaf, duration_days, features, sort_order) VALUES
  -- Job Seeker plans
  ('js_monthly', 'Monthly Premium', 'Full access for 1 month', 'job_seeker', 'subscription', 4000, 30,
   '["Unlimited AI resume optimization", "Premium resume templates & PDF download", "AI interview simulation", "Priority application visibility"]'::jsonb, 1),
  ('js_quarterly', 'Quarterly Premium', 'Full access for 3 months', 'job_seeker', 'subscription', 10000, 90,
   '["Unlimited AI resume optimization", "Premium resume templates & PDF download", "AI interview simulation", "Priority application visibility"]'::jsonb, 2),
  ('js_biannual', 'Biannual Premium', 'Full access for 6 months', 'job_seeker', 'subscription', 15000, 180,
   '["Unlimited AI resume optimization", "Premium resume templates & PDF download", "AI interview simulation", "Priority application visibility"]'::jsonb, 3),

  -- Talent plans
  ('talent_monthly', 'Monthly Talent', 'Talent access for 1 month', 'talent', 'subscription', 3000, 30,
   '["Advanced course access (Skill Up)", "AI career counselling", "Portfolio boost / featured profile", "Certificate verification fast-track"]'::jsonb, 4),
  ('talent_quarterly', 'Quarterly Talent', 'Talent access for 3 months', 'talent', 'subscription', 7500, 90,
   '["Advanced course access (Skill Up)", "AI career counselling", "Portfolio boost / featured profile", "Certificate verification fast-track"]'::jsonb, 5),
  ('talent_biannual', 'Biannual Talent', 'Talent access for 6 months', 'talent', 'subscription', 12000, 180,
   '["Advanced course access (Skill Up)", "AI career counselling", "Portfolio boost / featured profile", "Certificate verification fast-track"]'::jsonb, 6),

  -- Recruiter verification tiers
  ('recruiter_basic', 'Basic Recruiter', 'Post jobs, view applicants', 'recruiter', 'one_time', 5000, NULL,
   '["Post jobs", "View applicants", "Basic search"]'::jsonb, 7),
  ('recruiter_trusted', 'Trusted Recruiter', 'Priority review, higher limits (yearly)', 'recruiter', 'subscription', 15000, 365,
   '["Priority review", "Higher job posting limits", "Advanced search", "Analytics dashboard"]'::jsonb, 8),
  ('recruiter_premium', 'Premium Recruiter', 'Featured badge, managed hiring access (yearly)', 'recruiter', 'subscription', 50000, 365,
   '["Featured recruiter badge", "Managed hiring access", "Dedicated support", "Unlimited postings", "Advanced analytics"]'::jsonb, 9),

  -- Per-job hiring tiers
  ('job_tier1_diy', 'DIY Posting', 'Post and manage your job listing', 'recruiter', 'per_job', 10000, NULL,
   '["Job listing for 30 days", "Applicant management", "Basic analytics"]'::jsonb, 10),
  ('job_tier1_featured', 'Featured Add-on', 'Feature your job listing', 'recruiter', 'per_job', 5000, NULL,
   '["Featured placement", "Highlighted listing"]'::jsonb, 11),
  ('job_tier1_social', 'Social Promotion Add-on', 'Promote on social media', 'recruiter', 'per_job', 5000, NULL,
   '["Social media promotion", "Extended reach"]'::jsonb, 12),
  ('job_tier2_shortlist', 'Shortlist Service', 'We screen and shortlist candidates', 'recruiter', 'per_job', 50000, NULL,
   '["Candidate screening", "Shortlist delivery", "Interview scheduling support"]'::jsonb, 13)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------

-- pricing_plans: Public read for active plans, admin full access
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active pricing plans"
  ON pricing_plans FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage pricing plans"
  ON pricing_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.admin_type IN ('super', 'operations')
    )
  );

-- promo_codes: Admin full access only (validation via function, not direct select)
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage promo codes"
  ON promo_codes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.admin_type IN ('super', 'operations')
    )
  );

-- Service role can access promo_codes (for validation in API routes)
CREATE POLICY "Service role can access promo codes"
  ON promo_codes FOR SELECT
  USING (auth.role() = 'service_role');

-- promo_code_redemptions: Users see own, admin sees all, service role insert
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions"
  ON promo_code_redemptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all redemptions"
  ON promo_code_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.admin_type IN ('super', 'operations')
    )
  );

CREATE POLICY "Service role can insert redemptions"
  ON promo_code_redemptions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- transactions: Ensure users see own + admin sees all + service role can insert/update
-- (May already exist from initial migration, so use IF NOT EXISTS pattern)
DO $$
BEGIN
  -- Drop existing transaction policies if they conflict, then re-create
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Users can view own transactions v2'
  ) THEN
    CREATE POLICY "Users can view own transactions v2"
      ON transactions FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Admins can view all transactions v2'
  ) THEN
    CREATE POLICY "Admins can view all transactions v2"
      ON transactions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.admin_type IN ('super', 'operations')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Service role can manage transactions'
  ) THEN
    CREATE POLICY "Service role can manage transactions"
      ON transactions FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- subscriptions: Users see own + admin sees all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Users can view own subscriptions v2'
  ) THEN
    CREATE POLICY "Users can view own subscriptions v2"
      ON subscriptions FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Admins can view all subscriptions v2'
  ) THEN
    CREATE POLICY "Admins can view all subscriptions v2"
      ON subscriptions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
            AND profiles.admin_type IN ('super', 'operations')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Service role can manage subscriptions'
  ) THEN
    CREATE POLICY "Service role can manage subscriptions"
      ON subscriptions FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Helper Functions
-- ---------------------------------------------------------------------------

-- check_active_subscription: Returns true if user has active sub for given role
CREATE OR REPLACE FUNCTION check_active_subscription(p_user_id uuid, p_role text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM subscriptions s
    JOIN pricing_plans p ON p.id = s.plan_id
    WHERE s.user_id = p_user_id
      AND p.role = p_role
      AND s.status = 'active'
      AND s.end_date >= CURRENT_DATE
  );
END;
$$;

-- validate_promo_code: Returns jsonb with validation result
CREATE OR REPLACE FUNCTION validate_promo_code(p_code text, p_plan_slug text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_promo promo_codes%ROWTYPE;
  v_plan pricing_plans%ROWTYPE;
  v_already_used boolean;
BEGIN
  -- Find the promo code
  SELECT * INTO v_promo
  FROM promo_codes
  WHERE code = UPPER(TRIM(p_code))
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Promo code not found or inactive');
  END IF;

  -- Check date range
  IF v_promo.starts_at > now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Promo code is not yet active');
  END IF;

  IF v_promo.expires_at IS NOT NULL AND v_promo.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Promo code has expired');
  END IF;

  -- Check usage limit
  IF v_promo.max_uses IS NOT NULL AND v_promo.current_uses >= v_promo.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Promo code usage limit reached');
  END IF;

  -- Check plan applicability
  IF v_promo.applicable_plan_slugs IS NOT NULL AND p_plan_slug IS NOT NULL THEN
    IF NOT (p_plan_slug = ANY(v_promo.applicable_plan_slugs)) THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Promo code does not apply to this plan');
    END IF;
  END IF;

  -- Check if user already used this code
  SELECT EXISTS (
    SELECT 1 FROM promo_code_redemptions
    WHERE promo_code_id = v_promo.id AND user_id = p_user_id
  ) INTO v_already_used;

  IF v_already_used THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'You have already used this promo code');
  END IF;

  -- Check min amount if plan specified
  IF p_plan_slug IS NOT NULL AND v_promo.min_amount IS NOT NULL THEN
    SELECT * INTO v_plan FROM pricing_plans WHERE slug = p_plan_slug AND is_active = true;
    IF FOUND AND v_plan.amount_xaf < v_promo.min_amount THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'Plan amount is below minimum for this promo code');
    END IF;
  END IF;

  -- Valid
  RETURN jsonb_build_object(
    'valid', true,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'max_discount', v_promo.max_discount,
    'promo_code_id', v_promo.id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Indexes for performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_pricing_plans_role ON pricing_plans(role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_plans_slug ON pricing_plans(slug);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_provider_ref ON transactions(provider_reference);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active ON subscriptions(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_promo_code_redemptions_user ON promo_code_redemptions(user_id);

-- ---------------------------------------------------------------------------
-- 11. Updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pricing_plans_updated_at') THEN
    CREATE TRIGGER trg_pricing_plans_updated_at
      BEFORE UPDATE ON pricing_plans
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_promo_codes_updated_at') THEN
    CREATE TRIGGER trg_promo_codes_updated_at
      BEFORE UPDATE ON promo_codes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
