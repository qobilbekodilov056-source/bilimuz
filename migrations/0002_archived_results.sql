CREATE TABLE IF NOT EXISTS archived_results (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  card_title TEXT NOT NULL,
  card_slug TEXT NOT NULL,
  card_category TEXT NOT NULL DEFAULT '',
  pass_percent REAL NOT NULL DEFAULT 70,
  student_name TEXT NOT NULL,
  score REAL NOT NULL,
  max_score REAL NOT NULL,
  percentage REAL NOT NULL,
  passed INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  incorrect_count INTEGER NOT NULL,
  unanswered_count INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  archived_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS archived_results_scope ON archived_results(tenant_id, archived_at DESC);
