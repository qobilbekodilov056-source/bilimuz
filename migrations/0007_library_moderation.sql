ALTER TABLE library_books ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'pending';
UPDATE library_books SET moderation_status='approved' WHERE published=1;
CREATE INDEX IF NOT EXISTS library_books_mod ON library_books(moderation_status, updated_at DESC);
