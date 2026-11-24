import importlib.util
from pathlib import Path
import sqlite3
import json
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('migrate_v1', ROOT / 'scripts/migrate-v1.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)

@pytest.fixture
def legacy(tmp_path):
    spec = importlib.util.spec_from_file_location('legacy_schema', ROOT / 'legacy/v1/app/db.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    path = tmp_path / 'original.sqlite3'
    db = sqlite3.connect(path)
    db.executescript(module.SCHEMA)
    db.execute("INSERT INTO admins(email,name,password_hash) VALUES('legacy@example.test','Legacy Teacher','old-hash')")
    db.execute("INSERT INTO groups(name) VALUES('Legacy group')")
    db.execute("INSERT INTO students(name,student_code,group_id) VALUES('Legacy Student','OLD-001',1)")
    question = dict(title='Legacy savol matni?',category='Python',topic='Asoslar',level='easy',kind='single',code='',explanation='Izoh',points=1,options=[dict(id='a',text='Ha'),dict(id='b',text='Yo‘q')],correct=['a'])
    db.execute('INSERT INTO questions(title,category,topic,level,kind,options_json,correct_json) VALUES(?,?,?,?,?,?,?)',
               (question['title'],question['category'],question['topic'],question['level'],question['kind'],json.dumps(question['options']),json.dumps(question['correct'])))
    db.execute("INSERT INTO cards(slug,title,mode,selected_json,mix_json,question_count,status) VALUES('TL-LEGACY','Legacy Test','manual','[1]','{}',1,'closed')")
    db.execute("INSERT INTO attempts(id,card_id,student_name,student_code,token_hash,started_at,expires_at,submitted_at,status,score,max_score,percentage,correct_count) VALUES('legacy-attempt',1,'Legacy Student','OLD-001','revoked',100,1300,120,'submitted',1,1,100,1)")
    db.execute('INSERT INTO attempt_questions(attempt_id,position,question_id,snapshot_json,answer_json,is_correct,earned_points,spent_ms) VALUES(?,?,?,?,?,?,?,?)',('legacy-attempt',1,1,json.dumps(question),json.dumps(['a']),1,1,1234))
    db.commit();db.close()
    return path

def test_migration_preserves_data_scores_versions_and_revokes_legacy_sessions(legacy,tmp_path):
    original = legacy.read_bytes()
    result = migration.migrate(legacy,tmp_path/'converted','new-owner@example.test')
    assert legacy.read_bytes() == original
    target = sqlite3.connect(':memory:')
    target.executescript((ROOT/'migrations/0001_core.sql').read_text())
    target.executescript((tmp_path/'converted/migration.sql').read_text())
    assert target.execute('PRAGMA foreign_key_check').fetchall() == []
    assert target.execute('SELECT score,percentage,status FROM attempts').fetchone() == (1,100,'submitted')
    assert target.execute('SELECT active_time_ms FROM attempt_answers').fetchone()[0] == 1234
    assert target.execute('SELECT password_hash,email_verified,email FROM users').fetchone() == (None,0,'new-owner@example.test')
    assert target.execute('SELECT COUNT(*) FROM sessions').fetchone()[0] == 0
    assert result['source_counts']['attempts'] == result['target_counts']['attempts'] == 1
    assert result['source_counts']['questions'] == result['target_counts']['questions'] == 1

def test_active_sessions_require_safe_cutover_instead_of_silent_loss(legacy,tmp_path):
    db=sqlite3.connect(legacy);db.execute("UPDATE attempts SET status='active'");db.commit();db.close()
    with pytest.raises(ValueError,match='Active attempts'):
        migration.migrate(legacy,tmp_path/'blocked')
    assert not (tmp_path/'blocked').exists()

def test_migration_refuses_to_overwrite_a_prior_export(legacy,tmp_path):
    output=tmp_path/'exists';output.mkdir()
    with pytest.raises(ValueError,match='already exists'):
        migration.migrate(legacy,output)

def test_legacy_pin_cards_are_closed_until_a_fresh_supported_pin_is_set(legacy,tmp_path):
    import hashlib
    salt=b'legacy-test-salt'
    derived=hashlib.pbkdf2_hmac('sha256',b'4321',salt,310000)
    db=sqlite3.connect(legacy)
    db.execute("UPDATE cards SET access_mode='pin',pin_hash=?,status='active'",('pbkdf2_sha256$310000$'+salt.hex()+'$'+derived.hex(),))
    db.commit();db.close()
    result=migration.migrate(legacy,tmp_path/'pin-reset')
    assert result['pin_reset_cards']==['TL-LEGACY']
    target=sqlite3.connect(':memory:');target.executescript((ROOT/'migrations/0001_core.sql').read_text());target.executescript((tmp_path/'pin-reset/migration.sql').read_text())
    assert target.execute('SELECT status,pin_hash FROM cards').fetchone()==('closed',None)

def test_duplicate_legacy_questions_keep_card_positions_and_active_visibility(legacy,tmp_path):
    db=sqlite3.connect(legacy)
    db.execute('UPDATE questions SET archived=1 WHERE id=1')
    db.execute('INSERT INTO questions(title,category,topic,level,kind,options_json,correct_json,archived) SELECT title,category,topic,level,kind,options_json,correct_json,0 FROM questions WHERE id=1')
    db.execute("UPDATE cards SET selected_json='[1,2]',question_count=2")
    db.commit();db.close()
    result=migration.migrate(legacy,tmp_path/'duplicates')
    assert result['duplicate_questions']==1
    target=sqlite3.connect(':memory:');target.executescript((ROOT/'migrations/0001_core.sql').read_text());target.executescript((tmp_path/'duplicates/migration.sql').read_text())
    assert target.execute('SELECT COUNT(*) FROM card_questions').fetchone()[0]==2
    assert target.execute('SELECT archived FROM questions').fetchone()[0]==0
