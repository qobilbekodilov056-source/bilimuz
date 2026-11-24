ALTER TABLE cards ADD COLUMN market_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE cards ADD COLUMN market_solves INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN market_score_sum REAL NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS card_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  score_percent REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS card_comments_card ON card_comments(card_id, created_at DESC);
