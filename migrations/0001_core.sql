PRAGMA foreign_keys = ON;
CREATE TABLE users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, email_verified INTEGER NOT NULL DEFAULT 0,
 telegram_sub TEXT UNIQUE, display_name TEXT NOT NULL, workplace TEXT NOT NULL DEFAULT '',
 phone_e164 TEXT, phone_verified INTEGER NOT NULL DEFAULT 0,
 role TEXT NOT NULL DEFAULT 'teacher' CHECK(role IN ('teacher','platform_owner')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked','deleted')),
 mfa_secret TEXT, mfa_last_step INTEGER NOT NULL DEFAULT -1, terms_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE tenants (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id), slug TEXT UNIQUE NOT NULL,
 name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','blocked','deleted')),
 quotas_json TEXT NOT NULL DEFAULT '{"questions":10000,"students":2000}', created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX single_platform_owner ON users(role) WHERE role='platform_owner' AND status!='deleted';
CREATE TABLE tenant_memberships (
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('tenant_owner','tenant_staff')), status TEXT NOT NULL DEFAULT 'active',
 PRIMARY KEY(tenant_id,user_id)
);
CREATE TABLE sessions (
 id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE, csrf_hash TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('teacher','owner')), mfa_verified INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id,expires_at);
CREATE TABLE auth_tokens (
 id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE oidc_flows (
 state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL,
 terms_at INTEGER, phone_consent INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
);
CREATE TABLE rate_limits (key_hash TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rates_expiry ON rate_limits(expires_at);
CREATE TABLE groups (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL, normalized_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,normalized_name)
);
CREATE TABLE students (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 group_id TEXT, student_code TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,student_code),
 FOREIGN KEY(tenant_id,group_id) REFERENCES groups(tenant_id,id)
);
CREATE INDEX students_group ON students(tenant_id,group_id);
CREATE TABLE questions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 content_version INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL, category TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '',
 level TEXT NOT NULL CHECK(level IN ('easy','medium','hard','expert')), kind TEXT NOT NULL CHECK(kind IN ('single','multiple','truefalse','code')),
 content_json TEXT NOT NULL, fingerprint TEXT NOT NULL, provenance_json TEXT NOT NULL DEFAULT '{}', archived INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(tenant_id,id), UNIQUE(tenant_id,fingerprint)
);
CREATE INDEX questions_filter ON questions(tenant_id,archived,category,level);
CREATE TABLE question_versions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, question_id TEXT NOT NULL, version INTEGER NOT NULL,
 content_json TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(tenant_id,id), UNIQUE(tenant_id,question_id,version),
 FOREIGN KEY(tenant_id,question_id) REFERENCES questions(tenant_id,id) ON DELETE CASCADE
);
CREATE TRIGGER immutable_question_version BEFORE UPDATE ON question_versions BEGIN SELECT RAISE(ABORT,'immutable_version'); END;
CREATE TABLE cards (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL, settings_json TEXT NOT NULL, pin_hash TEXT, group_id TEXT,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','closed','archived')),
 published_version INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,group_id) REFERENCES groups(tenant_id,id)
);
CREATE INDEX cards_scope ON cards(tenant_id,status,created_at);
CREATE TABLE card_releases (
 tenant_id TEXT NOT NULL, card_id TEXT NOT NULL, version INTEGER NOT NULL,
 settings_json TEXT NOT NULL, published_at INTEGER NOT NULL, PRIMARY KEY(tenant_id,card_id,version),
 FOREIGN KEY(tenant_id,card_id) REFERENCES cards(tenant_id,id) ON DELETE CASCADE
);
CREATE TRIGGER immutable_card_release BEFORE UPDATE ON card_releases BEGIN SELECT RAISE(ABORT,'immutable_release'); END;
CREATE TABLE card_questions (
 tenant_id TEXT NOT NULL, card_id TEXT NOT NULL, card_version INTEGER NOT NULL,
 question_version_id TEXT NOT NULL, position INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,card_id,card_version,position),
 FOREIGN KEY(tenant_id,card_id,card_version) REFERENCES card_releases(tenant_id,card_id,version) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,question_version_id) REFERENCES question_versions(tenant_id,id)
);
CREATE TABLE attempts (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, card_id TEXT NOT NULL, card_version INTEGER NOT NULL, student_id TEXT,
 student_name TEXT NOT NULL, identity_hash TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, start_key_hash TEXT NOT NULL UNIQUE,
 started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, submitted_at INTEGER,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','submitted')),
 score REAL NOT NULL DEFAULT 0, max_score REAL NOT NULL DEFAULT 0, percentage REAL NOT NULL DEFAULT 0,
 correct_count INTEGER NOT NULL DEFAULT 0, incorrect_count INTEGER NOT NULL DEFAULT 0, unanswered_count INTEGER NOT NULL DEFAULT 0,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,card_id,card_version) REFERENCES card_releases(tenant_id,card_id,version),
 FOREIGN KEY(tenant_id,student_id) REFERENCES students(tenant_id,id)
);
CREATE INDEX attempts_card ON attempts(tenant_id,card_id,status,started_at);
CREATE INDEX attempts_identity ON attempts(tenant_id,card_id,identity_hash);
CREATE INDEX attempts_expiry ON attempts(status,expires_at);
CREATE TRIGGER attempt_admission BEFORE INSERT ON attempts BEGIN
 SELECT CASE WHEN (SELECT status FROM tenants WHERE id=NEW.tenant_id)!='active' THEN RAISE(ABORT,'tenant_blocked') END;
 SELECT CASE WHEN (SELECT status FROM cards WHERE tenant_id=NEW.tenant_id AND id=NEW.card_id)!='active' THEN RAISE(ABORT,'card_inactive') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM attempts WHERE tenant_id=NEW.tenant_id AND card_id=NEW.card_id AND identity_hash=NEW.identity_hash)
 >= (SELECT json_extract(settings_json,'$.attempt_limit') FROM card_releases WHERE tenant_id=NEW.tenant_id AND card_id=NEW.card_id AND version=NEW.card_version)
 THEN RAISE(ABORT,'attempt_limit') END;
