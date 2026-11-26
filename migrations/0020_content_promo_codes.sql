-- Kitoblar va Pullik Testlar uchun Promokodlar (skidka % / so'm yoki 100% bepul)
CREATE TABLE IF NOT EXISTS content_promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL DEFAULT 'all' CHECK(target_type IN ('all', 'book', 'test')),
  target_id TEXT NOT NULL DEFAULT '',
  discount_percent INTEGER NOT NULL DEFAULT 100,
  discount_uzs INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 50,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_promo_code_lookup ON content_promo_codes(code, status);
