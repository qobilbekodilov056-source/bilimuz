CREATE TABLE IF NOT EXISTS shop_items_custom (
  id TEXT PRIMARY KEY,
  slot TEXT NOT NULL CHECK(slot IN ('banner','frame','avatar','title')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 100,
  rarity TEXT NOT NULL DEFAULT 'rare' CHECK(rarity IN ('free','common','rare','epic','legendary')),
  image_key TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  title_text TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
