-- Migration: Revenue & Retention features
-- Adds: job boost/bump, referral rewards, subscription renewal tracking

-- ─── Job Boost/Bump ─────────────────────────────────────────────────────────
-- boost_until: when set and in the future, the job is "boosted" (sorted first)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS boost_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_jobs_boost_until ON jobs (boost_until)
  WHERE boost_until IS NOT NULL;

-- ─── Referral Rewards ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reward_type text NOT NULL DEFAULT 'subscription_days',
  reward_value integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'pending',
  granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards (referrer_id);

-- RLS
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral rewards"
  ON referral_rewards FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Service role manages referral rewards"
  ON referral_rewards FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Subscription Renewal Tracking ──────────────────────────────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_attempts integer DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_renewal_attempt_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_failure_reason text;

-- ─── Notifications Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications (user_id, read, created_at DESC);

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON user_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON user_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Service role manages notifications"
  ON user_notifications FOR ALL
  USING (auth.role() = 'service_role');
