-- Bilim UZ: O'yinlar markazi (tashqi server / GitHub Pages o'yinlari katalogi)
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Viktorina',
  mode TEXT NOT NULL DEFAULT 'multiplayer' CHECK(mode IN ('solo','duel','team','multiplayer')),
  url TEXT NOT NULL,
  cover_url TEXT NOT NULL DEFAULT '',
  open_mode TEXT NOT NULL DEFAULT 'embed' CHECK(open_mode IN ('embed','newtab')),
  plays_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_active ON games(active, created_at DESC);
