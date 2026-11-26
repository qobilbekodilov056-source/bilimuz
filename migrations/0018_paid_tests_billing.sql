-- Pullik IELTS / DTM / Attestatsiya test kartalari va 24/7 P2P buyurtmalar
ALTER TABLE cards ADD COLUMN price_uzs INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS test_card_orders (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  card_slug TEXT NOT NULL,
  buyer_name TEXT NOT NULL DEFAULT '',
  buyer_phone TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,
  unique_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'rejected')),
  unlock_token TEXT NOT NULL,
  tx_note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_test_orders_match ON test_card_orders(status, unique_amount, expires_at);
CREATE INDEX IF NOT EXISTS idx_test_orders_card ON test_card_orders(card_id, unlock_token, status);
