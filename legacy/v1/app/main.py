"""SysOne TestLab API, server-authoritative timed exams and teacher workspace."""
import csv, io, json, math, os, random, re, secrets, sqlite3, time, uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from .db import connect, initialize, password_verify, password_hash, digest, ROOT

LEVELS = ('easy', 'medium', 'hard', 'expert')
KINDS = ('single', 'multiple', 'truefalse', 'code')
SECURITY_HEADER = 'XMLHttpRequest'
MAX_DURATION_MS = 30000

def now(): return int(time.time())
def obj(row): return dict(row) if row is not None else None
def dumps(value): return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
def fail(message, status=400): raise HTTPException(status_code=status, detail=message)
def iso_epoch(text):
    if not text: return None
    try:
        dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception: fail('Sana formati noto‘g‘ri')

def require_xhr(request: Request):
    if request.headers.get('x-requested-with') != SECURITY_HEADER:
        fail('Xavfsizlik sarlavhasi kerak', 403)
    origin = request.headers.get('origin')
    if origin:
        from urllib.parse import urlsplit
        try:
            parsed = urlsplit(origin)
            if parsed.netloc != request.url.netloc or parsed.scheme != request.url.scheme:
                fail('Origin ruxsat etilmagan', 403)
        except ValueError: fail('Origin noto‘g‘ri', 403)

# Per-process basic throttle; production should additionally use edge-level rate limiting.
THROTTLE = {}
def throttle(request, topic, max_calls=15, window=60):
    ip = request.client.host if request.client else 'unknown'
    key = (ip, topic)
    tick = now()
    times = [t for t in THROTTLE.get(key, []) if tick-t < window]
    if len(times) >= max_calls: fail('Juda ko‘p urinish. Birozdan keyin qayting.', 429)
    times.append(tick); THROTTLE[key] = times
    if len(THROTTLE) > 5000:
        for k in list(THROTTLE)[:1000]: del THROTTLE[k]

@asynccontextmanager
async def lifespan(app):
    initialize()
    yield

app = FastAPI(title='SysOne TestLab API', version='1.0.0', lifespan=lifespan, docs_url=None, redoc_url=None)

class Login(BaseModel):
    email: str = Field(min_length=4, max_length=254)
    password: str = Field(min_length=1, max_length=256)

class QuestionIn(BaseModel):
    title: str = Field(min_length=5, max_length=5000)
    category: str = Field(min_length=1, max_length=100)
    topic: str = Field(default='', max_length=120)
    level: Literal['easy','medium','hard','expert'] = 'medium'
    kind: Literal['single','multiple','truefalse','code'] = 'single'
    code: str = Field(default='', max_length=12000)
    explanation: str = Field(default='', max_length=5000)
    points: float = Field(default=1, gt=0, le=100)
    options: list[dict[str,str]] = Field(min_length=2, max_length=8)
    correct: list[str] = Field(min_length=1, max_length=8)
    @field_validator('options')
    @classmethod
    def validate_options(cls, val):
        ids = []
        for o in val:
            if not isinstance(o, dict) or not o.get('id') or not str(o.get('text', '')).strip():
                raise ValueError('Har bir variantda id va text bo‘lishi shart')
            if len(o['text']) > 2000 or len(o['id']) > 32: raise ValueError('Variant juda uzun')
            ids.append(o['id'])
        if len(set(ids)) != len(ids): raise ValueError('Variant ID takrorlanmasin')
        return val
    def check(self):
        option_ids = {o['id'] for o in self.options}
        if not set(self.correct).issubset(option_ids) or len(set(self.correct)) != len(self.correct):
            fail('To‘g‘ri javoblar variantlarga mos kelmadi')
        if self.kind != 'multiple' and len(self.correct) != 1:
            fail('Bu turdagi savolda aynan bitta to‘g‘ri javob bo‘lishi kerak')

class CardIn(BaseModel):
    title: str = Field(min_length=3, max_length=130)
    description: str = Field(default='', max_length=1200)
    category: str = Field(default='', max_length=100)
    mode: Literal['auto','manual'] = 'auto'
    selected_ids: list[int] = []
    mix: dict[str,int] = {'easy':30,'medium':50,'hard':20,'expert':0}
    question_count: int = Field(default=10, ge=1, le=150)
    duration_minutes: int = Field(default=20, ge=1, le=360)
    pass_percent: float = Field(default=70, ge=0, le=100)
    attempt_limit: int = Field(default=1, ge=1, le=100)
    random_order: bool = True
    shuffle_options: bool = True
    show_results: bool = True
    show_answers: bool = False
    show_leaderboard: bool = True
    access_mode: Literal['open','pin'] = 'open'
    pin: str = Field(default='', max_length=32)
    group_id: int | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    def check(self):
        if self.mode == 'manual' and len(set(self.selected_ids)) != self.question_count:
            fail('Manual kartada belgilangan savollar soni savollar limitiga teng bo‘lsin')
        if self.mode == 'auto' and (any(k not in LEVELS or v < 0 for k,v in self.mix.items()) or sum(self.mix.values()) != 100):
            fail('Qiyinchilik ulushlari yig‘indisi 100% bo‘lishi kerak')
        if self.access_mode == 'pin' and self.pin and len(self.pin) < 4:
            fail('PIN kamida 4 ta belgidan iborat bo‘lsin')
        a,b=iso_epoch(self.starts_at),iso_epoch(self.ends_at)
        if a and b and a >= b: fail('Tugash sanasi boshlanishdan keyin bo‘lishi kerak')

class GroupIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default='', max_length=500)

class StudentIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    student_code: str = Field(min_length=3, max_length=64)
    group_id: int | None = None

class StartIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    student_code: str = Field(default='', max_length=64)
    pin: str = Field(default='', max_length=32)

class AnswerIn(BaseModel):
    position: int = Field(ge=1, le=150)
    answer: list[str] = Field(default_factory=list, max_length=8)

class ActivityIn(BaseModel):
    position: int = Field(ge=1, le=150)
    spent_ms: int = Field(ge=0, le=30000)
    entered: bool = False

# --- Auth ---
def admin_user(request: Request):
    raw = request.cookies.get('testlab_admin', '')
    if not raw: fail('Administratorga kirish talab qilinadi', 401)
    with connect() as db:
        row = db.execute('''SELECT a.id,a.email,a.name FROM admin_sessions s JOIN admins a ON a.id=s.admin_id
                            WHERE s.token_hash=? AND s.expires_at>?''',(digest(raw),now())).fetchone()
    if not row: fail('Sessiya tugagan. Qayta kiring.',401)
    return obj(row)

@app.post('/api/auth/login')
def login(data: Login, request: Request, response: Response):
    require_xhr(request); throttle(request,'login',8,300)
    with connect() as db:
        row=db.execute('SELECT * FROM admins WHERE email=?',(data.email.lower().strip(),)).fetchone()
        if not row or not password_verify(data.password,row['password_hash']):
            fail('Email yoki parol noto‘g‘ri',401)
        token=secrets.token_urlsafe(42)
        db.execute('INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES (?,?,?)',
                   (digest(token),row['id'],now()+7*86400))
    response.set_cookie('testlab_admin',token,max_age=7*86400,httponly=True,samesite='lax',secure=request.url.scheme=='https',path='/')
    return {'user':{'id':row['id'],'name':row['name'],'email':row['email']}}

@app.get('/api/auth/me')
def me(admin=Depends(admin_user)):
    return {'user':admin}

