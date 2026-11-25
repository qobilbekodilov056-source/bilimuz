CREATE TABLE IF NOT EXISTS student_cosmetics (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  equipped_banner TEXT NOT NULL DEFAULT 'default_navy',
  equipped_frame TEXT NOT NULL DEFAULT 'none',
  equipped_avatar TEXT NOT NULL DEFAULT 'initials',
  equipped_title TEXT NOT NULL DEFAULT '',
  owned_json TEXT NOT NULL DEFAULT '[]',
  spent_coins INTEGER NOT NULL DEFAULT 0,
  bonus_coins INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_checkin_date TEXT NOT NULL DEFAULT '',
  daily_quests_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
