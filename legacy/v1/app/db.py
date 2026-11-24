"""SQLite schema and bootstrap for a self-contained SysOne TestLab deployment."""
import os, json, secrets, hashlib, hmac, sqlite3, time
from pathlib import Path
from contextlib import contextmanager

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv('TESTLAB_DATA_DIR', str(ROOT / 'data')))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / 'testlab.sqlite3'

SCHEMA = '''
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS groups (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
 description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
 name TEXT NOT NULL, student_code TEXT UNIQUE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
 topic TEXT NOT NULL DEFAULT '', level TEXT NOT NULL, kind TEXT NOT NULL,
 code TEXT NOT NULL DEFAULT '', explanation TEXT NOT NULL DEFAULT '', points REAL NOT NULL DEFAULT 1,
 options_json TEXT NOT NULL, correct_json TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cards (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', mode TEXT NOT NULL DEFAULT 'auto',
 selected_json TEXT NOT NULL DEFAULT '[]', mix_json TEXT NOT NULL DEFAULT '{}',
 question_count INTEGER NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 20,
 pass_percent REAL NOT NULL DEFAULT 70, attempt_limit INTEGER NOT NULL DEFAULT 1,
 random_order INTEGER NOT NULL DEFAULT 1, shuffle_options INTEGER NOT NULL DEFAULT 1,
 show_results INTEGER NOT NULL DEFAULT 1, show_answers INTEGER NOT NULL DEFAULT 0,
 show_leaderboard INTEGER NOT NULL DEFAULT 1, access_mode TEXT NOT NULL DEFAULT 'open',
 pin_hash TEXT NOT NULL DEFAULT '', group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
 starts_at TEXT, ends_at TEXT, status TEXT NOT NULL DEFAULT 'draft',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attempts (
 id TEXT PRIMARY KEY, card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 student_name TEXT NOT NULL, student_code TEXT NOT NULL DEFAULT '',
 token_hash TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 submitted_at INTEGER, status TEXT NOT NULL DEFAULT 'active',
 score REAL NOT NULL DEFAULT 0, max_score REAL NOT NULL DEFAULT 0,
 percentage REAL NOT NULL DEFAULT 0, correct_count INTEGER NOT NULL DEFAULT 0,
 incorrect_count INTEGER NOT NULL DEFAULT 0, unanswered_count INTEGER NOT NULL DEFAULT 0,
 last_seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS attempt_questions (
 attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, question_id INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL, answer_json TEXT, spent_ms INTEGER NOT NULL DEFAULT 0,
 visit_count INTEGER NOT NULL DEFAULT 0, is_correct INTEGER, earned_points REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(attempt_id, position)
);
CREATE INDEX IF NOT EXISTS ix_attempts_card ON attempts(card_id, status);
CREATE INDEX IF NOT EXISTS ix_attempts_identity ON attempts(card_id, student_code, student_name);
CREATE INDEX IF NOT EXISTS ix_questions_category ON questions(category, level, archived);
'''

@contextmanager
def connect():
    db = sqlite3.connect(str(DB_PATH), timeout=15, check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    db.execute('PRAGMA busy_timeout = 5000')
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

def digest(s):
    return hashlib.sha256(s.encode('utf-8')).hexdigest()

def password_hash(password):
    salt = secrets.token_bytes(16)
    iterations = 310000
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations)
    return f'pbkdf2_sha256${iterations}${salt.hex()}${key.hex()}'

def password_verify(password, encoded):
    try:
        alg, iterations, salt, expected = encoded.split('$')
        if alg != 'pbkdf2_sha256':
            return False
        key = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(key, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False

def initialize():
    with connect() as db:
        db.executescript(SCHEMA)
        db.execute('PRAGMA journal_mode=WAL')
        found = db.execute('SELECT COUNT(*) FROM admins').fetchone()[0]
        if not found:
            email = os.getenv('TESTLAB_ADMIN_EMAIL', 'admin@sysone.local').lower().strip()
            password = os.getenv('TESTLAB_ADMIN_PASSWORD', '').strip()
            if not password:
                password = secrets.token_urlsafe(18)
                login_file = DATA_DIR / 'first-login.txt'
                login_file.write_text(f'SysOne TestLab birinchi kirish\nEmail: {email}\nPassword: {password}\n', encoding='utf-8')
                os.chmod(login_file, 0o600)
                print(f'[TestLab] Birinchi login paroli: {login_file}', flush=True)
            db.execute('INSERT INTO admins (email,name,password_hash) VALUES (?,?,?)',
                       (email, 'SysOne Administrator', password_hash(password)))
