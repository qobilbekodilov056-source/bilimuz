CREATE TABLE IF NOT EXISTS platform_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  permissions_json TEXT NOT NULL DEFAULT '["moderation","store","library","support"]',
  assigned_by TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