@app.post('/api/auth/logout')
def logout(request: Request, response: Response, admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db: db.execute('DELETE FROM admin_sessions WHERE token_hash=?',(digest(request.cookies.get('testlab_admin','')),))
    response.delete_cookie('testlab_admin',path='/')
    return {'ok':True}

# --- Question bank ---
def question_public(row):
    d=obj(row)
    d['options']=json.loads(d.pop('options_json'))
    d['correct']=json.loads(d.pop('correct_json'))
    d['archived']=bool(d['archived'])
    return d

@app.get('/api/admin/questions')
def list_questions(category: str='', level: str='', q: str='', include_archived: bool=False, admin=Depends(admin_user)):
    where=['1=1']; args=[]
    if not include_archived: where.append('archived=0')
    if category: where.append('category=?');args.append(category)
    if level: where.append('level=?');args.append(level)
    if q: where.append('(title LIKE ? OR topic LIKE ? OR category LIKE ?)');args.extend(['%'+q+'%']*3)
    with connect() as db:
        rows=db.execute('SELECT * FROM questions WHERE '+ ' AND '.join(where)+' ORDER BY id DESC LIMIT 1000',args).fetchall()
        cats=[r['category'] for r in db.execute('SELECT DISTINCT category FROM questions WHERE archived=0 ORDER BY category')]
    return {'items':[question_public(r) for r in rows],'categories':cats}

def save_question(db, data, question_id=None):
    data.check()
    params=(data.title.strip(),data.category.strip(),data.topic.strip(),data.level,data.kind,
            data.code,data.explanation,data.points,dumps(data.options),dumps(data.correct))
    if question_id:
        cur=db.execute('''UPDATE questions SET title=?,category=?,topic=?,level=?,kind=?,code=?,explanation=?,
             points=?,options_json=?,correct_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?''',(*params,question_id))
        if not cur.rowcount: fail('Savol topilmadi',404)
        return question_id
    return db.execute('''INSERT INTO questions(title,category,topic,level,kind,code,explanation,points,options_json,correct_json)
                         VALUES(?,?,?,?,?,?,?,?,?,?)''',params).lastrowid

@app.post('/api/admin/questions',status_code=201)
def create_question(data: QuestionIn, request:Request, admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db: return {'id':save_question(db,data)}

@app.put('/api/admin/questions/{qid}')
def update_question(qid:int,data:QuestionIn,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db: return {'id':save_question(db,data,qid)}

@app.delete('/api/admin/questions/{qid}')
def archive_question(qid:int,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db:
        if not db.execute('UPDATE questions SET archived=1 WHERE id=?',(qid,)).rowcount: fail('Savol topilmadi',404)
    return {'ok':True}

class QuestionBatch(BaseModel):
    rows: list[QuestionIn] = Field(min_length=1,max_length=500)

@app.post('/api/admin/questions/import')
def import_questions(data:QuestionBatch,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    for question in data.rows: question.check()
    with connect() as db:
        ids=[save_question(db,q) for q in data.rows]
    return {'count':len(ids),'ids':ids}

# --- Groups and students ---
@app.get('/api/admin/groups')
def groups(admin=Depends(admin_user)):
    with connect() as db:
        items=db.execute('''SELECT g.*,COUNT(s.id) student_count FROM groups g LEFT JOIN students s ON g.id=s.group_id
                            GROUP BY g.id ORDER BY g.id DESC''').fetchall()
    return {'items':[obj(r) for r in items]}

@app.post('/api/admin/groups',status_code=201)
def create_group(data:GroupIn,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    try:
        with connect() as db: rid=db.execute('INSERT INTO groups(name,description) VALUES (?,?)',(data.name.strip(),data.description)).lastrowid
    except sqlite3.IntegrityError: fail('Bunday guruh mavjud',409)
    return {'id':rid}

@app.get('/api/admin/students')
def students(admin=Depends(admin_user)):
    with connect() as db:
        rows=db.execute('''SELECT s.*,g.name group_name FROM students s LEFT JOIN groups g ON g.id=s.group_id
                           ORDER BY s.id DESC LIMIT 2000''').fetchall()
    return {'items':[obj(r) for r in rows]}

@app.post('/api/admin/students',status_code=201)
def create_student(data:StudentIn,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    try:
        with connect() as db: rid=db.execute('INSERT INTO students(name,student_code,group_id) VALUES (?,?,?)',
                        (data.name.strip(),data.student_code.strip(),data.group_id)).lastrowid
    except sqlite3.IntegrityError: fail('Kod takrorlangan yoki guruh mavjud emas',409)
    return {'id':rid}

# --- Card bank ---
def card_admin(row):
    d=obj(row)
    d['selected_ids']=json.loads(d.pop('selected_json'))
    d['mix']=json.loads(d.pop('mix_json'))
    d['has_pin']=bool(d.pop('pin_hash'))
    for k in ('random_order','shuffle_options','show_results','show_answers','show_leaderboard'): d[k]=bool(d[k])
    return d

def make_slug(title):
    # Opaque enough to avoid predictable collision; public link is not an access secret.
    return 'TL-' + secrets.token_hex(3).upper()

def choose_questions(db, card):
    n=card['question_count']
    if card['mode']=='manual':
        ids=json.loads(card['selected_json'])
        if len(set(ids))!=n: fail('Manual savollar soni to‘g‘ri emas')
        rows=[db.execute('SELECT * FROM questions WHERE id=? AND archived=0',(qid,)).fetchone() for qid in ids]
        if any(x is None for x in rows): fail('Tanlangan savollardan ayrimlari mavjud emas')
    else:
        mix=json.loads(card['mix_json'])
        quotas={k:n*float(mix.get(k,0))/100 for k in LEVELS}
        portions={k:math.floor(v) for k,v in quotas.items()}
        extras=n-sum(portions.values())
        for k in sorted(LEVELS,key=lambda a:(quotas[a]-portions[a],-LEVELS.index(a)),reverse=True)[:extras]:portions[k]+=1
        rows=[]
        for level,count in portions.items():
            if not count: continue
            if card['category']:
                available=db.execute('SELECT * FROM questions WHERE archived=0 AND category=? AND level=?',
                                     (card['category'],level)).fetchall()
            else:
                available=db.execute('SELECT * FROM questions WHERE archived=0 AND level=?',(level,)).fetchall()
            if len(available)<count:
                fail(f'{level} darajasida yetarli savol yo‘q. Kerak: {count}, mavjud: {len(available)}')
            rows+=random.sample(available,count)
    if card['random_order']: random.shuffle(rows)
    return rows

def validate_card_availability(db,card):
    choose_questions(db,card)

@app.get('/api/admin/cards')
def list_cards(admin=Depends(admin_user)):
    with connect() as db:
        rows=db.execute('''SELECT c.*,(SELECT COUNT(*) FROM attempts a WHERE a.card_id=c.id) attempts_count
                           FROM cards c ORDER BY c.id DESC''').fetchall()
    return {'items':[card_admin(r) for r in rows]}

@app.post('/api/admin/cards',status_code=201)
def create_card(data:CardIn,request:Request,admin=Depends(admin_user)):
    require_xhr(request);data.check()
    if data.access_mode=='pin' and not data.pin: fail('PIN kiriting')
    with connect() as db:
        rid=db.execute('''INSERT INTO cards(slug,title,description,category,mode,selected_json,mix_json,question_count,
          duration_minutes,pass_percent,attempt_limit,random_order,shuffle_options,show_results,show_answers,
          show_leaderboard,access_mode,pin_hash,group_id,starts_at,ends_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
          (make_slug(data.title),data.title.strip(),data.description,data.category.strip(),data.mode,
           dumps(data.selected_ids),dumps(data.mix),data.question_count,data.duration_minutes,data.pass_percent,
           data.attempt_limit,int(data.random_order),int(data.shuffle_options),int(data.show_results),int(data.show_answers),
           int(data.show_leaderboard),data.access_mode,password_hash(data.pin) if data.access_mode=='pin' else '',
           data.group_id,data.starts_at or None,data.ends_at or None)).lastrowid
    return {'id':rid}

@app.put('/api/admin/cards/{cid}')
def update_card(cid:int,data:CardIn,request:Request,admin=Depends(admin_user)):
    require_xhr(request);data.check()
    with connect() as db:
        old=db.execute('SELECT * FROM cards WHERE id=?',(cid,)).fetchone()
        if not old: fail('Karta topilmadi',404)
        attempts=db.execute('SELECT COUNT(*) FROM attempts WHERE card_id=?',(cid,)).fetchone()[0]
        if attempts: fail('Urinishlar boshlangan kartani o‘zgartirish mumkin emas. Nusxa yarating.',409)
        if data.access_mode=='pin':
            if not data.pin and old['access_mode']!='pin': fail('PIN kiriting')
            ph=password_hash(data.pin) if data.pin else old['pin_hash']
        else: ph=''
        db.execute('''UPDATE cards SET title=?,description=?,category=?,mode=?,selected_json=?,mix_json=?,
          question_count=?,duration_minutes=?,pass_percent=?,attempt_limit=?,random_order=?,shuffle_options=?,
          show_results=?,show_answers=?,show_leaderboard=?,access_mode=?,pin_hash=?,group_id=?,starts_at=?,ends_at=?,
          updated_at=CURRENT_TIMESTAMP WHERE id=?''',
          (data.title.strip(),data.description,data.category.strip(),data.mode,dumps(data.selected_ids),dumps(data.mix),
           data.question_count,data.duration_minutes,data.pass_percent,data.attempt_limit,int(data.random_order),
           int(data.shuffle_options),int(data.show_results),int(data.show_answers),int(data.show_leaderboard),
           data.access_mode,ph,data.group_id,data.starts_at or None,data.ends_at or None,cid))
    return {'id':cid}

class StatusIn(BaseModel):
    status: Literal['draft','active','closed','archived']

@app.post('/api/admin/cards/{cid}/status')
def card_status(cid:int,data:StatusIn,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db:
        card=db.execute('SELECT * FROM cards WHERE id=?',(cid,)).fetchone()
        if not card: fail('Karta topilmadi',404)
        if data.status=='active': validate_card_availability(db,card)
        db.execute('UPDATE cards SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',(data.status,cid))
    return {'ok':True,'status':data.status}

@app.post('/api/admin/cards/{cid}/duplicate')
def duplicate_card(cid:int,request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db:
        card=db.execute('SELECT * FROM cards WHERE id=?',(cid,)).fetchone()
        if not card: fail('Karta topilmadi',404)
        fields=['title','description','category','mode','selected_json','mix_json','question_count','duration_minutes','pass_percent',
                'attempt_limit','random_order','shuffle_options','show_results','show_answers','show_leaderboard','access_mode',
                'pin_hash','group_id','starts_at','ends_at']
        sql='INSERT INTO cards(slug,'+','.join(fields)+') VALUES ('+','.join('?' for _ in range(len(fields)+1))+')'
        vals=[card[f] for f in fields]; vals[0]=vals[0]+' (nusxa)'
        rid=db.execute(sql,[make_slug(card['title'])]+vals).lastrowid
    return {'id':rid}

# --- Timed student attempts ---
def card_for_student(card):
    return {k:card[k] for k in ('slug','title','description','category','question_count','duration_minutes',
        'pass_percent','status','access_mode','starts_at','ends_at','show_results','show_leaderboard')}

@app.get('/api/public/cards/{slug}')
def public_card(slug:str):
    with connect() as db:
        row=db.execute('SELECT * FROM cards WHERE slug=?',(slug,)).fetchone()
    if not row or row['status']=='archived': fail('Test kartasi topilmadi',404)
    return {'card':card_for_student(row),'server_time':now()}

def require_attempt(db,attempt_id,token):
    if not token: fail('Urinish sessiyasi kerak',401)
    a=db.execute('SELECT * FROM attempts WHERE id=? AND token_hash=?',(attempt_id,digest(token))).fetchone()
    if not a: fail('Urinish sessiyasi yaroqsiz',401)
    return a

def finalize(db, a):
    # Called in caller's write transaction, re-evaluate to keep finish idempotent.
    a=db.execute('SELECT * FROM attempts WHERE id=?',(a['id'],)).fetchone()
    if a['status']!='active': return a
    questions=db.execute('SELECT * FROM attempt_questions WHERE attempt_id=? ORDER BY position',(a['id'],)).fetchall()
    correct=wrong=unanswered=0; score=maximum=0.0
    for q in questions:
        snap=json.loads(q['snapshot_json']); maximum+=float(snap['points'])
        answer=json.loads(q['answer_json']) if q['answer_json'] else []
        matched=bool(answer) and set(answer)==set(snap['correct'])
        if not answer: unanswered+=1
        elif matched: correct+=1; score+=float(snap['points'])
        else: wrong+=1
        db.execute('UPDATE attempt_questions SET is_correct=?,earned_points=? WHERE attempt_id=? AND position=?',
                   (int(matched), float(snap['points']) if matched else 0,a['id'],q['position']))
    timestamp=min(now(),a['expires_at'])
    db.execute('''UPDATE attempts SET status='submitted',submitted_at=?,score=?,max_score=?,percentage=?,
                  correct_count=?,incorrect_count=?,unanswered_count=? WHERE id=? AND status='active' ''',
               (timestamp,round(score,3),round(maximum,3),round(score/maximum*100,2) if maximum else 0,
                correct,wrong,unanswered,a['id']))
    return db.execute('SELECT * FROM attempts WHERE id=?',(a['id'],)).fetchone()

def auto_finalize(db, a):
    if a['status']=='active' and now() >= a['expires_at']:
        return finalize(db,a)
    return a

def snapshot(row,shuffle):
    opts=json.loads(row['options_json'])
    if shuffle: random.shuffle(opts)
    return {'id':row['id'],'title':row['title'],'category':row['category'],'topic':row['topic'],
            'kind':row['kind'],'level':row['level'],'code':row['code'],'explanation':row['explanation'],
            'options':opts,'correct':json.loads(row['correct_json']),'points':row['points']}

def question_view(row):
    snap=json.loads(row['snapshot_json'])
    return {k:v for k,v in snap.items() if k not in ('correct','explanation')} | {
        'position':row['position'],'answer':json.loads(row['answer_json']) if row['answer_json'] else [],
        'spent_ms':row['spent_ms'],'visit_count':row['visit_count']}

@app.post('/api/public/cards/{slug}/attempts',status_code=201)
def start_attempt(slug:str,data:StartIn,request:Request):
    require_xhr(request);throttle(request,'start',30,60)
    name=' '.join(data.name.strip().split())
    if not re.fullmatch(r"[^<>]{3,120}",name): fail('Ism-familiya noto‘g‘ri')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        card=db.execute('SELECT * FROM cards WHERE slug=?',(slug,)).fetchone()
        if not card or card['status']!='active': fail('Test hozir faol emas',403)
        if (iso_epoch(card['starts_at']) or 0) > now():fail('Test hali boshlanmagan',403)
        if iso_epoch(card['ends_at']) and iso_epoch(card['ends_at']) <= now():fail('Test muddati tugagan',403)
        if card['access_mode']=='pin' and not password_verify(data.pin,card['pin_hash']):fail('PIN noto‘g‘ri',403)
        if card['group_id']:
            if not data.student_code:fail('Bu guruh testi uchun o‘quvchi kodi zarur',403)
            student=db.execute('SELECT * FROM students WHERE student_code=? AND group_id=?',
                               (data.student_code.strip(),card['group_id'])).fetchone()
            if not student: fail('O‘quvchi kodi bu guruhda topilmadi',403)
            name=student['name']
        identity_query='student_code=?' if data.student_code else 'LOWER(student_name)=LOWER(?) AND student_code=\'\''
        ident=data.student_code.strip() if data.student_code else name
        previous=db.execute(f'SELECT COUNT(*) FROM attempts WHERE card_id=? AND {identity_query}',
                            (card['id'],ident)).fetchone()[0]
        if previous>=card['attempt_limit']: fail('Bu test uchun urinishlar limiti tugagan',409)
        selected=choose_questions(db,card)
        token=secrets.token_urlsafe(36)
        attempt_id=uuid.uuid4().hex
        started=now();expires=started+card['duration_minutes']*60
        card_end=iso_epoch(card['ends_at'])
        if card_end:expires=min(expires,card_end)
        db.execute('''INSERT INTO attempts(id,card_id,student_name,student_code,token_hash,started_at,expires_at,last_seen_at)
                      VALUES (?,?,?,?,?,?,?,?)''',
                   (attempt_id,card['id'],name,data.student_code.strip(),digest(token),started,expires,started))
        for i,q in enumerate(selected,1):
            db.execute('''INSERT INTO attempt_questions(attempt_id,position,question_id,snapshot_json)
                          VALUES (?,?,?,?)''',(attempt_id,i,q['id'],dumps(snapshot(q,card['shuffle_options']))))
    return {'attempt_id':attempt_id,'token':token,'expires_at':expires,'started_at':started}

@app.get('/api/public/attempts/{aid}')
def get_attempt(aid:str,x_attempt_token:str=Header(default='')):
    with connect() as db:
        a=auto_finalize(db,require_attempt(db,aid,x_attempt_token))
        card=db.execute('SELECT * FROM cards WHERE id=?',(a['card_id'],)).fetchone()
        rows=db.execute('SELECT * FROM attempt_questions WHERE attempt_id=? ORDER BY position',(aid,)).fetchall()
    return {'attempt':{k:a[k] for k in ('id','student_name','started_at','expires_at','submitted_at','status')},
            'card':card_for_student(card),'questions':[question_view(r) for r in rows],'server_time':now()}

@app.put('/api/public/attempts/{aid}/answers')
def answer_attempt(aid:str,data:AnswerIn,request:Request,x_attempt_token:str=Header(default='')):
    require_xhr(request)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        a=auto_finalize(db,require_attempt(db,aid,x_attempt_token))
        if a['status']!='active': fail('Test allaqachon yakunlangan',409)
        q=db.execute('SELECT * FROM attempt_questions WHERE attempt_id=? AND position=?',(aid,data.position)).fetchone()
        if not q: fail('Savol topilmadi',404)
        snap=json.loads(q['snapshot_json']); allowed={o['id'] for o in snap['options']}
        if not set(data.answer).issubset(allowed) or len(data.answer)!=len(set(data.answer)):
            fail('Javob variantlari noto‘g‘ri')
        if snap['kind']!='multiple' and len(data.answer)>1:fail('Faqat bitta javob tanlang')
        db.execute('UPDATE attempt_questions SET answer_json=? WHERE attempt_id=? AND position=?',
                   (dumps(data.answer),aid,data.position))
        db.execute('UPDATE attempts SET last_seen_at=? WHERE id=?',(now(),aid))
    return {'saved':True,'server_time':now()}

@app.post('/api/public/attempts/{aid}/activity')
def record_activity(aid:str,data:ActivityIn,request:Request,x_attempt_token:str=Header(default='')):
    require_xhr(request)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        a=auto_finalize(db,require_attempt(db,aid,x_attempt_token))
        if a['status']!='active': return {'saved':False}
        q=db.execute('SELECT position FROM attempt_questions WHERE attempt_id=? AND position=?',(aid,data.position)).fetchone()
        if not q:fail('Savol topilmadi',404)
        # Client-reported active time is advisory, never used for deadlines or scoring.
        db.execute('''UPDATE attempt_questions SET spent_ms=MIN(spent_ms+?,?),visit_count=visit_count+?
                      WHERE attempt_id=? AND position=?''',
                   (data.spent_ms,6*60*60*1000,int(data.entered),aid,data.position))
    return {'saved':True}

@app.post('/api/public/attempts/{aid}/finish')
def finish_attempt(aid:str,request:Request,x_attempt_token:str=Header(default='')):
    require_xhr(request)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        a=require_attempt(db,aid,x_attempt_token)
        a=finalize(db,a)
    return {'status':'submitted','percentage':a['percentage']}

def best_attempts(db, card_id):
    """Only a learner's best completed attempt counts for the leaderboard."""
    return db.execute("""
       SELECT id, student_name, percentage, (submitted_at-started_at) AS duration_seconds, submitted_at,
              CASE WHEN student_code<>'' THEN 'C:'||student_code ELSE 'G:'||LOWER(student_name) END AS student_key
       FROM (
         SELECT a.*, ROW_NUMBER() OVER (
           PARTITION BY CASE WHEN student_code<>'' THEN 'C:'||student_code ELSE 'G:'||LOWER(student_name) END
           ORDER BY percentage DESC,(submitted_at-started_at) ASC,submitted_at ASC,id ASC
         ) AS attempt_rank
         FROM attempts a WHERE a.card_id=? AND a.status='submitted'
       ) WHERE attempt_rank=1
       ORDER BY percentage DESC,duration_seconds ASC,submitted_at ASC,id ASC
    """, (card_id,)).fetchall()

def result_details(db,a,card):
    qs=db.execute('SELECT * FROM attempt_questions WHERE attempt_id=? ORDER BY position',(a['id'],)).fetchall()
    duration=max(0,(a['submitted_at'] or now())-a['started_at'])
    result={k:a[k] for k in ('id','student_name','started_at','submitted_at','status','score','max_score',
                  'percentage','correct_count','incorrect_count','unanswered_count')}
    result['duration_seconds']=duration
    result['passed']=a['percentage']>=card['pass_percent']
    result['average_question_seconds']=round(sum(q['spent_ms'] for q in qs)/1000/len(qs),1) if qs else 0
    result['questions']=[{'position':q['position'],'title':json.loads(q['snapshot_json'])['title'],
        'level':json.loads(q['snapshot_json'])['level'],'spent_ms':q['spent_ms'],
        'is_correct':bool(q['is_correct']),'answered':bool(q['answer_json'] and json.loads(q['answer_json'])),
        **({'correct':json.loads(q['snapshot_json'])['correct'],
            'options':json.loads(q['snapshot_json'])['options'],
            'explanation':json.loads(q['snapshot_json'])['explanation'],
            'answer':json.loads(q['answer_json']) if q['answer_json'] else []} if card['show_answers'] else {})}
        for q in qs]
    leader=best_attempts(db,a['card_id'])
    identity=('C:'+a['student_code']) if a['student_code'] else ('G:'+a['student_name'].lower())
    result['rank']=next((i for i,row in enumerate(leader,1) if row['student_key']==identity),None) if card['show_leaderboard'] else None
    result['participants']=len(leader) if card['show_leaderboard'] else None
    return result

@app.get('/api/public/attempts/{aid}/result')
def get_result(aid:str,x_attempt_token:str=Header(default='')):
    with connect() as db:
        a=auto_finalize(db,require_attempt(db,aid,x_attempt_token))
        if a['status']!='submitted': fail('Test hali tugamagan',409)
        card=db.execute('SELECT * FROM cards WHERE id=?',(a['card_id'],)).fetchone()
        if not card['show_results']: return {'hidden':True,'message':'Natija o‘qituvchi tomonidan yashirilgan'}
        return {'result':result_details(db,a,card),'card':card_for_student(card)}

@app.get('/api/public/cards/{slug}/leaderboard')
def public_leaderboard(slug:str):
    with connect() as db:
        card=db.execute('SELECT * FROM cards WHERE slug=?',(slug,)).fetchone()
        if not card or not card['show_leaderboard']:fail('Reyting hozir yopiq',403)
        rows=best_attempts(db,card['id'])[:100]
    def short(name):
        parts=name.split()
        return parts[0]+' '+''.join(x[0]+'.' for x in parts[1:]) if len(parts)>1 else name[:1]+'***'
    return {'items':[{'rank':i,'name':short(r['student_name']),'percentage':r['percentage'],
                      'duration_seconds':r['duration_seconds']} for i,r in enumerate(rows,1)]}

# --- Teacher analytics and exports ---
def admin_analytics(db,cid):
    card=db.execute('SELECT * FROM cards WHERE id=?',(cid,)).fetchone()
    if not card:fail('Karta topilmadi',404)
    rows=db.execute('''SELECT id,student_name,student_code,started_at,submitted_at,status,score,max_score,
                              percentage,correct_count,incorrect_count,unanswered_count
                       FROM attempts WHERE card_id=? ORDER BY started_at DESC,id DESC''',(cid,)).fetchall()
    completed=[r for r in rows if r['status']=='submitted']
    percentages=[r['percentage'] for r in completed]
    metrics=db.execute('''SELECT aq.question_id,MAX(json_extract(aq.snapshot_json,'$.title')) title,
              MAX(json_extract(aq.snapshot_json,'$.level')) level,COUNT(*) total,
              SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END) correct,
              ROUND(AVG(aq.spent_ms)/1000.0,1) avg_seconds
              FROM attempt_questions aq JOIN attempts a ON a.id=aq.attempt_id
              WHERE a.card_id=? AND a.status='submitted'
              GROUP BY aq.question_id ORDER BY (1.0*SUM(CASE WHEN aq.is_correct=1 THEN 1 ELSE 0 END)/COUNT(*)) ASC''',
                       (cid,)).fetchall()
    return {'card':card_admin(card),'summary':{'attempts':len(rows),'completed':len(completed),
                'average':round(sum(percentages)/len(percentages),1) if percentages else 0,
                'pass_rate':round(sum(r['percentage']>=card['pass_percent'] for r in completed)/len(completed)*100,1) if completed else 0,
                'best':max(percentages) if percentages else 0},
            'attempts':[obj(r)|{'duration_seconds':(r['submitted_at'] or now())-r['started_at']} for r in rows],
            'questions':[obj(r)|{'correct_rate':round(r['correct']*100/r['total'],1)} for r in metrics]}

@app.get('/api/admin/cards/{cid}/analytics')
def card_analytics(cid:int,admin=Depends(admin_user)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        for a in db.execute("SELECT * FROM attempts WHERE card_id=? AND status='active' AND expires_at<=?",(cid,now())).fetchall(): finalize(db,a)
        return admin_analytics(db,cid)

@app.get('/api/admin/overview')
def overview(admin=Depends(admin_user)):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        for a in db.execute("SELECT * FROM attempts WHERE status='active' AND expires_at<=?",(now(),)).fetchall():finalize(db,a)
        r=db.execute('''SELECT (SELECT COUNT(*) FROM cards) cards,
                             (SELECT COUNT(*) FROM cards WHERE status='active') active_cards,
                             (SELECT COUNT(*) FROM questions WHERE archived=0) questions,
                             (SELECT COUNT(*) FROM attempts) attempts,
                             (SELECT COUNT(*) FROM attempts WHERE status='submitted') completed,
                             (SELECT COALESCE(ROUND(AVG(percentage),1),0) FROM attempts WHERE status='submitted') average,
                             (SELECT COUNT(*) FROM students) students''').fetchone()
        recent=db.execute('''SELECT a.id,a.student_name,a.percentage,a.status,a.started_at,c.title card_title,c.slug
                             FROM attempts a JOIN cards c ON c.id=a.card_id
                             ORDER BY a.started_at DESC LIMIT 8''').fetchall()
    return {'stats':obj(r),'recent':[obj(row) for row in recent]}

@app.get('/api/admin/cards/{cid}/export')
def export_card(cid:int,admin=Depends(admin_user)):
    with connect() as db:
        data=admin_analytics(db,cid)
    def safe_csv_text(v):
        text=str(v or '')
        return "'"+text if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')) else text
    output=io.StringIO();w=csv.writer(output)
    w.writerow(['O‘quvchi','Kodi','Holat','Natija %','Ball','Maksimal ball','To‘g‘ri','Xato','Javobsiz','Boshlanish (UTC)','Yakun (UTC)','Vaqt (sek)'])
    for a in data['attempts']:
        w.writerow([safe_csv_text(a['student_name']),safe_csv_text(a['student_code']),a['status'],a['percentage'],a['score'],a['max_score'],
                    a['correct_count'],a['incorrect_count'],a['unanswered_count'],
                    datetime.fromtimestamp(a['started_at'],timezone.utc).isoformat(),
                    datetime.fromtimestamp(a['submitted_at'],timezone.utc).isoformat() if a['submitted_at'] else '',
                    a['duration_seconds']])
    content='\ufeff'+output.getvalue()
    return StreamingResponse(iter([content]),media_type='text/csv; charset=utf-8',
             headers={'Content-Disposition':f'attachment; filename="testlab_{cid}_results.csv"'})

# --- Starter content (explicit teacher action only) ---
DEMO=[
 ('Python','Python tilida `len()` funksiyasining vazifasi nima?','easy', 'Elementlar sonini qaytaradi','Sonlarni qo‘shadi','Faylni ochadi','Dasturni to‘xtatadi'),
 ('Python','Qaysi tur o‘zgartirilmaydigan (immutable) ma’lumot hisoblanadi?','medium','tuple','list','dict','set'),
 ('Python','`range(2, 8, 2)` qanday qiymatlar beradi?','easy','2, 4, 6','2, 4, 6, 8','2, 3, 4','8, 6, 4'),
 ('Python','`try / except` operatori nimaga xizmat qiladi?','medium','Istisnolarni ushlashga','Loop yaratishga','Classni o‘chirishga','Modulni chaqirishga'),
 ('Python','`is` va `==` orasidagi asosiy farq nima?','hard','Identiklik va qiymat tengligi','Ikkalasi ham bir xil','`is` faqat satrda','`==` faqat ro‘yxatda'),
 ('Python','`list.append(x)` nima qiladi?','easy','Oxiriga element qo‘shadi','Ro‘yxatni saralaydi','Elementni o‘chiradi','Nusxa oladi'),
 ('Python','Generator qanday afzallik beradi?','hard','Lazy evaluation orqali xotirani tejaydi','Har doim tezroq CPU','Faqat raqamlarni saqlaydi','O‘zi fayl yaratadi'),
 ('Python','`dict.get("x")` kalit bo‘lmasa sukut bo‘yicha nima qaytaradi?','medium','None','KeyError','0','False'),
 ('HTML','HTML hujjatida asosiy sarlavha uchun qaysi teg ishlatiladi?','easy','<h1>','<p>','<small>','<span>'),
 ('HTML','`alt` atributi qaysi elementda ishlatiladi?','easy','<img>','<section>','<head>','<main>'),
 ('HTML','Semantic HTMLning asosiy foydasi nima?','medium','Tuzilma va accessibility','CSS tezligi','Server xotirasi','Parolni shifrlash'),
 ('CSS','CSS Flexboxda `justify-content` nimani boshqaradi?','medium','Asosiy o‘q bo‘yicha joylashuvni','Matn shriftini','Rasm formatini','HTML validatsiyani'),
 ('CSS','`box-sizing: border-box` qanday ishlaydi?','medium','Padding va border width ichiga kiradi','Border o‘chadi','Blok to‘liq yashiriladi','Faqat matnga ta’sir qiladi'),
 ('JavaScript','`const` bilan e’lon qilingan o‘zgaruvchiga qayta qiymat berish mumkinmi?','easy','Yo‘q','Ha, har doim','Faqat asyncda','Faqat browserda'),
 ('JavaScript','`Promise.all()` qanday natija beradi?','hard','Barcha promise bajarilganda natijalar massivini','Bitta random qiymatni','Faqat birinchi natijani','Sync bloklashni'),
 ('IT Asoslari','RAM xotira asosan nima uchun ishlatiladi?','easy','Vaqtinchalik ma’lumotlarni saqlash','Elektr ta’minoti','Doimiy fayl arxivi','Monitor yorqinligi'),
]

@app.post('/api/admin/demo-seed')
def demo_seed(request:Request,admin=Depends(admin_user)):
    require_xhr(request)
    with connect() as db:
        if db.execute('SELECT COUNT(*) FROM questions').fetchone()[0]:fail('Demo savollar faqat bo‘sh bazaga qo‘shiladi',409)
        for category,title,level,*answers in DEMO:
            opts=[{'id':str(i),'text':t} for i,t in enumerate(answers)]
            save_question(db,QuestionIn(title=title,category=category,level=level,kind='single',
                                        options=opts,correct=['0']))
    return {'count':len(DEMO)}

@app.get('/api/health')
def health(): return {'ok':True,'service':'sysone-testlab','version':'1.0.0'}

@app.get('/{full_path:path}',include_in_schema=False)
def spa(full_path:str):
    if full_path.startswith('api/'):
        fail('API manzili topilmadi',404)
    static=ROOT/'static'
    if full_path.startswith('assets/'):
        path=(static / full_path).resolve()
        if not path.is_relative_to(static.resolve()) or not path.is_file():fail('Fayl topilmadi',404)
        return FileResponse(path)
    return FileResponse(static/'index.html')
