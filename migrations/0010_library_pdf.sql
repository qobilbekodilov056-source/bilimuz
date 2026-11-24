-- Kutubxona kitoblariga PDF fayl qo'llab-quvvatlashini qo'shish
ALTER TABLE library_books ADD COLUMN pdf_key TEXT NOT NULL DEFAULT '';
ALTER TABLE library_books ADD COLUMN pdf_name TEXT NOT NULL DEFAULT '';
ALTER TABLE library_books ADD COLUMN pdf_size INTEGER NOT NULL DEFAULT 0;
