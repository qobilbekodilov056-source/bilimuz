/* SysOne TestLab — zero-build frontend, designed for offline-installable deployment. */
const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const state = { user:null, cards:[], questions:[], groups:[], students:[], view:'', exam:null, activeCard:null,
  selectedAnalytics:null, filterQuestion:'', filterLevel:'', filterCategory:'', filterCards:'', saving:0, sidebarOpen:false };
const ICONS = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  layout:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  question:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9.7 9a2.5 2.5 0 1 1 4.2 1.8L12 12v2"/><path d="M12 17h.01"/>',
  users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 20v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  chart:'<path d="M3 3v18h18M7 15l4-5 4 3 5-7"/>',
  settings:'<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>',
  logout:'<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',left:'<path d="m15 18-6-6 6-6"/>',
  arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',checkcircle:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',closecircle:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  edit:'<path d="M12 20h9M16 4a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4 11-11Z"/>',
  copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 10.8 7-4.5m-7 8.8 7 4"/>',
  play:'<path d="m8 5 12 7-12 7z"/>',pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  book:'<path d="M4 4a2 2 0 0 1 2-2h15v18H6a2 2 0 0 0-2 2V4Z"/><path d="M4 18a2 2 0 0 1 2-2h15"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  shield:'<path d="m12 22 8-4V5l-8-3-8 3v13l8 4Z"/><path d="m9 12 2 2 4-4"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 4h10v8a5 5 0 0 1-10 0V4ZM7 6H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4"/>',
  spark:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  monitor:'<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 21h8m-4-3v3"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/>',filter:'<path d="M4 7h16M7 12h10m-7 5h4"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  bolt:'<path d="M13 2 4 13h7l-1 9 10-12h-7l0-8Z"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  warning:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
};
const ico = (name,cls='') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;
const e = (value='') => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = s => {s=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
const fmtDate = s => s ? new Date(s*1000).toLocaleString('uz-UZ',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const levText={easy:'Oson',medium:'O‘rtacha',hard:'Qiyin',expert:'Expert'};
const statusText={draft:'Qoralama',active:'Faol',closed:'Yopilgan',archived:'Arxiv',submitted:'Yakunlandi'};
const pillStatus = status => `<span class="pill ${status==='active'||status==='submitted'?'green':status==='draft'?'orange':'gray'}">${e(statusText[status]||status)}</span>`;
const iconButton=(name,attr='',cls='ghost')=>`<button class="btn icon-btn ${cls}" ${attr} title="${e(name)}">${ico(name)}</button>`;
const cardPath=slug=>`${location.origin}/t/${encodeURIComponent(slug)}`;

async function api(path,{method='GET',body,token}={}){
  const headers={'Accept':'application/json'};
  if(method!=='GET') headers['X-Requested-With']='XMLHttpRequest';
  if(body!==undefined){headers['Content-Type']='application/json';body=JSON.stringify(body)}
  if(token)headers['X-Attempt-Token']=token;
  const res=await fetch(path,{method,headers,body,credentials:'same-origin'});
  let data;try{data=await res.json()}catch{data={detail:'Serverdan javobni o‘qib bo‘lmadi'}}
  if(!res.ok){const detail=data.detail;const error=new Error(typeof detail==='string'?detail:Array.isArray(detail)?detail.map(x=>x.msg).join('; '):`HTTP ${res.status}`);error.status=res.status;throw error}
  return data;
}
function toast(msg,type='info'){
  const layer=document.getElementById('toast-layer');const el=document.createElement('div');el.className='toast '+(type==='error'?'error':type==='success'?'success':'');
  el.innerHTML=`${ico(type==='error'?'warning':type==='success'?'checkcircle':'info')}<span>${e(msg)}</span>`;layer.append(el);setTimeout(()=>el.remove(),4600);
}
function errorToast(err){console.error(err);toast(err.message||'Kutilmagan xatolik','error')}
function loading(title='Maʼlumotlar yuklanmoqda...'){return `<div class="loading-pad"><div class="loading-spinner"></div><p>${e(title)}</p></div>`}
function brand(){return `<div class="brandline"><div class="brand-icon">S<b>O</b></div><div class="brandname">SysOne <span style="color:var(--blue)">TestLab</span><small>SMART ASSESSMENT</small></div></div>`}
function go(path){if(state.exam && !path.startsWith('/t/') && !path.startsWith('/result/')) stopExam();history.pushState({},'',path);route();window.scrollTo({top:0,behavior:'instant'})}
window.addEventListener('popstate',route);
const links=[['dashboard','layout','Dashboard'],['cards','layers','Test kartalari'],['questions','question','Savollar bazasi'],['groups','users','Guruhlar'],['analytics','chart','Analitika']];
function shell(section,content){
  app.innerHTML=`<div class="admin-shell ${state.sidebarOpen?'sidebar-open':''}" id="shell">
    <aside class="sidebar"><a class="logo" href="/" data-link><div class="logo-box">S<span>O</span></div><div class="logo-copy">SysOne <span style="color:var(--blue)">TestLab</span><small>TEACHER STUDIO</small></div></a>
      <div class="nav-group-label">BOSHQARUV</div>
      ${links.map(([route,icon,name])=>`<a href="/admin/${route}" data-link class="nav-link ${section===route?'active':''}">${ico(icon)}${e(name)}${route==='cards'?'<span class="nav-badge">'+state.cards.length+'</span>':''}</a>`).join('')}
      <div class="sidebar-spacer"></div><div class="sidebar-foot"><a href="/" data-link class="nav-link">${ico('home')}Bosh sahifa</a>
      <button class="nav-link" style="width:100%;border:0;background:transparent" data-act="logout">${ico('logout')}Chiqish</button>
      <div class="account-chip"><div class="avatar">${e((state.user?.name||'S')[0].toUpperCase())}</div><div><strong class="ellipsize">${e(state.user?.name||'Administrator')}</strong><span class="ellipsize">${e(state.user?.email||'')}</span></div></div></div>
    </aside><main class="main"><header class="topbar"><div class="topbar-label"><button class="btn icon-btn ghost mobile-menu" data-act="mobile-menu">${ico('menu')}</button>${ico('home','sm')}<span>/</span><strong>${e(links.find(l=>l[0]===section)?.[2]||'Boshqaruv')}</strong></div>
    <div class="topbar-actions"><span class="online-indicator"></span><span class="small muted">Teacher Studio</span><div class="avatar">${e((state.user?.name||'S')[0])}</div></div></header>
    <div class="content">${content}</div></main></div>`;
}
function titleRow(title,sub,actions=''){return `<div class="heading-row"><div><h1>${e(title)}</h1><p>${e(sub)}</p></div><div class="flex gap8 wrap">${actions}</div></div>`}
function metric(name,value,icon='chart',accent=''){return `<div class="card metric"><div class="metric-head"><span class="metric-name">${e(name)}</span><span class="metric-icon ${accent}">${ico(icon)}</span></div><div class="metric-value">${e(value)}</div></div>`}
function empty(icon,title,body,button=''){return `<div class="empty-state"><div class="empty-icon">${ico(icon,'lg')}</div><h3>${e(title)}</h3><p>${e(body)}</p>${button}</div>`}

async function ensureTeacher(){
  if(state.user)return true;
  try{const data=await api('/api/auth/me');state.user=data.user;return true}catch{return false}
}
async function route(){
  const path=location.pathname;
  if(!path.startsWith('/t/')&&!path.startsWith('/result/'))stopExam();
  if(path.startsWith('/admin')){
    const section=path.split('/')[2]||'dashboard';
    if(section==='login'){renderLogin();return}
    if(!await ensureTeacher()){history.replaceState({},'','/admin/login');renderLogin();return}
    state.view=section;shell(section,loading());
    try{await Promise.all([fetchCards(),...(section==='dashboard'?[]:section==='questions'? [fetchQuestions()]:section==='cards'?[fetchQuestions(),fetchGroups()]:section==='groups'?[fetchGroups(),fetchStudents()]:section==='analytics'?[]:[])]);
      if(state.view!==section)return;
      if(section==='dashboard')await renderDashboard();
      else if(section==='cards')renderCards();
      else if(section==='questions')renderQuestions();
      else if(section==='groups')renderGroups();
      else if(section==='analytics')renderAnalytics();
      else go('/admin/dashboard');
    }catch(err){shell(section,empty('warning','Yuklashda xatolik',err.message,`<button class="btn" data-act="reload">Qayta urinib ko‘rish</button>`));errorToast(err)}
    return;
  }
  if(path.startsWith('/t/')){await renderStart(decodeURIComponent(path.split('/')[2]||''));return}
  if(path.startsWith('/result/')){await openResult(decodeURIComponent(path.split('/')[2]||''));return}
  renderLanding();
}
function renderLanding(){
  app.innerHTML=`<div class="landing"><div class="public-nav">${brand()}<button class="btn outline sm" data-act="admin-login">${ico('lock')} O‘qituvchiga kirish</button></div>
    <section class="hero"><div><div class="pill blue">${ico('spark')} SYSONE EDUCATION PLATFORM</div>
      <h1>Bilimni <span>aniq</span> baholang.</h1><p>Qulay testlar, shaffof natijalar va har bir savol bo‘yicha chuqur tahlil. O‘quvchi uchun sodda, o‘qituvchi uchun kuchli.</p>
      <form id="find-test" class="code-entry"><input class="input" name="code" placeholder="Test kodi, masalan: TL-A1B2C3" required minlength="5"><button class="btn" type="submit">Testga kirish ${ico('arrow')}</button></form>
      <div class="hero-actions"><button class="btn outline" data-act="admin-login">${ico('layout')} Teacher Studio</button></div>
      <div class="flex gap16 wrap mt24 muted small">${ico('checkcircle')} Ro‘yxatdan o‘tish shart emas &nbsp; ${ico('shield')} Avtomatik natija</div></div>
      <div class="hero-preview"><div class="preview-top"><div class="flex between"><strong style="font-size:12px">Python Fundamentals</strong><span class="pill blue">${ico('clock')} 18:42</span></div><div class="flex between muted tiny mt12"><span>Savol 7 / 20</span><span>35%</span></div><div class="preview-progress"><div></div></div></div>
      <div class="preview-body"><div class="pill blue">07 · PYTHON BASICS</div><h3>`+'`len()`'+` funksiyasi qanday vazifani bajaradi?</h3><div class="preview-choice"><span>A</span> Sonlarni bir-biriga qo‘shadi</div><div class="preview-choice active"><span>B</span> Elementlar sonini qaytaradi ${ico('check')}</div><div class="preview-choice"><span>C</span> Faylni ochadi</div><div class="flex between mt20"><span class="muted tiny">${ico('checkcircle')} Javob saqlandi</span><span class="pill blue">Keyingi savol ${ico('arrow')}</span></div></div></div>
    </section><div class="feature-line"><span>${ico('target')} Aniq baholash</span><span>${ico('clock')} Vaqt statistikasi</span><span>${ico('chart')} Real analitika</span><span>${ico('trophy')} Reyting tizimi</span></div><div class="footer-note">© SysOne Tech · TestLab v1.0</div></div>`;
  document.getElementById('find-test').addEventListener('submit',evt=>{evt.preventDefault();const code=String(new FormData(evt.target).get('code')).trim();go('/t/'+encodeURIComponent(code))});
}
function renderLogin(){
  app.innerHTML=`<div class="auth-wrap"><div class="auth-left"><a href="/" data-link>${brand()}</a><div class="auth-card"><span class="eyebrow">TEACHER STUDIO</span><h1 class="mt12">Xush kelibsiz!</h1><p>Testlar, o‘quvchilar va natijalarni boshqarish uchun administrator hisobingizga kiring.</p>
    <form id="login-form" class="grid" style="gap:17px"><div class="form-field"><label>Email manzil</label><input name="email" type="email" autocomplete="username" placeholder="admin@sysone.top" required></div><div class="form-field"><label>Parol</label><input name="password" type="password" autocomplete="current-password" placeholder="••••••••••" required></div><button type="submit" class="btn full">Boshqaruv paneliga kirish ${ico('arrow')}</button></form>
    <div class="hint-panel mt24">${ico('info')}<div><strong>Birinchi marta kiryapsizmi?</strong><p>Agar administrator paroli sozlanmagan bo‘lsa, u serverdagi <span class="inline-code">data/first-login.txt</span> faylida yaratiladi.</p></div></div>
    </div><div class="small muted">© 2026 SysOne Tech · Protected workspace</div></div><div class="auth-right"><div class="auth-quote"><div class="pill blue">${ico('spark')} YOUR CLASSROOM, REIMAGINED</div><h2>Teach smarter.<br>Measure better.</h2><p>Har bir o‘quvchining o‘sishini ko‘ring. Bilimni raqamlarga emas, haqiqiy natijaga aylantiring.</p></div></div></div>`;
  document.getElementById('login-form').addEventListener('submit',async evt=>{
    evt.preventDefault();const btn=evt.target.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Tekshirilmoqda...';
    try{const f=new FormData(evt.target);const data=await api('/api/auth/login',{method:'POST',body:{email:f.get('email'),password:f.get('password')}});state.user=data.user;toast('Xush kelibsiz!','success');go('/admin/dashboard')}
    catch(err){errorToast(err);btn.disabled=false;btn.innerHTML=`Kirish ${ico('arrow')}`}
  });
}
async function fetchCards(){const r=await api('/api/admin/cards');state.cards=r.items;return r.items}
async function fetchQuestions(){const r=await api('/api/admin/questions');state.questions=r.items;state.categories=r.categories;return r.items}
async function fetchGroups(){const r=await api('/api/admin/groups');state.groups=r.items;return r.items}
async function fetchStudents(){const r=await api('/api/admin/students');state.students=r.items;return r.items}

async function renderDashboard(){
  const {stats,recent}=await api('/api/admin/overview');
  shell('dashboard',`${titleRow('Umumiy ko‘rinish','O‘quv jarayoningiz bir qarashda.',`<button class="btn outline" data-act="new-question">${ico('plus')} Savol qo‘shish</button><button class="btn" data-act="new-card">${ico('plus')} Yangi karta</button>`)}
  <div class="metric-grid">${metric('Jami test kartalari',stats.cards,'layers')}${metric('Faol testlar',stats.active_cards,'bolt','green')}${metric('Savollar bazasi',stats.questions,'book','purple')}${metric('O‘rtacha natija',stats.average+'%','chart','orange')}</div>
  <div class="dashboard-grid"><div class="card no-overflow"><div class="section-head"><div><h2>So‘nggi test urinishlari</h2><span class="section-sub">So‘nggi o‘quvchi faolligi</span></div><button class="btn ghost sm" data-act="view-analytics">Barchasi ${ico('arrow')}</button></div>
  ${recent.length?`<div class="table-wrap"><table class="table"><thead><tr><th>O‘quvchi</th><th>Test nomi</th><th>Natija</th><th>Holat</th></tr></thead><tbody>${recent.map(x=>`<tr><td><div class="flex gap8"><span class="avatar-square">${e(x.student_name[0])}</span><strong>${e(x.student_name)}</strong></div></td><td>${e(x.card_title)}</td><td><strong>${x.status==='submitted'?e(x.percentage)+'%':'—'}</strong></td><td>${pillStatus(x.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('users','Urinishlar hali yo‘q','O‘quvchilar testni boshlaganda ularning natijalari shu yerda chiqadi.')}</div>
  <div class="grid" style="gap:18px"><div class="card pad"><div class="section-head" style="padding:0 0 18px"><h2>Platforma holati</h2><span class="pill green">${ico('checkcircle')} Online</span></div>
    <div class="flex between" style="padding:10px 0"><span class="muted">Yakunlangan urinishlar</span><strong>${stats.completed}</strong></div><div class="divider" style="margin:6px 0"></div>
    <div class="flex between" style="padding:10px 0"><span class="muted">Jami urinishlar</span><strong>${stats.attempts}</strong></div><div class="divider" style="margin:6px 0"></div>
    <div class="flex between" style="padding:10px 0"><span class="muted">Ro‘yxatdagi o‘quvchilar</span><strong>${stats.students}</strong></div></div>
    <div class="hint-panel">${ico('spark')}<div><strong>TestLab dastlabki sozlamasi</strong><p>Bazani tezroq sinash uchun namunaviy Python, HTML, CSS va JavaScript savollarini bir marta qo‘shishingiz mumkin.</p><button class="btn soft sm mt12" data-act="seed-demo">${ico('plus')} Namuna savollar</button></div></div>
  </div></div>`);
}
function renderQuestions(){
  const categories=[...new Set(state.questions.map(q=>q.category))];
  shell('questions',`${titleRow('Savollar bazasi',`${state.questions.length} ta savol · Savollarni tuzing, tartiblang va boshqaring.`,`<button class="btn outline" data-act="import-questions">${ico('upload')} CSV Import</button><button class="btn" data-act="new-question">${ico('plus')} Savol qo‘shish</button>`)}
  <div class="toolbar"><div class="toolbar-left"><div class="search">${ico('search')}<input id="question-search" placeholder="Savol yoki mavzu qidirish..." value="${e(state.filterQuestion)}"></div>
  <select class="filter-select" id="question-category"><option value="">Barcha fanlar</option>${categories.map(c=>`<option value="${e(c)}" ${state.filterCategory===c?'selected':''}>${e(c)}</option>`).join('')}</select>
  <select class="filter-select" id="question-level"><option value="">Barcha darajalar</option>${Object.entries(levText).map(([k,v])=>`<option value="${k}" ${state.filterLevel===k?'selected':''}>${v}</option>`).join('')}</select></div><span class="muted small" id="question-count"></span></div>
  <div class="question-cards" id="questions-list"></div>`);
  document.getElementById('question-search').addEventListener('input',ev=>{state.filterQuestion=ev.target.value;paintQuestionList()});
  document.getElementById('question-category').addEventListener('change',ev=>{state.filterCategory=ev.target.value;paintQuestionList()});
  document.getElementById('question-level').addEventListener('change',ev=>{state.filterLevel=ev.target.value;paintQuestionList()});
  paintQuestionList();
}
function paintQuestionList(){
  const target=document.getElementById('questions-list');if(!target)return;
  const q=state.filterQuestion.trim().toLowerCase();
  const questions=state.questions.filter(x=>(!q||[x.title,x.category,x.topic].join(' ').toLowerCase().includes(q))&&(!state.filterLevel||x.level===state.filterLevel)&&(!state.filterCategory||x.category===state.filterCategory));
  document.getElementById('question-count').textContent=questions.length+' savol ko‘rsatilmoqda';
  target.innerHTML=questions.length?questions.map(x=>`<article class="card question-card"><div class="flex between"><div class="flex gap8"><span class="pill blue">${e(x.category)}</span><span class="pill ${x.level==='easy'?'green':x.level==='medium'?'orange':x.level==='hard'?'red':'purple'}">${e(levText[x.level])}</span></div><span class="muted tiny">#${x.id}</span></div>
      <h3>${e(x.title)}</h3>${x.code?`<div class="code-box" style="padding:12px;margin:0;font-size:11px;max-height:85px">${e(x.code)}</div>`:''}
      <div class="muted tiny">${e(x.topic||x.kind)} · ${x.options.length} variant · ${x.points} ball</div><div class="q-footer"><span>${e(x.kind.toUpperCase())}</span><div class="flex gap8"><button class="btn ghost sm" data-act="edit-question" data-id="${x.id}">${ico('edit')} Tahrir</button>${iconButton('x',`data-act="delete-question" data-id="${x.id}"`,'danger')}</div></div></article>`).join(''):empty('search','Savollar topilmadi','Qidiruvni o‘zgartiring yoki yangi savol yarating.',`<button class="btn" data-act="new-question">${ico('plus')} Yangi savol</button>`);
}
function renderCards(){
  shell('cards',`${titleRow('Test kartalari',`${state.cards.length} ta karta · Testlaringizni yaratish va ulashish.`,`<button class="btn" data-act="new-card">${ico('plus')} Yangi test kartasi</button>`)}
    <div class="toolbar"><div class="toolbar-left"><div class="search">${ico('search')}<input id="card-search" placeholder="Karta qidirish..." value="${e(state.filterCards)}"></div></div></div><div id="cards-list" class="card-grid"></div>`);
  document.getElementById('card-search').addEventListener('input',ev=>{state.filterCards=ev.target.value;paintCards()});paintCards();
}
function paintCards(){
  const el=document.getElementById('cards-list');if(!el)return;
  const cards=state.cards.filter(x=>(x.title+' '+x.slug).toLowerCase().includes(state.filterCards.toLowerCase()));
  el.innerHTML=cards.length?cards.map(x=>`<article class="card test-card"><div class="test-card-header"><span class="tag-edu">${ico('layers','lg')}</span>${pillStatus(x.status)}</div><div><div class="muted tiny bold">${e(x.slug)} · ${e(x.category||'Barcha fanlar')}</div><h3 class="mt8">${e(x.title)}</h3><p>${e(x.description||'Bilimni tekshirish uchun interaktiv test kartasi.')}</p></div>
    <div class="card-metrics"><span>${ico('question')} ${x.question_count} savol</span><span>${ico('clock')} ${x.duration_minutes} daq</span><span>${ico('users')} ${x.attempts_count} urinish</span></div>
    <div class="actions-row"><button class="btn soft sm" data-act="share-card" data-id="${x.id}">${ico('share')} Ulashish</button><button class="btn outline sm" data-act="card-analytics" data-id="${x.id}">${ico('chart')} Natijalar</button><button class="btn ghost sm" data-act="card-menu" data-id="${x.id}">${ico('more')}</button></div></article>`).join(''):empty('layers','Test kartalari hali yo‘q','Savollar bazasidan test tuzib, o‘quvchilarga havola yuboring.',`<button class="btn" data-act="new-card">${ico('plus')} Birinchi kartani yaratish</button>`);
}
function renderGroups(){
  shell('groups',`${titleRow('O‘quvchilar va guruhlar',`${state.groups.length} guruh · ${state.students.length} ro‘yxatli o‘quvchi.`,`<button class="btn outline" data-act="new-group">${ico('plus')} Guruh</button><button class="btn" data-act="new-student">${ico('plus')} O‘quvchi</button>`)}
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:15px;margin-bottom:23px">${state.groups.map(g=>`<div class="card pad"><div class="flex between"><div class="tag-edu">${ico('users')}</div><span class="pill blue">${g.student_count} o‘quvchi</span></div><h3 style="margin:16px 0 5px">${e(g.name)}</h3><div class="muted small">${e(g.description||'O‘quv guruhi')}</div></div>`).join('')||'<div class="card pad">Guruhlar hali yaratilmagan.</div>'}</div>
  <div class="card no-overflow"><div class="section-head"><h2>O‘quvchilar ro‘yxati</h2><span class="section-sub">Noyob kod bir nechta testdagi natijalarni bog‘laydi</span></div>
  ${state.students.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Ism-familiya</th><th>O‘quvchi kodi</th><th>Guruh</th></tr></thead><tbody>${state.students.map(s=>`<tr><td><strong>${e(s.name)}</strong></td><td><code>${e(s.student_code)}</code></td><td>${e(s.group_name||'—')}</td></tr>`).join('')}</tbody></table></div>`:empty('user','O‘quvchilar hali yo‘q','Ro‘yxatga olish ixtiyoriy, lekin guruhga kirish kodi va aniq statistika uchun zarur.')}</div>`);
}
function renderAnalytics(){
  const options=state.cards.map(c=>`<option value="${c.id}" ${state.selectedAnalytics===c.id?'selected':''}>${e(c.title)} (${e(c.slug)})</option>`).join('');
  if(!state.selectedAnalytics&&state.cards.length)state.selectedAnalytics=state.cards[0].id;
  shell('analytics',`${titleRow('Analitika va natijalar','Har bir test bo‘yicha aniq va shaffof statistika.',`<button class="btn outline" data-act="export-analytics">${ico('download')} CSV eksport</button>`)}<div class="toolbar"><div class="toolbar-left"><span class="field-label">Test kartasi</span><select id="analytics-select" class="filter-select" style="min-width:250px">${state.cards.map(c=>`<option value="${c.id}" ${state.selectedAnalytics===c.id?'selected':''}>${e(c.title)}</option>`).join('')}</select></div></div><div id="analytics-panel">${loading()}</div>`);
  document.getElementById('analytics-select')?.addEventListener('change',ev=>{state.selectedAnalytics=Number(ev.target.value);paintAnalytics()});
  paintAnalytics();
}
async function paintAnalytics(){
  const target=document.getElementById('analytics-panel');if(!target)return;
  if(!state.selectedAnalytics){target.innerHTML=empty('chart','Tahlil uchun test yo‘q','Avval test kartasini yarating.');return}
  target.innerHTML=loading('Natijalar hisoblanmoqda...');
  try{const data=await api(`/api/admin/cards/${state.selectedAnalytics}/analytics`);if(!target.isConnected)return;
    const s=data.summary;const questions=data.questions;
    target.innerHTML=`<div class="metric-grid">${metric('Urinishlar',s.attempts,'users')}${metric('Yakunlangan',s.completed,'checkcircle','green')}${metric('O‘rtacha natija',s.average+'%','chart','purple')}${metric('O‘tish darajasi',s.pass_rate+'%','target','orange')}</div>
    <div class="dashboard-grid"><div class="card no-overflow"><div class="section-head"><h2>O‘quvchilar natijalari</h2><span class="section-sub">${data.attempts.length} urinish</span></div>
    ${data.attempts.length?`<div class="table-wrap"><table class="table"><thead><tr><th>O‘quvchi</th><th>Natija</th><th>Vaqt</th><th>Holat</th></tr></thead><tbody>${data.attempts.map(a=>`<tr><td><strong>${e(a.student_name)}</strong><div class="tiny muted">${e(a.student_code||'Guest')} · ${fmtDate(a.started_at)}</div></td><td class="bold">${a.status==='submitted'?a.percentage+'%':'—'}</td><td>${fmtTime(a.duration_seconds)}</td><td>${pillStatus(a.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('chart','Hali ma’lumot yo‘q','Test natijalari to‘plangach shu yerda chiqadi.')}</div>
    <div class="card pad"><div class="section-head" style="padding:0 0 14px"><h2>Eng qiyin savollar</h2><span class="section-sub">To‘g‘ri javoblar ulushi</span></div>${questions.length?questions.slice(0,7).map(q=>`<div style="padding:12px 0"><div class="flex between gap12"><div class="ellipsize small" title="${e(q.title)}">${e(q.title)}</div><strong style="font-size:12px">${q.correct_rate}%</strong></div><div class="progress-indicator mt8"><span style="width:${Math.min(100,Math.max(0,q.correct_rate))}%"></span></div><div class="tiny muted mt8">${q.total} urinish · o‘rtacha ${q.avg_seconds} sek</div></div>`).join(''):empty('target','Savollar tahlili hali yo‘q','Birinchi yakunlangan testdan keyin paydo bo‘ladi.')}</div></div>`;
  }catch(err){target.innerHTML=empty('warning','Xatolik',err.message);errorToast(err)}
}
function showModal(title,content,onSubmit,{wide=false,saveLabel='Saqlash'}={}){
  modalRoot.innerHTML=`<div class="modal-cover" role="presentation"><div class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${e(title)}"><div class="modal-head"><h2>${e(title)}</h2>${iconButton('x','data-act="close-modal"')}</div>
    <form id="modal-form" style="display:flex;flex-direction:column;min-height:0;overflow:hidden"><div class="modal-body">${content}</div><div class="modal-footer"><button class="btn outline" type="button" data-act="close-modal">Bekor qilish</button><button class="btn" type="submit" id="modal-save">${ico('check')} ${e(saveLabel)}</button></div></form></div></div>`;
  const form=document.getElementById('modal-form');form.addEventListener('submit',async ev=>{ev.preventDefault();const btn=document.getElementById('modal-save');btn.disabled=true;try{const ok=await onSubmit(form);if(ok!==false){closeModal();toast('Muvaffaqiyatli saqlandi','success')}}catch(err){errorToast(err)}finally{if(btn.isConnected)btn.disabled=false}});
  document.querySelector('.modal-cover').addEventListener('click',ev=>{if(ev.target.classList.contains('modal-cover'))closeModal()});
}
function closeModal(){modalRoot.innerHTML=''}
function val(form,name){return form.elements.namedItem(name)?.value??''}
function chk(form,name){return !!form.elements.namedItem(name)?.checked}
function field(name,label,value='',type='text',attrs=''){return `<div class="form-field"><label for="f_${name}">${e(label)}</label><input id="f_${name}" name="${name}" type="${type}" value="${e(value)}" ${attrs}></div>`}
function textArea(name,label,value='',attrs=''){return `<div class="form-field"><label for="f_${name}">${e(label)}</label><textarea id="f_${name}" name="${name}" ${attrs}>${e(value)}</textarea></div>`}
function selectField(name,label,options,value=''){return `<div class="form-field"><label for="f_${name}">${e(label)}</label><select name="${name}" id="f_${name}">${options.map(x=>`<option value="${e(x[0])}" ${x[0]===value?'selected':''}>${e(x[1])}</option>`).join('')}</select></div>`}
function switchField(name,label,on=false){return `<label class="switch-row"><input type="checkbox" name="${name}" ${on?'checked':''}><span>${e(label)}</span></label>`}
function openQuestionEditor(id=null){
  const q=id?state.questions.find(x=>x.id===Number(id)):null;
  const defaultOptions=[{id:'a',text:''},{id:'b',text:''},{id:'c',text:''},{id:'d',text:''}];
  const options=q?.options||defaultOptions;
  const body=`<div class="form-grid">${field('title','Savol matni',q?.title||'','text','required minlength="5" class="span2"')}
    ${field('category','Fan / kategoriya',q?.category||'Python','text','required list="categories"')}${field('topic','Mavzu',q?.topic||'','text','placeholder="Masalan: Funksiyalar"')}
    ${selectField('level','Qiyinchilik',Object.entries(levText),q?.level||'medium')}${selectField('kind','Savol turi',[['single','Bitta javob'],['multiple','Bir nechta javob'],['truefalse','To‘g‘ri / noto‘g‘ri'],['code','Kod savoli']],q?.kind||'single')}
    <div class="span2">${textArea('code','Kod fragmenti (ixtiyoriy)',q?.code||'','rows="3" placeholder="print(len([1,2,3]))"')}</div>
    <div class="span2"><div class="field-label">Javob variantlari</div><div class="tiny muted mt8">To‘g‘ri javob(lar)ni chapdagi belgi bilan tanlang.</div><div id="answer-option-list"></div><button type="button" class="btn ghost sm mt12" id="add-option">${ico('plus')} Variant qo‘shish</button></div>
    ${field('points','Ball',q?.points??1,'number','required min="0.01" max="100" step="0.5"')}
    <div class="span2">${textArea('explanation','Yechim izohi (ixtiyoriy)',q?.explanation||'','rows="2"')}</div></div><datalist id="categories">${(state.categories||[]).map(c=>`<option value="${e(c)}"></option>`).join('')}</datalist>`;
  showModal(q?'Savolni tahrirlash':'Yangi savol',body,async form=>{
    const kind=val(form,'kind');const optionEls=[...document.querySelectorAll('#answer-option-list .option-row')];
    const arr=optionEls.map(el=>({id:el.dataset.key,text:el.querySelector('.input').value.trim()})).filter(x=>x.text);
    const correct=optionEls.filter(el=>el.querySelector('.correct-option').checked).map(el=>el.dataset.key);
    const payload={title:val(form,'title').trim(),category:val(form,'category').trim(),topic:val(form,'topic').trim(),level:val(form,'level'),kind,
      code:val(form,'code'),explanation:val(form,'explanation'),points:Number(val(form,'points')),options:arr,correct};
    if(correct.some(c=>!arr.some(o=>o.id===c))){toast('Bo‘sh variant to‘g‘ri javob bo‘la olmaydi','error');return false}
    await api(q?`/api/admin/questions/${q.id}`:'/api/admin/questions',{method:q?'PUT':'POST',body:payload});
    await fetchQuestions();if(state.view==='questions')renderQuestions();return true;
  },{wide:true});
  let currentOptions=options.map(o=>({...o}));let correctIds=q?.correct||['a'];
  const renderOptionInputs=()=>{
    const kind=document.getElementById('f_kind').value;
    document.getElementById('answer-option-list').innerHTML=currentOptions.map((o,i)=>`<div class="option-row" data-key="${e(o.id)}"><input class="correct-option" type="${kind==='multiple'?'checkbox':'radio'}" name="corr" ${correctIds.includes(o.id)?'checked':''} aria-label="To‘g‘ri javob"><input class="input" value="${e(o.text)}" maxlength="2000" placeholder="${i+1}-variant" aria-label="Javob varianti"><button class="btn ghost icon-btn" type="button" data-remove-option="${e(o.id)}" aria-label="Variantni o‘chirish">${ico('x')}</button></div>`).join('');
    document.getElementById('answer-option-list').querySelectorAll('.correct-option').forEach(el=>el.addEventListener('change',()=>{correctIds=[...document.querySelectorAll('.correct-option:checked')].map(x=>x.closest('.option-row').dataset.key)}));
    document.getElementById('answer-option-list').querySelectorAll('.option-row .input').forEach(el=>el.addEventListener('input',()=>{currentOptions.find(o=>o.id===el.closest('.option-row').dataset.key).text=el.value}));
    document.querySelectorAll('[data-remove-option]').forEach(el=>el.addEventListener('click',()=>{if(currentOptions.length<=2){toast('Kamida 2 ta variant kerak','error');return}const id=el.dataset.removeOption;currentOptions=currentOptions.filter(x=>x.id!==id);correctIds=correctIds.filter(x=>x!==id);renderOptionInputs()}));
  };
  document.getElementById('add-option').addEventListener('click',()=>{if(currentOptions.length>=8)return toast('8 tadan ortiq variant bo‘lmaydi','error');const id=crypto.randomUUID().slice(0,8);currentOptions.push({id,text:''});renderOptionInputs()});
  document.getElementById('f_kind').addEventListener('change',()=>{const kind=document.getElementById('f_kind').value;if(kind==='truefalse'){currentOptions=[{id:'true',text:'To‘g‘ri'},{id:'false',text:'Noto‘g‘ri'}];correctIds=['true']}else if(currentOptions.length===2&&currentOptions[0].id==='true'){currentOptions=defaultOptions.map(x=>({...x}));correctIds=['a']}else if(kind!=='multiple'&&correctIds.length>1)correctIds=correctIds.slice(0,1);renderOptionInputs()});
  renderOptionInputs();
}
function openCardEditor(id=null){
  const card=id?state.cards.find(c=>c.id===Number(id)):null;
  const mix=card?.mix||{easy:30,medium:50,hard:20,expert:0};
  const body=`<div class="form-grid">${field('title','Karta nomi',card?.title||'','text','required placeholder="Python 1-dars — Test"')}${selectField('category','Fan',[['','Barcha fanlar'],...[...new Set(state.questions.map(x=>x.category))].map(x=>[x,x])],card?.category||'')}
    <div class="span2">${textArea('description','Tavsif (ixtiyoriy)',card?.description||'','rows="2"')}</div>
    ${selectField('mode','Savollarni tanlash',[['auto','Avtomatik (daraja bo‘yicha)'],['manual','Qo‘lda tanlash']],card?.mode||'auto')}
    ${field('question_count','Savollar soni',card?.question_count||10,'number','min="1" max="150" required')}
    <div id="auto-mode" class="span2"><div class="field-label">Qiyinchilik taqsimoti</div><div class="mix-grid mt8">${Object.entries(levText).map(([k,v])=>field(`mix_${k}`,v+' (%)',mix[k]??0,'number','min="0" max="100" required')).join('')}</div><div class="help mt8 muted tiny">Jami 100% bo‘lishi kerak.</div></div>
    <div id="manual-mode" class="span2 hide"><div class="field-label">Savollarni belgilang</div><div class="selection-list mt12">${state.questions.map(q=>`<label><input type="checkbox" class="manual-question" value="${q.id}" ${(card?.selected_ids||[]).includes(q.id)?'checked':''}><span><strong>#${q.id}</strong> · ${e(q.title)}</span><span class="pill">${e(levText[q.level])}</span></label>`).join('')||'<p class="muted small" style="padding:13px">Avval savollar yarating.</p>'}</div></div>
    <div class="span2 form-section-title">Imtihon qoidalari</div>
    ${field('duration_minutes','Vaqt (daqiqa)',card?.duration_minutes||20,'number','min="1" max="360" required')}${field('pass_percent','O‘tish foizi (%)',card?.pass_percent??70,'number','min="0" max="100" required')}
    ${field('attempt_limit','Maksimal urinishlar',card?.attempt_limit||1,'number','min="1" max="100" required')}
    ${selectField('access_mode','Kirish turi',[['open','Ochiq havola'],['pin','PIN bilan']],card?.access_mode||'open')}
    <div id="pin-block" class="span2 hide">${field('pin','Kirish PIN kodi','','text',`minlength="4" placeholder="${card?.has_pin?'O‘zgartirish shart emas':'Kamida 4 belgi'}"`)}</div>
    ${selectField('group_id','Guruh cheklovi',[['','Barcha o‘quvchilar'],...state.groups.map(g=>[String(g.id),g.name])],card?.group_id?String(card.group_id):'')}
    <div class="form-field"><label>Boshlanish sanasi (ixtiyoriy)</label><input type="datetime-local" name="starts_at" value="${e(toLocalInput(card?.starts_at))}"></div>
    <div class="form-field"><label>Tugash sanasi (ixtiyoriy)</label><input type="datetime-local" name="ends_at" value="${e(toLocalInput(card?.ends_at))}"></div>
    <div class="span2 form-section-title">Natijalar va interfeys</div>
    <div class="span2 grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px">${switchField('random_order','Savollarni aralashtirish',card?.random_order??true)}${switchField('shuffle_options','Javoblarni aralashtirish',card?.shuffle_options??true)}${switchField('show_results','Natijani ko‘rsatish',card?.show_results??true)}${switchField('show_answers','To‘g‘ri javoblarni ko‘rsatish',card?.show_answers??false)}${switchField('show_leaderboard','Reytingni ko‘rsatish',card?.show_leaderboard??true)}</div>
    <div class="span2 hint-panel">${ico('info')}<div><strong>Versiya himoyasi</strong><p>Test urinishlari boshlangandan keyin kartaning mazmunini o‘zgartirish mumkin emas. Yangi versiya uchun nusxa yarating.</p></div></div></div>`;
  showModal(card?'Test kartasini tahrirlash':'Yangi test kartasi',body,async form=>{
    const start=val(form,'starts_at'),end=val(form,'ends_at');
    const payload={title:val(form,'title').trim(),description:val(form,'description'),category:val(form,'category'),mode:val(form,'mode'),
      selected_ids:[...form.querySelectorAll('.manual-question:checked')].map(el=>Number(el.value)),
      mix:Object.fromEntries(Object.keys(levText).map(x=>[x,Number(val(form,'mix_'+x))])),question_count:Number(val(form,'question_count')),
      duration_minutes:Number(val(form,'duration_minutes')),pass_percent:Number(val(form,'pass_percent')),attempt_limit:Number(val(form,'attempt_limit')),
      random_order:chk(form,'random_order'),shuffle_options:chk(form,'shuffle_options'),show_results:chk(form,'show_results'),
      show_answers:chk(form,'show_answers'),show_leaderboard:chk(form,'show_leaderboard'),access_mode:val(form,'access_mode'),pin:val(form,'pin'),
      group_id:val(form,'group_id')?Number(val(form,'group_id')):null,
      starts_at:start?new Date(start).toISOString():null,ends_at:end?new Date(end).toISOString():null};
    await api(card?`/api/admin/cards/${card.id}`:'/api/admin/cards',{method:card?'PUT':'POST',body:payload});
    await fetchCards();if(state.view==='cards')renderCards();if(state.view==='dashboard')renderDashboard();return true;
  },{wide:true,saveLabel:card?'O‘zgarishlarni saqlash':'Karta yaratish'});
  const updateMode=()=>{document.getElementById('auto-mode').classList.toggle('hide',val(document.getElementById('modal-form'),'mode')!=='auto');document.getElementById('manual-mode').classList.toggle('hide',val(document.getElementById('modal-form'),'mode')!=='manual')};
  const updatePin=()=>{document.getElementById('pin-block').classList.toggle('hide',val(document.getElementById('modal-form'),'access_mode')!=='pin')};
  document.getElementById('f_mode').addEventListener('change',updateMode);document.getElementById('f_access_mode').addEventListener('change',updatePin);updateMode();updatePin();
  document.querySelectorAll('.manual-question').forEach(x=>x.addEventListener('change',()=>{document.getElementById('f_question_count').value=document.querySelectorAll('.manual-question:checked').length}));
}
function toLocalInput(x){if(!x)return '';const d=new Date(x);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function openGroupEditor(){showModal('Yangi guruh',`<div class="form-grid">${field('name','Guruh nomi','','text','required placeholder="Front-end 2026"')}<div class="span2">${textArea('description','Tavsif','')}</div></div>`,async form=>{await api('/api/admin/groups',{method:'POST',body:{name:val(form,'name'),description:val(form,'description')}});await fetchGroups();if(state.view==='groups')renderGroups();return true})}
function openStudentEditor(){showModal('O‘quvchi qo‘shish',`<div class="form-grid">${field('name','Ism va familiya','','text','required minlength="3"')}${field('student_code','Noyob o‘quvchi kodi','','text','required minlength="3" placeholder="IT-001"')}${selectField('group_id','Guruh',[['','Guruhsiz'],...state.groups.map(x=>[String(x.id),x.name])],'')}</div>`,async form=>{await api('/api/admin/students',{method:'POST',body:{name:val(form,'name'),student_code:val(form,'student_code'),group_id:val(form,'group_id')?Number(val(form,'group_id')):null}});await fetchStudents();if(state.view==='groups')renderGroups();return true})}
function openImportModal(){
  showModal('CSV savollar importi',`<div class="grid" style="gap:15px"><div class="hint-panel">${ico('info')}<div><strong>CSV struktura</strong><p>Ustunlar: <code>title,category,topic,level,kind,option_a,option_b,option_c,option_d,correct,explanation</code>.<br><code>correct</code> maydonida A yoki A|C bo‘lishi mumkin.</p></div></div><div class="form-field"><label>CSV fayl</label><input id="csv-file" type="file" accept=".csv,text/csv" required></div><button type="button" class="btn ghost sm" data-act="download-template">${ico('download')} CSV namuna shabloni</button></div>`,async()=>{
    const file=document.getElementById('csv-file').files[0];if(!file){toast('CSV faylni tanlang','error');return false}
    const content=await file.text();const rows=csvParse(content.replace(/^\uFEFF/,''));if(rows.length<2)throw new Error('CSV fayl bo‘sh');const head=rows.shift().map(s=>s.trim().toLowerCase());
    const out=rows.filter(x=>x.some(y=>y.trim())).map(line=>{
      const obj=Object.fromEntries(head.map((name,i)=>[name,(line[i]||'').trim()]));const opts=['a','b','c','d','e','f','g','h'].filter(k=>obj['option_'+k]).map(k=>({id:k,text:obj['option_'+k]}));
      return {title:obj.title,category:obj.category,topic:obj.topic||'',level:obj.level||'medium',kind:obj.kind||'single',points:Number(obj.points)||1,
        options:opts,correct:(obj.correct||'').toLowerCase().split('|').map(x=>x.trim()).filter(Boolean),explanation:obj.explanation||'',code:obj.code||''};
    });if(!out.length)throw new Error('Import uchun qator topilmadi');const r=await api('/api/admin/questions/import',{method:'POST',body:{rows:out}});toast(`${r.count} ta savol import qilindi`,'success');await fetchQuestions();if(state.view==='questions')renderQuestions();return true;
  },{saveLabel:'Savollarni import qilish'});
}
function csvParse(txt){const out=[];let cells=[],cur='',quote=false;for(let i=0;i<txt.length;i++){let c=txt[i];if(c==='"'){if(quote&&txt[i+1]==='"'){cur+='"';i++}else quote=!quote}else if(c===','&&!quote){cells.push(cur);cur=''}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&txt[i+1]==='\n')i++;cells.push(cur);out.push(cells);cells=[];cur=''}else cur+=c}if(cur||cells.length){cells.push(cur);out.push(cells)}return out}
function saveTextFile(file,data,type='text/plain;charset=utf-8'){const blob=new Blob(['\ufeff',data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function shareCard(id){const c=state.cards.find(x=>x.id===Number(id));if(!c)return;const link=cardPath(c.slug);showModal('Kartani ulashish',`<div class="grid" style="gap:16px"><div class="hint-panel">${ico('share')}<div><strong>${e(c.title)}</strong><p>Kartani faollashtiring, keyin havolani o‘quvchilarga yuboring.</p></div></div><div class="form-field"><label>Karta havolasi</label><div class="flex gap8"><input class="input" readonly id="share-url" value="${e(link)}"><button class="btn soft" type="button" data-act="copy-share">${ico('copy')} Nusxa</button></div></div><div class="flex between"><span class="pill blue">${e(c.slug)}</span>${pillStatus(c.status)}</div><a href="/t/${encodeURIComponent(c.slug)}" target="_blank" rel="noopener" class="btn outline full">${ico('eye')} O‘quvchi ko‘rinishida ochish</a></div>`,async()=>true,{saveLabel:'Yopish'});}
function cardMenu(id){const c=state.cards.find(x=>x.id===Number(id));if(!c)return;
  showModal('Karta boshqaruvi',`<div class="grid" style="gap:11px"><div class="hint-panel">${ico('layers')}<div><strong>${e(c.title)}</strong><p>${e(c.slug)} · ${c.attempts_count} ta urinish · ${c.question_count} savol</p></div></div>
    <button class="btn outline full" type="button" data-act="card-edit" data-id="${c.id}">${ico('edit')} Kartani tahrirlash</button>
    <button class="btn outline full" type="button" data-act="card-duplicate" data-id="${c.id}">${ico('copy')} Nusxa yaratish</button>
    ${c.status!=='active'?`<button class="btn soft full" type="button" data-act="card-status" data-status="active" data-id="${c.id}">${ico('play')} Faollashtirish</button>`:`<button class="btn danger full" type="button" data-act="card-status" data-status="closed" data-id="${c.id}">${ico('pause')} Yopish</button>`}
    ${c.status!=='archived'?`<button class="btn ghost full" type="button" data-act="card-status" data-status="archived" data-id="${c.id}">Arxivlash</button>`:''}
    </div>`,async()=>true,{saveLabel:'Yopish'});
}
async function updateCardStatus(id,status){await api(`/api/admin/cards/${id}/status`,{method:'POST',body:{status}});closeModal();toast('Karta holati yangilandi','success');await fetchCards();if(state.view==='cards')renderCards()}

function publicHeader(title='',timer=false){return `<header class="exam-top"><a href="/" data-link>${brand()}</a><div class="exam-top-mid">${e(title)}</div><div class="exam-top-end">${timer?`<div class="timer" id="timer">${ico('clock')} <strong id="timer-val">--:--</strong></div>`:''}<button class="btn ghost sm" data-act="go-home" title="Bosh sahifa">${ico('home')} <span class="small">Bosh sahifa</span></button></div></header>`}
async function renderStart(slug){
  stopExam();app.innerHTML=`<div class="exam-world">${publicHeader()}${loading('Test kartasi ochilmoqda...')}</div>`;
  try{
    const {card}=await api('/api/public/cards/'+encodeURIComponent(slug));state.activeCard=card;
    const save=loadSavedSession(slug);
    const active=card.status==='active';
    app.innerHTML=`<div class="exam-world">${publicHeader(card.title)}<div class="exam-start"><div class="card start-card"><div class="start-top"><div class="start-badge">SYSONE TESTLAB · EXAM CARD</div><h1>${e(card.title)}</h1><p>${e(card.description||'Bilimingizni sinab ko‘rish uchun tayyorlangan test. Omad!')}</p></div>
      <div class="start-stats"><div><strong>${card.question_count}</strong><span>Savollar</span></div><div><strong>${card.duration_minutes} min</strong><span>Vaqt limiti</span></div><div><strong>${card.pass_percent}%</strong><span>O‘tish bali</span></div></div>
      <div class="start-body"><h3>Test qoidalari</h3><ul class="start-rules"><li>${ico('checkcircle')} Har bir savolni diqqat bilan o‘qing va javobni belgilang.</li><li>${ico('checkcircle')} Javoblaringiz har bir tanlovdan keyin avtomatik saqlanadi.</li><li>${ico('checkcircle')} Vaqt tugagach, test avtomatik yakunlanadi.</li><li>${ico('checkcircle')} Sahifani yangilasangiz ham taymer qaytadan boshlanmaydi.</li></ul>
      ${save?`<div class="hint-panel mt24">${ico('info')}<div><strong>Oldingi urinish topildi</strong><p>Agar avval test boshlagan bo‘lsangiz, shu urinishni davom ettirishingiz yoki natijani ochishingiz mumkin.</p><button class="btn soft sm mt12" data-act="resume-attempt" data-slug="${e(slug)}">${ico('play')} Urinishni davom ettirish</button></div></div>`:''}
      ${active?`<form id="start-form"><div class="start-form"><div class="form-field"><label>Ism</label><input name="first_name" type="text" required minlength="2" maxlength="60" placeholder="Ismingiz" autocomplete="given-name"></div><div class="form-field"><label>Familiya</label><input name="last_name" required minlength="2" maxlength="60" placeholder="Familiyangiz" autocomplete="family-name"></div>
      <div class="form-field"><label>O‘quvchi kodi (agar berilgan bo‘lsa)</label><input name="student_code" maxlength="64" placeholder="Masalan: IT-001" autocomplete="off"></div>${card.access_mode==='pin'?`<div class="form-field"><label>Karta PIN kodi</label><input type="password" name="pin" required placeholder="PIN kod"></div>`:''}</div>
      <button type="submit" class="btn full mt24" style="min-height:52px">${ico('play')} Testni boshlash ${ico('arrow')}</button></form>`:
      `<div class="hint-panel mt24">${ico('warning')}<div><strong>Test hozir ochiq emas</strong><p>${card.status==='draft'?'Karta hali faollashtirilmagan.':card.status==='closed'?'O‘qituvchi testni yopgan.':'Test hozir mavjud emas.'}</p></div></div>`}
      <p class="center muted tiny mt20">Testni boshlash orqali natijalaringiz o‘qituvchi panelida saqlanishiga rozilik bildirasiz.</p>
      </div></div></div></div>`;
    const form=document.getElementById('start-form');form?.addEventListener('submit',async event=>{
      event.preventDefault();const f=new FormData(form);const first=String(f.get('first_name')||'').trim(),last=String(f.get('last_name')||'').trim();
      if(!first||!last)return toast('Ism va familiyani kiriting','error');
      const btn=form.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Test tayyorlanmoqda...';
      try{const x=await api('/api/public/cards/'+encodeURIComponent(slug)+'/attempts',{
        method:'POST',body:{name:first+' '+last,student_code:f.get('student_code')||'',pin:f.get('pin')||''}});
        saveSession(slug,x.attempt_id,x.token);await openExam(x.attempt_id,x.token,slug);
      }catch(err){errorToast(err);btn.disabled=false;btn.innerHTML=`${ico('play')} Testni boshlash ${ico('arrow')}`}
    });
  }catch(err){app.innerHTML=`<div class="exam-world">${publicHeader()}<div class="exam-start">${empty('warning','Karta ochilmadi',err.message,`<button class="btn" data-act="go-home">Bosh sahifaga qaytish</button>`)}</div></div>`}
}
function sessionKey(slug){return 'sysone_testlab_'+slug}
function saveSession(slug,id,token){localStorage.setItem(sessionKey(slug),JSON.stringify({id,token,slug}))}
function loadSavedSession(slug){try{return JSON.parse(localStorage.getItem(sessionKey(slug))||'null')}catch{return null}}
function savedSessionById(id){for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith('sysone_testlab_'))continue;try{const val=JSON.parse(localStorage.getItem(key));if(val.id===id)return val}catch{}}return null}
let examTick=null, activityInterval=null, savingQueue=Promise.resolve(),activityQueue=Promise.resolve(),activeStart=0,hidden=false,finishing=false;
function stopExam(){if(state.exam&&!hidden)flushActivity();if(examTick)clearInterval(examTick);if(activityInterval)clearInterval(activityInterval);examTick=null;activityInterval=null;state.exam=null}
async function openExam(id,token,slug){
  app.innerHTML=`<div class="exam-world">${publicHeader('',true)}${loading('Savollar yuklanmoqda...')}</div>`;
  try{
    const data=await api('/api/public/attempts/'+id,{token});
    if(data.attempt.status==='submitted'){saveSession(slug,id,token);go('/result/'+id);return}
    state.exam={id,token,slug,card:data.card,attempt:data.attempt,questions:data.questions,current:0,
      serverOffset:data.server_time*1000-Date.now(),lastSaved:true,showNavigator:false};
    savingQueue=Promise.resolve();activityQueue=Promise.resolve();finishing=false;state.exam.saveError=false;
    renderExam();
    examTick=setInterval(tick,1000);
    activityInterval=setInterval(()=>{if(!document.hidden&&state.exam)flushActivity()},8000);
  }catch(err){errorToast(err);await renderStart(slug)}
}
function tick(){const x=state.exam;if(!x)return;const el=document.getElementById('timer-val');if(!el)return;
  const current=(Date.now()+x.serverOffset)/1000;const remaining=Math.max(0,Math.ceil(x.attempt.expires_at-current));
  el.textContent=fmtTime(remaining);document.getElementById('timer')?.classList.toggle('warning',remaining<=60);
  if(remaining<=0&&!finishing)finishExam(true);
}
function viewQuestion(index){const x=state.exam;if(!x)return;if(index<0||index>=x.questions.length)return;
  flushActivity();x.current=index;renderExam();
}
function renderExam(){const x=state.exam;if(!x)return;const q=x.questions[x.current],position=x.current+1;
  const answered=x.questions.filter(q=>q.answer?.length).length;
  const progress=(answered/x.questions.length)*100;
  app.innerHTML=`<div class="exam-world">${publicHeader(x.card.title,true)}<div class="exam-workspace"><section class="exam-center">
    <div class="exam-step-head"><span class="small muted">Savol <strong style="color:#1f3458">${position}</strong> / ${x.questions.length}</span><span class="small muted">${answered} ta javob berildi</span></div>
    <div class="progress-track"><div id="exam-progress" style="width:${progress}%"></div></div>
    <div class="card exam-question"><div class="q-label"><div class="flex gap8"><span class="pill blue">${String(position).padStart(2,'0')} · ${e(q.category||'TEST')}</span><span class="pill ${q.level==='easy'?'green':q.level==='medium'?'orange':'red'}">${e(levText[q.level])}</span></div><span class="tiny muted">${q.points} ball</span></div>
    <h1 class="q-title">${e(q.title)}</h1>${q.code?`<pre class="code-box">${e(q.code)}</pre>`:''}
    <div class="answers" role="group" aria-label="Javob variantlari">${q.options.map((opt,i)=>`<button class="answer ${q.answer.includes(opt.id)?'selected':''}" type="button" data-act="answer-option" data-option="${e(opt.id)}" aria-pressed="${q.answer.includes(opt.id)}"><span class="answer-letter">${String.fromCharCode(65+i)}</span><span class="answer-text">${e(opt.text)}</span>${q.answer.includes(opt.id)?ico('checkcircle','answer-check'):''}</button>`).join('')}</div>
    <p class="answer-hint">${ico('info','sm')} ${q.kind==='multiple'?'Bir nechta variantni belgilashingiz mumkin.':'Bitta javobni tanlang.'} Klaviaturada 1–8 tugmalaridan foydalanishingiz mumkin.</p></div>
    <div class="exam-bottom"><button class="btn outline" data-act="exam-prev" ${x.current===0?'disabled':''}>${ico('left')} Oldingi</button>
      <div class="save-status" id="save-indicator">${ico('checkcircle')} ${x.lastSaved?'Javoblar saqlandi':'Saqlanmoqda...'}</div>
      ${x.current===x.questions.length-1?`<button class="btn" data-act="exam-finish">${ico('check')} Yakunlash</button>`:`<button class="btn" data-act="exam-next">Keyingi savol ${ico('arrow')}</button>`}
    </div><button class="btn ghost full mobile-nav-toggle mt20" data-act="toggle-navigator">${ico('layout')} Savollar navigatori</button></section>
    <aside class="card side-panel ${x.showNavigator?'open':''}" id="exam-side"><div class="flex between"><h3>Savollar navigatori</h3><span class="pill blue" id="nav-progress">${answered}/${x.questions.length}</span></div><p>Savollar bo‘ylab erkin harakatlaning</p>
    <div class="nav-tiles" id="nav-tiles">${x.questions.map((sq,i)=>`<button class="nav-tile ${sq.answer.length?'answered':''} ${i===x.current?'current':''}" data-act="jump-question" data-index="${i}" aria-label="${i+1}-savol" ${i===x.current?'aria-current="step"':''}>${i+1}</button>`).join('')}</div>
    <div class="nav-legend"><div><span class="legend-dot current"></span> Joriy</div><div><span class="legend-dot answered"></span> Javoblangan</div><div><span class="legend-dot"></span> Javobsiz</div></div>
    <div class="divider"></div><div class="exam-side-help">${ico('shield')} <strong>Test xavfsiz saqlanadi</strong><p>Javoblar serverda saqlanadi. Sahifani qayta ochsangiz ham taymer davom etadi.</p></div>
    <button class="btn ghost full mt20" data-act="exam-finish">${ico('check')} Testni yakunlash</button></aside></div></div>`;
  activeStart=performance.now();hidden=document.hidden;
  sendActivity(position,0,true);tick();
}
function renderChoiceSelection(){const x=state.exam;if(!x)return;const q=x.questions[x.current];
  document.querySelectorAll('[data-act="answer-option"]').forEach(el=>{
    const yes=q.answer.includes(el.dataset.option);el.classList.toggle('selected',yes);el.setAttribute('aria-pressed',String(yes));
    const old=el.querySelector('.answer-check');if(old)old.remove();if(yes)el.insertAdjacentHTML('beforeend',ico('checkcircle','answer-check'));
  });
  const done=x.questions.filter(x=>x.answer.length).length;
  const prog=document.getElementById('exam-progress');if(prog)prog.style.width=100*done/x.questions.length+'%';
  const badges=document.getElementById('nav-progress');if(badges)badges.textContent=`${done}/${x.questions.length}`;
  document.querySelectorAll('[data-act="jump-question"]').forEach((el,i)=>el.classList.toggle('answered',x.questions[i].answer.length>0));
  const status=document.getElementById('save-indicator');if(status)status.innerHTML=`${ico('clock')} Saqlanmoqda...`;
}
function selectAnswer(option){const x=state.exam;if(!x||finishing)return;const q=x.questions[x.current];
  if(q.kind==='multiple') q.answer=q.answer.includes(option)?q.answer.filter(v=>v!==option):[...q.answer,option];
  else q.answer=[option];
  const position=q.position,answer=[...q.answer];x.lastSaved=false;renderChoiceSelection();
  savingQueue=savingQueue.catch(()=>{}).then(async()=>{
    await api(`/api/public/attempts/${x.id}/answers`,{method:'PUT',token:x.token,body:{position,answer}});
    if(state.exam===x){x.lastSaved=true;x.saveError=false;const el=document.getElementById('save-indicator');if(el)el.innerHTML=`${ico('checkcircle')} Javob saqlandi`}
  }).catch(err=>{if(state.exam===x){x.lastSaved=false;x.saveError=true;const el=document.getElementById('save-indicator');if(el)el.innerHTML=`${ico('warning')} Saqlanmadi`};errorToast(err)});
}
function sendActivity(position,spent_ms,entered=false){const x=state.exam;if(!x)return;
  activityQueue=activityQueue.catch(()=>{}).then(()=>api(`/api/public/attempts/${x.id}/activity`,{
    method:'POST',token:x.token,body:{position,spent_ms:Math.max(0,Math.min(30000,Math.round(spent_ms))),entered}})).catch(err=>console.warn('activity:',err.message));
}
function flushActivity(){const x=state.exam;if(!x||hidden)return;
  const time=performance.now();const spent=Math.min(time-activeStart,30000);
  activeStart=time;if(spent>100)sendActivity(x.current+1,spent,false);
}
function finishExam(auto=false){const x=state.exam;if(!x||finishing)return;
  if(!auto){const remaining=x.questions.filter(q=>!q.answer.length).length;
    if(!confirm(remaining?`Siz ${remaining} ta savolga javob bermadingiz. Testni yakunlaysizmi?`:'Testni yakunlashni tasdiqlaysizmi?'))return}
  finishing=true;
  (async()=>{
    try{flushActivity();await savingQueue.catch(()=>{});await activityQueue.catch(()=>{});
      if(x.saveError&&!auto)throw new Error('Oxirgi javob saqlanmagan. Internetni tekshirib, qaytadan urinib ko‘ring.');
      await api(`/api/public/attempts/${x.id}/finish`,{method:'POST',token:x.token});
      if(auto)toast('Vaqt tugadi. Test avtomatik yakunlandi.','info');
      go('/result/'+x.id);
    }catch(err){finishing=false;errorToast(err)}
  })();
}
document.addEventListener('visibilitychange',()=>{if(!state.exam)return;if(document.hidden){flushActivity();hidden=true}else{hidden=false;activeStart=performance.now();tick()}});
window.addEventListener('pagehide',()=>{if(state.exam)flushActivity()});
window.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&modalRoot.children.length){closeModal();return}
  if(!state.exam||modalRoot.children.length||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)||event.altKey||event.metaKey||event.ctrlKey)return;
  const x=state.exam;
  if(/^[1-8]$/.test(event.key)){const q=x.questions[x.current];const opt=q.options[Number(event.key)-1];if(opt)selectAnswer(opt.id)}
  if(event.key==='ArrowRight'&&x.current<x.questions.length-1)viewQuestion(x.current+1);
  if(event.key==='ArrowLeft'&&x.current>0)viewQuestion(x.current-1);
});

async function openResult(id){
  stopExam();const ses=savedSessionById(id);
  if(!ses){app.innerHTML=`<div class="exam-world">${publicHeader()}<div class="result-wrap">${empty('lock','Sessiya topilmadi','Natijani ochish uchun testni ishlagan brauzer sessiyasi kerak.')}</div></div>`;return}
  app.innerHTML=`<div class="exam-world">${publicHeader()}${loading('Natija hisoblanmoqda...')}</div>`;
  try{const response=await api(`/api/public/attempts/${id}/result`,{token:ses.token});
    if(response.hidden){app.innerHTML=`<div class="exam-world">${publicHeader()}<div class="result-wrap">${empty('lock','Natija yashirilgan',response.message,`<button class="btn" data-act="go-home">Bosh sahifa</button>`)}</div></div>`;return}
    const r=response.result,card=response.card;
    app.innerHTML=`<div class="exam-world">${publicHeader(card.title)}<div class="result-wrap"><div class="card result-hero"><div class="score-ring" style="--p:${Math.max(0,Math.min(100,r.percentage))}%"><div class="score-inside"><strong>${r.percentage}%</strong><span>Natija</span></div></div>
    <div class="result-heading"><span class="pill ${r.passed?'green':'orange'}">${ico(r.passed?'checkcircle':'info')} ${r.passed?'Muvaffaqiyatli':'O‘tish balidan past'}</span><h1>${e(r.student_name)}, test yakunlandi!</h1><p>«${e(card.title)}» testi natijasi tayyor. Quyida ishlagan savollaringiz va vaqt statistikasi keltirilgan.</p><div class="flex gap8 wrap mt16"><span class="pill blue">${ico('clock')} ${fmtTime(r.duration_seconds)}</span>${r.rank?`<span class="pill orange">${ico('trophy')} ${r.rank}-o‘rin / ${r.participants}</span>`:''}<span class="pill">O‘tish bali: ${card.pass_percent}%</span></div></div></div>
    <div class="result-metrics"><div class="card result-metric"><strong class="success-text">${r.correct_count}</strong><span>To‘g‘ri javob</span></div><div class="card result-metric"><strong class="danger-text">${r.incorrect_count}</strong><span>Noto‘g‘ri</span></div><div class="card result-metric"><strong>${r.unanswered_count}</strong><span>Javobsiz</span></div><div class="card result-metric"><strong>${r.average_question_seconds}s</strong><span>O‘rtacha savol vaqti</span></div></div>
    <div class="card mt24 no-overflow"><div class="section-head"><div><h2>Savollar bo‘yicha tahlil</h2><span class="section-sub">Har bir savolga sarflangan faol vaqt</span></div><span class="pill">${r.questions.length} savol</span></div>
    ${r.questions.map(q=>`<div class="question-result-row"><div class="result-index">${q.position}</div><div style="min-width:0"><strong>${e(q.title)}</strong><small>${e(levText[q.level])}${q.explanation?` · ${e(q.explanation)}`:''}</small>
      ${q.options?`<div class="tiny muted mt8">${q.options.filter(o=>q.answer?.includes(o.id)).map(o=>'Siz: '+e(o.text)).join('; ')||'Javob yo‘q'}<br>${q.options.filter(o=>q.correct.includes(o.id)).map(o=>'To‘g‘ri: '+e(o.text)).join('; ')}</div>`:''}</div>
      <span class="tiny muted">${Math.round(q.spent_ms/1000)} sek</span><span class="pill ${q.is_correct?'green':q.answered?'red':'orange'}">${q.is_correct?'To‘g‘ri':q.answered?'Xato':'Javobsiz'}</span></div>`).join('')}</div>
    <div class="flex between wrap gap12 mt24"><button class="btn outline" data-act="back-to-card" data-slug="${e(ses.slug)}">${ico('left')} Karta sahifasi</button>${card.show_leaderboard?`<button class="btn" data-act="show-leaderboard" data-slug="${e(ses.slug)}">${ico('trophy')} Reytingni ko‘rish</button>`:''}</div>
    <div id="leaderboard-panel"></div></div></div>`;
  }catch(err){app.innerHTML=`<div class="exam-world">${publicHeader()}<div class="result-wrap">${empty('warning','Natijani ochib bo‘lmadi',err.message)}</div></div>`}
}
async function showLeaderboard(slug){const target=document.getElementById('leaderboard-panel');if(!target)return;target.innerHTML=loading('Reyting yuklanmoqda...');
  try{const data=await api(`/api/public/cards/${encodeURIComponent(slug)}/leaderboard`);target.innerHTML=`<div class="card mt24 no-overflow"><div class="section-head"><h2>${ico('trophy')} Test reytingi</h2><span class="section-sub">Eng yaxshi natijalar</span></div><div class="table-wrap"><table class="table"><thead><tr><th>O‘rin</th><th>O‘quvchi</th><th>Natija</th><th>Vaqt</th></tr></thead><tbody>${data.items.map(x=>`<tr><td><strong>#${x.rank}</strong></td><td>${e(x.name)}</td><td>${x.percentage}%</td><td>${fmtTime(x.duration_seconds)}</td></tr>`).join('')}</tbody></table></div></div>`}
  catch(err){target.innerHTML=empty('warning','Reytingni ochib bo‘lmadi',err.message)}
}

// All navigational controls are data-driven; user input is HTML-escaped before insertion.
document.addEventListener('click',async event=>{
  const link=event.target.closest('a[data-link]');if(link){event.preventDefault();go(link.getAttribute('href'));return}
  const btn=event.target.closest('[data-act]');if(!btn)return;
  const act=btn.dataset.act,id=Number(btn.dataset.id||0);
  try{
    if(act==='go-home')return go('/');
    if(act==='admin-login')return go('/admin/login');
    if(act==='mobile-menu'){state.sidebarOpen=!state.sidebarOpen;document.getElementById('shell')?.classList.toggle('sidebar-open',state.sidebarOpen);return}
    if(act==='close-modal')return closeModal();
    if(act==='reload')return route();
    if(act==='logout'){await api('/api/auth/logout',{method:'POST'});state.user=null;toast('Hisobdan chiqildi');return go('/admin/login')}
    if(act==='new-question'){await fetchQuestions();return openQuestionEditor()}
    if(act==='edit-question')return openQuestionEditor(id);
    if(act==='delete-question'){if(confirm('Savolni arxivlashni tasdiqlaysizmi?')){await api(`/api/admin/questions/${id}`,{method:'DELETE'});await fetchQuestions();renderQuestions();toast('Savol arxivlandi','success')}return}
    if(act==='import-questions')return openImportModal();
    if(act==='download-template')return saveTextFile('testlab_questions_template.csv','title,category,topic,level,kind,option_a,option_b,option_c,option_d,correct,explanation\n"Python len() funksiyasi nima qiladi?",Python,Funksiyalar,easy,single,"Uzunlikni qaytaradi","Sonlarni qo‘shadi","Faylni ochadi","Kod xatosi",a,"Elementlar soni qaytadi"\n','text/csv;charset=utf-8');
    if(act==='new-card'){await Promise.all([fetchQuestions(),fetchGroups()]);return openCardEditor()}
    if(act==='share-card')return shareCard(id);
    if(act==='card-menu')return cardMenu(id);
    if(act==='card-edit'){closeModal();return openCardEditor(id)}
    if(act==='card-status')return await updateCardStatus(id,btn.dataset.status);
    if(act==='card-duplicate'){await api(`/api/admin/cards/${id}/duplicate`,{method:'POST'});closeModal();await fetchCards();renderCards();toast('Karta nusxasi yaratildi','success');return}
    if(act==='card-analytics'){state.selectedAnalytics=id;return go('/admin/analytics')}
    if(act==='view-analytics')return go('/admin/analytics');
    if(act==='export-analytics'){
      if(!state.selectedAnalytics)return toast('Avval test kartasini yarating','error');
      const response=await fetch(`/api/admin/cards/${state.selectedAnalytics}/export`,{credentials:'same-origin'});
      if(!response.ok)throw new Error('Eksport amalga oshmadi');
      const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`testlab_${state.selectedAnalytics}_results.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(act==='new-group')return openGroupEditor();
    if(act==='new-student')return openStudentEditor();
    if(act==='seed-demo'){
      if(!confirm('Bo‘sh bazaga 16 ta namuna savolni qo‘shamizmi?'))return;
      const r=await api('/api/admin/demo-seed',{method:'POST'});toast(`${r.count} ta namuna savol qo‘shildi`,'success');await renderDashboard();return;
    }
    if(act==='copy-share'){await navigator.clipboard.writeText(document.getElementById('share-url').value);toast('Havola nusxalandi','success');return}
    if(act==='resume-attempt'){const slug=btn.dataset.slug;const ses=loadSavedSession(slug);if(!ses)return toast('Sessiya topilmadi','error');return await openExam(ses.id,ses.token,slug)}
    if(act==='answer-option')return selectAnswer(btn.dataset.option);
    if(act==='exam-prev')return viewQuestion(state.exam?.current-1);
    if(act==='exam-next')return viewQuestion(state.exam?.current+1);
    if(act==='jump-question')return viewQuestion(Number(btn.dataset.index));
    if(act==='toggle-navigator'){state.exam.showNavigator=!state.exam.showNavigator;document.getElementById('exam-side')?.classList.toggle('open',state.exam.showNavigator);return}
    if(act==='exam-finish')return finishExam();
    if(act==='back-to-card')return go('/t/'+encodeURIComponent(btn.dataset.slug));
    if(act==='show-leaderboard')return showLeaderboard(btn.dataset.slug);
  }catch(err){errorToast(err)}
});
route();
