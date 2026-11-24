import importlib
import pytest
from fastapi.testclient import TestClient

HDR={'X-Requested-With':'XMLHttpRequest'}

@pytest.fixture
def setup(tmp_path,monkeypatch):
    monkeypatch.setenv('TESTLAB_DATA_DIR',str(tmp_path))
    monkeypatch.setenv('TESTLAB_ADMIN_EMAIL','teacher@demo.local')
    monkeypatch.setenv('TESTLAB_ADMIN_PASSWORD','secure_test_password')
    import app.db as db
    import app.main as main
    importlib.reload(db)
    importlib.reload(main)
    with TestClient(main.app) as client:
        yield client,main

def auth(c):
    assert c.post('/api/auth/login',headers=HDR,json={'email':'teacher@demo.local','password':'secure_test_password'}).status_code==200

def question(c,level='easy'):
    r=c.post('/api/admin/questions',headers=HDR,json={
        'title':'Python dasturida len nima?', 'category':'Python','level':level,'kind':'single',
        'options':[{'id':'a','text':'Elementlar soni'},{'id':'b','text':'Xato javob'}], 'correct':['a']})
    assert r.status_code==201,r.text
    return r.json()['id']

def card(c,ids,**more):
    r=c.post('/api/admin/cards',headers=HDR,json={
        'title':'Test karta 101','mode':'manual','selected_ids':ids,'question_count':len(ids),
        'duration_minutes':2,**more})
    assert r.status_code==201,r.text
    cid=r.json()['id'];slug=next(x['slug'] for x in c.get('/api/admin/cards').json()['items'] if x['id']==cid)
    r=c.post(f'/api/admin/cards/{cid}/status',headers=HDR,json={'status':'active'})
    assert r.status_code==200,r.text
    return cid,slug

def start(c,slug,**more):
    r=c.post(f'/api/public/cards/{slug}/attempts',headers=HDR,json={'name':'Ali Valiyev',**more})
    assert r.status_code==201,r.text
    return r.json()

def test_auth_and_headers(setup):
    c,_=setup
    assert c.get('/api/admin/questions').status_code==401
    assert c.post('/api/auth/login',json={'email':'teacher@demo.local','password':'secure_test_password'}).status_code==403
    auth(c)
    assert c.get('/api/auth/me').status_code==200
    assert c.post('/api/admin/groups',json={'name':'A1'}).status_code==403
    assert c.post('/api/admin/groups',headers=HDR,json={'name':'A1'}).status_code==201
    assert c.get('/api/health').json()['ok']

def test_student_exam_scoring_leaderboard_and_analytics(setup):
    c,_=setup;auth(c)
    cid,slug=card(c,[question(c),question(c,'medium')],show_answers=True)
    session=start(c,slug);aid=session['attempt_id'];h={**HDR,'X-Attempt-Token':session['token']}
    r=c.get(f'/api/public/attempts/{aid}',headers=h)
    assert r.status_code==200
    qs=r.json()['questions'];assert len(qs)==2 and 'correct' not in qs[0]
    assert c.get(f'/api/public/attempts/{aid}',headers={'X-Attempt-Token':'bad'}).status_code==401
    assert c.put(f'/api/public/attempts/{aid}/answers',headers=h,json={'position':1,'answer':['a']}).status_code==200
    assert c.put(f'/api/public/attempts/{aid}/answers',headers=h,json={'position':2,'answer':['b']}).status_code==200
    assert c.post(f'/api/public/attempts/{aid}/activity',headers=h,json={'position':1,'spent_ms':8000,'entered':True}).status_code==200
    assert c.post(f'/api/public/attempts/{aid}/finish',headers=h,json={}).status_code==200
    assert c.post(f'/api/public/attempts/{aid}/finish',headers=h,json={}).status_code==200
    result=c.get(f'/api/public/attempts/{aid}/result',headers=h).json()['result']
    assert result['percentage']==50 and result['correct_count']==1 and result['incorrect_count']==1
    assert result['questions'][0]['spent_ms']==8000 and result['questions'][0]['correct']==['a']
    assert result['rank']==1
    assert c.put(f'/api/public/attempts/{aid}/answers',headers=h,json={'position':1,'answer':['b']}).status_code==409
    assert c.post(f'/api/public/cards/{slug}/attempts',headers=HDR,json={'name':'Ali Valiyev'}).status_code==409
    assert c.get(f'/api/public/cards/{slug}/leaderboard').json()['items'][0]['name']=='Ali V.'
    a=c.get(f'/api/admin/cards/{cid}/analytics').json()
    assert a['summary']['completed']==1 and len(a['questions'])==2
    assert 'Ali Valiyev' in c.get(f'/api/admin/cards/{cid}/export').text

def test_auto_mix_and_protected_results(setup,monkeypatch):
    c,m=setup;auth(c)
    for level,n in [('easy',3),('medium',5),('hard',2)]:
        for _ in range(n):question(c,level)
    new=c.post('/api/admin/cards',headers=HDR,json={'title':'Auto Exam','mode':'auto','question_count':10,
       'category':'Python','mix':{'easy':30,'medium':50,'hard':20,'expert':0},'duration_minutes':1,
       'show_results':False,'show_answers':False,'show_leaderboard':False})
    assert new.status_code==201,new.text
    cid=new.json()['id'];slug=next(x['slug'] for x in c.get('/api/admin/cards').json()['items'] if x['id']==cid)
    assert c.post(f'/api/admin/cards/{cid}/status',headers=HDR,json={'status':'active'}).status_code==200
    sess=start(c,slug);h={'X-Attempt-Token':sess['token']};aid=sess['attempt_id']
    questions=c.get(f'/api/public/attempts/{aid}',headers=h).json()['questions']
    from collections import Counter
    assert Counter(x['level'] for x in questions)=={'easy':3,'medium':5,'hard':2}
    monkeypatch.setattr(m,'now',lambda:sess['expires_at']+1)
    assert c.get(f'/api/public/attempts/{aid}',headers=h).json()['attempt']['status']=='submitted'
    assert c.get(f'/api/public/attempts/{aid}/result',headers=h).json()['hidden']
    assert c.get(f'/api/public/cards/{slug}/leaderboard').status_code==403

def test_group_pin_and_immutable_card(setup):
    c,_=setup;auth(c)
    g=c.post('/api/admin/groups',headers=HDR,json={'name':'Frontend'}).json()['id']
    c.post('/api/admin/students',headers=HDR,json={'name':'Laylo Karimova','student_code':'A-001','group_id':g})
    cid,slug=card(c,[question(c)],access_mode='pin',pin='1234',group_id=g)
    assert c.post(f'/api/public/cards/{slug}/attempts',headers=HDR,json={'name':'Ali Valiyev','pin':'1234'}).status_code==403
    sess=start(c,slug,pin='1234',student_code='A-001')
    assert c.get(f'/api/public/attempts/{sess["attempt_id"]}',headers={'X-Attempt-Token':sess['token']}).json()['attempt']['student_name']=='Laylo Karimova'
    assert c.put(f'/api/admin/cards/{cid}',headers=HDR,json={'title':'Changed','mode':'manual','selected_ids':[1],'question_count':1}).status_code==409

def test_static_app_routes(setup):
    c,_=setup
    assert c.get('/').status_code==200
    assert 'SysOne TestLab' in c.get('/t/TL-PLACEHOLDER').text
    assert 'exam-workspace' in c.get('/assets/app.css').text
    assert 'finishExam' in c.get('/assets/app.js').text
