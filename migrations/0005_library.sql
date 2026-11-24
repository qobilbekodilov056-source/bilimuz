CREATE TABLE IF NOT EXISTS library_books (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  linked_card_slug TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS library_chapters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS library_books_pub ON library_books(published, subject, updated_at DESC);
CREATE INDEX IF NOT EXISTS library_books_tenant ON library_books(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS library_chapters_book ON library_chapters(book_id, position ASC);
