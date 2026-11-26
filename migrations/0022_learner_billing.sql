-- Abituriyent / O‘quvchi alohida tariflari, buyurtmalari va test natijalari tarixi
CREATE TABLE IF NOT EXISTS learner_plans (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free', 'learner_books', 'learner_pro')),
  expires_at INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_billing_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK(plan IN ('learner_books', 'learner_pro')),
  months INTEGER NOT NULL DEFAULT 1,
  base_amount INTEGER NOT NULL,
  unique_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'expired', 'rejected')),
  tx_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_learner_orders_match ON learner_billing_orders(status, unique_amount, expires_at);
CREATE INDEX IF NOT EXISTS idx_learner_orders_user ON learner_billing_orders(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS learner_test_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_slug TEXT NOT NULL,
  card_title TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 0,
  percentage REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learner_history_user ON learner_test_history(user_id, created_at DESC);
