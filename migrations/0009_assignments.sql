-- Bilim UZ: O'qituvchi vazifalari va o'quvchi topshiriqlari
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  group_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'text' CHECK(kind IN ('text','link','image','file','test')),
  linked_card_slug TEXT NOT NULL DEFAULT '',
  max_score INTEGER NOT NULL DEFAULT 100,
  due_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  answer_link TEXT NOT NULL DEFAULT '',
  file_key TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','graded','returned')),
  score INTEGER,
  feedback TEXT NOT NULL DEFAULT '',
  submitted_at INTEGER NOT NULL,
  graded_at INTEGER,
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON assignments(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignments_group ON assignments(tenant_id, group_id);
CREATE INDEX IF NOT EXISTS idx_asub_assignment ON assignment_submissions(assignment_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_asub_student ON assignment_submissions(tenant_id, student_id);