END;
CREATE TABLE attempt_questions (
 tenant_id TEXT NOT NULL, attempt_id TEXT NOT NULL, position INTEGER NOT NULL, question_version_id TEXT NOT NULL,
 option_order_json TEXT NOT NULL, PRIMARY KEY(tenant_id,attempt_id,position),
 FOREIGN KEY(tenant_id,attempt_id) REFERENCES attempts(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,question_version_id) REFERENCES question_versions(tenant_id,id)
);
CREATE TABLE attempt_answers (
 tenant_id TEXT NOT NULL, attempt_id TEXT NOT NULL, position INTEGER NOT NULL, selected_json TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 0, active_time_ms INTEGER NOT NULL DEFAULT 0, saved_at INTEGER,
 is_correct INTEGER NOT NULL DEFAULT 0, earned_points REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,attempt_id,position),
 FOREIGN KEY(tenant_id,attempt_id,position) REFERENCES attempt_questions(tenant_id,attempt_id,position) ON DELETE CASCADE
);
CREATE TRIGGER answer_revision_collision BEFORE UPDATE ON attempt_answers WHEN NEW.revision=OLD.revision AND NEW.selected_json!=OLD.selected_json BEGIN SELECT RAISE(ABORT,'answer_revision_collision'); END;
CREATE TABLE import_jobs (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 uploaded_by TEXT NOT NULL REFERENCES users(id), filename TEXT NOT NULL, preview_key TEXT,
 status TEXT NOT NULL CHECK(status IN ('preview','committed')), preview_json TEXT NOT NULL,
 file_hash TEXT NOT NULL, result_json TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, UNIQUE(tenant_id,id)
);
CREATE INDEX imports_scope ON import_jobs(tenant_id,created_at);
CREATE TABLE store_submissions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, question_id TEXT NOT NULL, source_version INTEGER NOT NULL,
 content_json TEXT NOT NULL, fingerprint TEXT NOT NULL, consent_at INTEGER NOT NULL, license TEXT NOT NULL,
 attribution TEXT NOT NULL DEFAULT '', moderation_status TEXT NOT NULL DEFAULT 'pending'
 CHECK(moderation_status IN ('pending','approved','rejected','changes_requested','revoked')),
 reviewer_id TEXT REFERENCES users(id), reviewed_at INTEGER, reason TEXT NOT NULL DEFAULT '',
 UNIQUE(tenant_id,question_id,source_version), FOREIGN KEY(tenant_id,question_id) REFERENCES questions(tenant_id,id)
);
CREATE INDEX moderation_queue ON store_submissions(moderation_status,consent_at);
CREATE TABLE store_items (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL UNIQUE REFERENCES store_submissions(id), publication_version INTEGER NOT NULL,
 public_content_json TEXT NOT NULL, category TEXT NOT NULL, level TEXT NOT NULL, fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('approved','revoked')), published_at INTEGER NOT NULL
);
CREATE INDEX store_public ON store_items(status,category,level,published_at);
CREATE TABLE store_reports (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES store_items(id), reporter_user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open');
CREATE TABLE owner_audit_logs (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, timestamp INTEGER NOT NULL
);
CREATE INDEX owner_audit_time ON owner_audit_logs(timestamp);
CREATE TABLE auth_audit_logs (id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,ip_hash TEXT NOT NULL,timestamp INTEGER NOT NULL);
CREATE TABLE support_tickets (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), subject TEXT NOT NULL, message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', reply TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL,
 UNIQUE(tenant_id,id)
);
CREATE TABLE system_settings (key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
INSERT INTO system_settings VALUES('platform','{"support_email":"","support_telegram":"","maintenance":"","retention_days":365,"store_enabled":true}');
CREATE TABLE backup_manifest (id TEXT PRIMARY KEY,object_key TEXT NOT NULL,sha256 TEXT NOT NULL,created_at INTEGER NOT NULL,table_counts_json TEXT NOT NULL,format_version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE ops_metrics (day TEXT PRIMARY KEY,requests INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,rows_read INTEGER NOT NULL DEFAULT 0,rows_written INTEGER NOT NULL DEFAULT 0);

CREATE TRIGGER question_quota BEFORE INSERT ON questions WHEN (SELECT COUNT(*) FROM questions WHERE tenant_id=NEW.tenant_id)>=(SELECT json_extract(quotas_json,'$.questions') FROM tenants WHERE id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'quota_exceeded'); END;
CREATE TRIGGER student_quota BEFORE INSERT ON students WHEN (SELECT COUNT(*) FROM students WHERE tenant_id=NEW.tenant_id)>=(SELECT json_extract(quotas_json,'$.students') FROM tenants WHERE id=NEW.tenant_id) BEGIN SELECT RAISE(ABORT,'quota_exceeded'); END;
