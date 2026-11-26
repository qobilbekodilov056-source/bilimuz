CREATE TABLE IF NOT EXISTS teacher_referrals (
  id TEXT PRIMARY KEY,
  referrer_tenant_id TEXT NOT NULL,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL UNIQUE,
  referred_email TEXT NOT NULL DEFAULT '',
  ref_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rewarded')),
  reward_days INTEGER NOT NULL DEFAULT 15,
  created_at INTEGER NOT NULL,
  rewarded_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_teacher_referrals_referrer ON teacher_referrals(referrer_tenant_id, status);
