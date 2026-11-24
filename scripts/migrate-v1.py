#!/usr/bin/env python3
"""Offline, repeatable v1 SQLite -> v2 D1 SQL. Never opens the source writable.

Requires a quiet cutover: active attempts must finish on v1 first. Existing
teacher passwords/sessions are revoked, and email recovery is required on v2.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]

def compact(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))

def quote(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def migrate(source, output, email=None):
    source = Path(source).resolve()
    output = Path(output).resolve()
    if output.exists(): raise ValueError('Output already exists; choose a new directory')
    if not source.is_file(): raise ValueError('Source SQLite not found')
    src = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
    src.row_factory = sqlite3.Row
    if src.execute('PRAGMA integrity_check').fetchone()[0] != 'ok': raise ValueError('Source integrity check failed')
    if src.execute("SELECT COUNT(*) FROM attempts WHERE status='active'").fetchone()[0]:
        raise ValueError('Active attempts exist. Finish them on v1 before cutover; no active session is silently discarded.')
    output.mkdir(parents=True, mode=0o700)
    backup_path = output / 'v1-consistent-backup.sqlite3'
    backup = sqlite3.connect(backup_path)
    src.backup(backup)
    backup.close()
    os.chmod(backup_path, 0o600)
    tick = int(time.time())
    tid = str(uuid.uuid5(uuid.NAMESPACE_URL, 'sysone-testlab-v1:' + hashlib.sha256(backup_path.read_bytes()).hexdigest()))
    uid = lambda kind, old: str(uuid.uuid5(uuid.UUID(tid), f'{kind}:{old}'))
    statements = ['PRAGMA foreign_keys=ON;']
    counts = {}
    def put(table, record):
        statements.append(f"INSERT INTO {table}({','.join(record)}) VALUES({','.join(quote(v) for v in record.values())});")
        counts[table] = counts.get(table, 0) + 1
    def allrows(table): return [dict(r) for r in src.execute(f'SELECT * FROM {table}')]
    admins = allrows('admins')
    if not admins: raise ValueError('No legacy admin exists')
    for i, admin in enumerate(admins):
        put('users', dict(id=uid('user', admin['id']), email=(email if i == 0 and email else admin['email']).lower(),
                         display_name=admin['name'], password_hash=None, email_verified=0, terms_at=tick, created_at=tick))
    put('tenants', dict(id=tid, owner_user_id=uid('user', admins[0]['id']), slug='legacy-' + tid[:12], name='SysOne TestLab — avvalgi workspace', created_at=tick))
    for i, admin in enumerate(admins):
        put('tenant_memberships', dict(tenant_id=tid, user_id=uid('user', admin['id']), role='tenant_owner' if i == 0 else 'tenant_staff'))
    for g in allrows('groups'):
        put('groups', dict(id=uid('group', g['id']), tenant_id=tid, name=g['name'], normalized_name=g['name'].strip().lower(), description=g['description'], created_at=tick))
    for s in allrows('students'):
        put('students', dict(id=uid('student', s['id']), tenant_id=tid, group_id=uid('group', s['group_id']) if s['group_id'] else None,
                             student_code=s['student_code'] or f'LEGACY-{s["id"]}', name=s['name'], created_at=tick))
    oldqs = {x['id']: x for x in allrows('questions')}
    aliases, seen, versions, version_numbers = {}, {}, {}, {}
    def content(q, snapshot=False):
        return dict(title=q['title'], category=q['category'], topic=q.get('topic', ''), level=q['level'], kind=q['kind'],
                    code=q.get('code', ''), explanation=q.get('explanation', ''), points=int(q.get('points', 1)) if float(q.get('points',1)).is_integer() else float(q['points']),
                    options=[dict(id=o['id'],text=o['text']) for o in sorted(q['options'] if snapshot else json.loads(q['options_json']), key=lambda o:o['id'])],
                    correct=sorted(q['correct'] if snapshot else json.loads(q['correct_json'])))
    def version(question_id, c):
        key = (question_id, compact(c))
        if key not in versions:
            n = version_numbers.get(question_id, 0) + 1
            version_numbers[question_id] = n
            vid = uid('version', question_id + ':' + str(n))
            versions[key] = vid
            put('question_versions', dict(id=vid, tenant_id=tid, question_id=question_id, version=n, content_json=compact(c), created_at=tick))
        return versions[key]
    for oldid, q in oldqs.items():
        c = content(q)
        fingerprint = hashlib.sha256(compact(c).encode()).hexdigest()
        if fingerprint in seen:
            aliases[oldid] = seen[fingerprint]
            if not q['archived']:
                statements.append("UPDATE questions SET archived=0 WHERE id=" + quote(aliases[oldid]) + ";")
            continue
        qid = uid('question', oldid)
        seen[fingerprint] = qid
        aliases[oldid] = qid
        put('questions', dict(id=qid, tenant_id=tid, title=c['title'], category=c['category'], topic=c['topic'], level=c['level'], kind=c['kind'],
                              content_json=compact(c), fingerprint=fingerprint, archived=q['archived'], created_at=tick, updated_at=tick))
        version(qid, c)
    cards = allrows('cards')
    pin_reset_cards = []
    for c in cards:
        settings = {key:c[key] for key in ['title','description','category','mode','question_count','duration_minutes','pass_percent','attempt_limit','access_mode']}
        settings.update(topic='', selected_ids=[aliases[x] for x in json.loads(c['selected_json']) if x in aliases],
                        mix=json.loads(c['mix_json']), group_id=uid('group', c['group_id']) if c['group_id'] else None, pin='')
        for k in ['random_order','shuffle_options','show_results','show_answers','show_leaderboard']: settings[k] = bool(c[k])
        from datetime import datetime, timezone
        def epoch(value):
            if not value: return None
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return int((dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).timestamp())
        settings.update(starts_at=epoch(c['starts_at']), ends_at=epoch(c['ends_at']))
        # PIN hashes use the legacy hex format; convert the encoding without
        # changing the derived key. All teacher login hashes are still revoked.
        ph = c['pin_hash'] or None
        if ph:
            import base64
            alg, n, salt, key = ph.split('$')
            if int(n) > 100000:
                # Cloudflare WebCrypto caps PBKDF2 iterations. The plaintext PIN
                # cannot be recovered from a legacy hash; require a fresh PIN.
                ph = None
                pin_reset_cards.append(c['slug'])
            else:
                ph = '$'.join([alg, n, base64.b64encode(bytes.fromhex(salt)).decode(), base64.b64encode(bytes.fromhex(key)).decode()])
        cid = uid('card', c['id'])
        put('cards', dict(id=cid, tenant_id=tid, slug=c['slug'], title=c['title'], settings_json=compact(settings), pin_hash=ph,
                          group_id=settings['group_id'], status='closed' if c['slug'] in pin_reset_cards else c['status'], published_version=1, created_at=tick, updated_at=tick))
        put('card_releases', dict(tenant_id=tid, card_id=cid, version=1, settings_json=compact(settings), published_at=tick))
        candidates = json.loads(c['selected_json']) if c['mode'] == 'manual' else [x for x,q in oldqs.items() if not q['archived'] and (not c['category'] or q['category'] == c['category'])]
        used = set()
        pos = 0
        for oldid in candidates:
            qid = aliases.get(oldid)
            if not qid or (c['mode'] != 'manual' and qid in used): continue
            used.add(qid); pos += 1
            put('card_questions', dict(tenant_id=tid, card_id=cid, card_version=1, question_version_id=version(qid, content(oldqs[oldid])), position=pos))
    for a in allrows('attempts'):
        student = src.execute('SELECT id FROM students WHERE student_code=?', (a['student_code'],)).fetchone() if a['student_code'] else None
        sid = uid('student', student['id']) if student else None
        identity = ('student:' + sid) if sid else 'guest:' + a['student_name'].strip().lower()
        aid = a['id']
        # Historical attempts remain in analytics; old bearer sessions are revoked.
        put('attempts', dict(id=aid, tenant_id=tid, card_id=uid('card', a['card_id']), card_version=1, student_id=sid,
                             student_name=a['student_name'], identity_hash=hashlib.sha256(identity.encode()).hexdigest(),
                             token_hash=hashlib.sha256(('revoked:' + aid).encode()).hexdigest(), start_key_hash=hashlib.sha256(('legacy:' + aid).encode()).hexdigest(),
                             **{k:a[k] for k in ['started_at','expires_at','submitted_at','status','score','max_score','percentage','correct_count','incorrect_count','unanswered_count']}))
        for aq in src.execute('SELECT * FROM attempt_questions WHERE attempt_id=? ORDER BY position', (aid,)):
            snap = json.loads(aq['snapshot_json'])
            qid = aliases.get(aq['question_id'])
            if not qid: raise ValueError('Orphan legacy snapshot question')
            put('attempt_questions', dict(tenant_id=tid, attempt_id=aid, position=aq['position'], question_version_id=version(qid, content(snap, True)), option_order_json=compact([o['id'] for o in snap['options']])))
            put('attempt_answers', dict(tenant_id=tid, attempt_id=aid, position=aq['position'], selected_json=aq['answer_json'] or '[]', revision=1,
                                        active_time_ms=aq['spent_ms'], saved_at=a['submitted_at'], is_correct=aq['is_correct'] or 0, earned_points=aq['earned_points']))
    # Validate the entire conversion in an independent scratch SQLite before emitting SQL.
    validation = sqlite3.connect(':memory:')
    validation.executescript((ROOT / 'migrations/0001_core.sql').read_text())
    # Historical records are inserted with cards temporarily active so admission
    # applies to new sessions, not to immutable legacy history.
    statements.insert(1, 'DROP TRIGGER attempt_admission;')
    trigger = (ROOT / 'migrations/0001_core.sql').read_text().split('CREATE TRIGGER attempt_admission',1)[1].split('\nEND;',1)[0]
    statements.append('CREATE TRIGGER attempt_admission' + trigger + '\nEND;')
    script = '\n'.join(statements) + '\n'
    validation.executescript(script)
    if validation.execute('PRAGMA foreign_key_check').fetchall(): raise ValueError('Target foreign keys failed')
    for table, expected in counts.items():
        actual = validation.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
        if actual != expected: raise ValueError(f'Count mismatch: {table}')
    output_file = output / 'migration.sql'
    output_file.write_text(script, encoding='utf-8')
    os.chmod(output_file, 0o600)
    manifest = dict(format_version=1, tenant_id=tid, source_sha256=hashlib.sha256(backup_path.read_bytes()).hexdigest(),
                    sql_sha256=hashlib.sha256(script.encode()).hexdigest(), source_counts={t:src.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0] for t in ['admins','groups','students','questions','cards','attempts','attempt_questions']},
                    target_counts=counts, question_aliases=aliases, duplicate_questions=len(oldqs)-counts.get('questions',0),
                    passwords='forced_reset', sessions='revoked', pin_reset_cards=pin_reset_cards, active_attempts='must_finish_before_cutover')
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
    os.chmod(output / 'manifest.json', 0o600)
    src.close()
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--email', help='Deliverable email for the first workspace owner; required if the legacy address is local-only')
    args = parser.parse_args()
    result = migrate(args.source, args.output, args.email)
    print(json.dumps({'ok':True,'tenant_id':result['tenant_id'],'counts':result['target_counts'],'password_reset_required':True},indent=2))
