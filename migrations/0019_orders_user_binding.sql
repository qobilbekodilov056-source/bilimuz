-- Kitob va test xaridlarini foydalanuvchi akkauntiga (user_id) bog‘lash
ALTER TABLE library_book_orders ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE test_card_orders ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_book_orders_user ON library_book_orders(user_id, book_id, status);
CREATE INDEX IF NOT EXISTS idx_test_orders_user ON test_card_orders(user_id, card_id, status);
