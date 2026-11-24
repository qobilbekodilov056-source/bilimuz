CREATE TABLE IF NOT EXISTS group_schedules (
  tenant_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  days_json TEXT NOT NULL DEFAULT '[1,3,5]',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(tenant_id, group_id),
  FOREIGN KEY(tenant_id, group_id) REFERENCES groups(tenant_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attendance_records (
  tenant_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  lesson_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','late','excused')),
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(tenant_id, group_id, student_id, lesson_date),
  FOREIGN KEY(tenant_id, group_id) REFERENCES groups(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id, student_id) REFERENCES students(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS attendance_month ON attendance_records(tenant_id, group_id, lesson_date);
