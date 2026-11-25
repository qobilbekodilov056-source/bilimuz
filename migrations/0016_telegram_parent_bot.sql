CREATE TABLE IF NOT EXISTS student_telegram_links (
  student_id TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  linked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS student_tg_chat ON student_telegram_links(chat_id);
