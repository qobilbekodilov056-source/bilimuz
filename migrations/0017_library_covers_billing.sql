-- Kitob muqovalari (yengil WebP R2), narxlash (Owner billing) va kitob xaridlari
ALTER TABLE library_books ADD COLUMN cover_key TEXT NOT NULL DEFAULT '';
ALTER TABLE library_books ADD COLUMN price_uzs INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS library_book_orders (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_book_orders_match ON library_book_orders(status, unique_amount, expires_at);
CREATE INDEX IF NOT EXISTS idx_book_orders_book ON library_book_orders(book_id, unlock_token, status);
