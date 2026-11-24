# SYSONE TESTLAB 2.0 — WORK MASTER BRIEF (UZ)

**Hujjat turi:** To‘liq ishlab chiqish topshirig‘i, arxitektura qarorlari, qabul qilish mezonlari va Work agent uchun bajarish rejasi.  
**Maqsadli natija:** sinovdan o‘tgan, haqiqiy o‘qituvchilar foydalanadigan, ko‘p foydalanuvchili production platforma. **Demo/MVP/beta deb topshirilmasin.**  
**Hozirgi holat:** v1.0 lokal FastAPI + SQLite + JS frontend ishlaydi; bu hujjat v2.0 uchun **topshiriq**, v2.0 hali yozilmagan/deploy qilinmagan.  
**Asosiy mahsulot:** `SysOne TestLab` — `testlab.sysone.top` (dastlab taklif; DNS tasdiqlansin).  
**Brendga joylashuv:** `sysone.top` saytining Software / Dasturlar bo‘limida mahsulot kartasi; ishlash manzili alohida subdomen.  
**Joriy lokal loyiha:** `/home/eram-laptop/sysone-testlab` — Work ushbu yo‘l borligini tekshirsin, topilmasa foydalanuvchidan v1.0 ZIPni o‘sha Work chatiga ilova qilishni so‘rasin.  
**UI manba:** 2026-11-21 kuni olingan `image(20261121-044853).png` skrinshoti.  
**Joriy baza:** `app/db.py`: `admins`, `admin_sessions`, `groups`, `students`, `questions`, `cards`, `attempts`, `attempt_questions`.  
**Joriy backend:** `app/main.py` (FastAPI); `static/assets/app.js`, `app.css` (frontend); `tests/test_e2e.py`.  
**Brend fayli:** ilgari yaratilgan TestLab logo PNG (kerak bo‘lsa ilova qilingan fayldan foydalanilsin).

---

## WORKGA TO‘G‘RIDAN-TO‘G‘RI TOPSHIRIQ

Siz SysOne TestLab 2.0 uchun lead engineer, product designer, security engineer va QA muhandisi sifatida ishlang. Mavjud 1.0 kodini sinchiklab o‘qing, production migratsiya rejasini chiqaring, keyin haqiqiy ishlaydigan kodni implementatsiya qiling, sinovdan o‘tkazing, GitHub CI/CDni sozlang va `testlab.sysone.top` ga faqat tekshirilgandan keyin deploy qiling. Demo yoki mock endpointlar bilan funksiyalarni «tayyor» deb e’lon qilmang. Oldingi ishlaydigan test sessiya, savol, karta va statistika mexanizmlarini saqlang. Oldingi SQLite ma’lumotlarini xavfsiz eksport/migratsiya qilish yo‘lini tayyorlang. Server va GitHub resurslariga real huquq bo‘lmasa, bajarilmagan ishni bajarilgandek ko‘rsatmang; lokal kod, migratsiya, test va deploy workflowini topshiring hamda qaysi credential/ulanish kerakligini aniq yozing. Production to‘liq tayyorligi faqat acceptance checklist va haqiqiy deploy verifikatsiyasidan keyin belgilanadi.

**Tanlangan amaliy stack (agar mavjud SysOne arxitekturasi bilan ziddiyat chiqmasa):**
- React + TypeScript + Vite + React Router, Tailwind CSS va maxsus design tokens;
- Cloudflare Workers (Hono API), Cloudflare D1 (relational data), R2 (media, eksport va backup);
- Telegram OIDC (+ user consent bo‘lsa `phone` scope) asosiy bepul auth; email+parol va tasdiqlashni qo‘shimcha usul sifatida joriy etish;
- Cloudflare Turnstile, server-side session cookie; GitHub Actions yoki Cloudflare Workers Builds;
- UI o‘zbek lotin tilida. Kod identifierlari va bazaning texnik maydonlari inglizcha bo‘lishi mumkin.

Agar Work boshqa stackni tanlasa, uning qiyosiy sababi, migration ta’siri va free-tier cheklovlarini hujjatlashtirsin. Mavjud FastAPI SQLite kodini aynan Workersga joylashtirish mumkin deb taxmin qilmasin; to‘g‘ri adapter/migratsiya tanlansin.

## 1. MAHSULOT ARXITEKTURASI VA ROLLAR

**Rollar:**
- `platform_owner`: yagona SysOne egasi; maxsus Owner OS, umumiy monitoring, store moderatsiyasi, abuse, tenant boshqaruvi. Oddiy self-registration orqali owner bo‘lish mutlaqo mumkin emas.
- `tenant_owner` (`teacher`): shaxsiy workspace yaratadi, guruhlar/savollar/kartalar/o‘quvchilar/statistikani boshqaradi.
- `tenant_staff` (keyinroq/iste’molga tayyor): faqat workspace egasi taklif qilgan yordamchi o‘qituvchi, ruxsatlari cheklangan.
- `student`: shaxsiy o‘quvchi profiliga ega bo‘lsa yoki karta uchun Guest Mode orqali test ishlasa.

**Tenant isolation:** Har bir o‘qituvchining mustaqil workspace IDsi bo‘ladi. O‘qituvchi A guruhi, o‘quvchisi, kartasi, savoli, importi, natijasi, eksporti, fayli, statistikasini B o‘qituvchi **hech qachon** ko‘rmasin. Public Storega ruxsat bilan chiqargan *savol kontenti* bundan istisno, lekin o‘quvchilar, urinishlar, savolning shaxsiy izohlari va eksportlar NEVER public. Har bir tenantda o‘z kategoriya, guruh, student_code uniqueness doirasi. Tashqi URLdagi IDga ishonib tenantni tanlamaslik; session va authorizationdan aniqlash.

## 2. AUTH — BARCHA O‘QITUVCHILAR UCHUN RO‘YXATDAN O‘TISH

- Public `/register`: ism/familiya, rol = teacher, ish joyi (ixtiyoriy), auth usuli, foydalanish qoidalari va maxfiylik siyosatiga rozilik.
- **Asosiy:** Telegram Login orqali OIDC Authorization Code Flow + PKCE, `openid profile phone` scope; `phone` bo‘yicha rozilik rad etilsa ham profilni auth qilish mumkin. `iss`, `aud`, `exp`, `nonce`, `state`, JWT signature JWKS orqali serverda tekshirilsin. Telegram user IDni doimiy identity sifatida saqlash; username o‘zgarsa ham akkaunt bog‘lanib qolsin.
- **Muqobil:** email+parol, email tasdiqlash va parol tiklash. Bepul email yetkazish xizmati sifatida Resend kabi yetkazib beruvchini ko‘rib chiqish; domain verification/DKIM/SPF, cheklov va delivery monitoring.
- **SMS OTP:** ishlab turgan bepul cheksiz SMS deb reklama qilinmasin; pullik provider va abonent xarajatini ko‘rsatmasdan yoqilmasin.
- Cookie: HttpOnly, Secure, SameSite, rotate on auth, server-side sessions/revocation, CSRF protection, brute-force throttling, Turnstile, login audit.
- Owner uchun alohida himoyalangan login (`/owner/login`), majburiy MFA imkoniyati, hech qachon ommaviy registration orqali role escalation emas. Owner bootstrap faqat xavfsiz server-side setup.
- Teacher akkaunti o‘chirilsa, tenant kontenti, o‘quvchi ma’lumotlari bo‘yicha eksport/o‘chirish siyosati ishlasin.

## 3. TEACHER STUDIO UX/UI REFACTOR (foydalanuvchi skrinshotiga asoslanadi)

- Umumiy dizayn: premium, odatiy generativ admin-templatega o‘xshamaydigan, qorishmagan vizual iyerarxiya, yengil animatsiya, aniq bo‘shliqlar, professional tipografika.
- **Chap sidebar/dock** asosiy kontentdan aniq ajralsin: mustaqil sirt rangi (oqdan biroz qoraroq yoki chuqur navy), `border-right`, yumshoq shadow, radiusli active nav, 248–264px kenglik, sticky/full-height, mobil ekranda slide-in drawer; kontent alohida soft-grey canvasda.
- Chap yuqoridagi `TEACHER STUDIO` yozuvi o‘rniga **«SysOne bilan bog‘lanish» / «Support»** aktiv tugmasi; click orqali yordam markazi, email va tasdiqlangan Telegram support manzili; hech qanday tasdiqlanmagan aloqa adresini kodga yozmang.
- Headerda workspace switcher (kelajak uchun), qidiruv, xabarlar, profil menyusi. Sidebar: Boshqaruv, Savollar bazasi, Import, Test kartalari, Guruhlar, O‘quvchilar, Analitika, Savollar do‘koni, Sozlamalar. Support/Chiqish pastda ham ishlashi mumkin.
- Dashboard: barcha KPI real tenant-scoped data; yangi karta, savol qo‘shish, import, oxirgi test urinishlari, «faol testlar», o‘rtacha natija va guruhlar dinamikasi.
- 3 holatning alohida UXsi: loading, empty state, API error. Debounced qidiruv, disabled button, optimistic update (faqat xavfsiz holatda), toast va retry.
- WCAG 2.2 AA, kontrast, keyboard-only navigation, reduced motion. Desktop/tablet/mobile ekranlar tasdiqlangan responsive maket.
- Oldingi Student Exam dizayni va funksiyalarini buzmasdan polish: progress, timer, savollar navigatori, to‘xtagan ulanishda restore, yakuniy natija, foiz/reytng.

## 4. SAVOLLAR BAZASI VA O‘ZBEKCHA EXCEL IMPORT

- `Teacher Studio → Savollar bazasi → Import` funksional bo‘lim bo‘lsin.
- Dastur ichida **«Excel shablonini yuklab olish»** va **«CSV shablonini yuklab olish»** tugmalari ishlasin.
- Standart yangi shablon fayli: `SysOne_TestLab_Import_Shablon_UZ_v2.xlsx` (shu topshiriqqa biriktirilgan).
- XLSX `Savollar` varag‘i, **1-qator to‘liq o‘zbekcha sarlavhalar**: `Savol matni`, `Fan / kategoriya`, `Mavzu`, `Qiyinchilik darajasi`, `Savol turi`, `A varianti` ... `H varianti`, `To‘g‘ri javob`, `Javob izohi`, `Ball`, `Dastur kodi`.
- Ichki texnik mapping kerak bo‘lsa (`title`, `category`, `topic`, `level`, `kind`, `option_a..h`, `correct`, `explanation`, `points`, `code`) **backend importerda o‘rnatilsin**, foydalanuvchiga inglizcha ustun ko‘rsatmasin.
- `Qiyinchilik`: Oson→easy, O‘rtacha→medium, Qiyin→hard, Ekspert→expert.
- `Savol turi`: Bitta javob→single, Bir nechta javob→multiple, To‘g‘ri / noto‘g‘ri→truefalse, Kodli savol→code.
- `To‘g‘ri javob`: `A`, `B` yoki `A|C`; faqat mavjud variant harflari.
- Sheetlar: `Savollar` (import qilinadi), `Namunalar` (faqat ko‘rish, import qilinmaydi), `Yo‘riqnoma`, `Lug‘at`.
- Oldingi inglizcha CSV (`title, category, ...`) import ham regressiyasiz ishlasin; import parser ikki formatni tanisin.
- File upload `.xlsx`/`.csv`, MIME sniff/size limit (dastlab 10 MB), 500–1000 savol/job maksimum; file parsing CPU by-pass, batch based, CSV UTF-8 BOM tolerant.
- **3 qadam:** Yuklash → Dastlabki tekshiruv → Bazaga tasdiqlab yozish. Preview hech narsa yozmasin. Import natijasi valid/invalid/dupe qatorlar; ustun/row bo‘yicha aniq xato; fail-all yoki valid-only siyosati foydalanuvchiga tushuntirilsin, transaction/idempotency bilan.
- Storega import paytida avtomatik yuborilmaydi. Barcha savollar private by default.
- Download endpoint `/api/v2/templates/questions.xlsx` metadata, CORS/security to‘g‘ri.

## 5. TEST CARDS / STUDENT EXAM / ANALYTICS

- Karta: nom, fan, mavzu, random/manual question selection, difficulty mix, time limit, pass %, attempts, group restriction, code/PIN, start/end time, shuffle, result policy, review policy.
- O‘quvchi Guest Mode (ism/familiya) yoki ro‘yxatdagi `student_code` orqali kiradi; karta `tenant_id`ga tegishli; clientga correct answers yuborilmaydi.
- Kartaning shaffof public IDsi (`slug`, ULID), karta owner validation va tenant-specific room context. Bir foydalanuvchining karta kodlari global random noyob bo‘lsin.
- Test session: UTC start/end, **server-authoritative expiry**, auto-submit, refresh/resume, idempotent final submission, snapshot/version pinning, tamper-resistant grading.
- Har bir savol bo‘yicha faol vaqtni **taxminiy telemetriya** sifatida alohida saqlash; umumiy timer server authoritative. Har sekund D1ga yozmaslik (bepul write quota), navigate/answer paytida debounced batch. Visibility/focus holati manipulyatsiyaga ochiq: cheating isboti deb qabul qilinmasin.
- Result: scores, %, passed, correct/incorrect/unanswered, question duration, median & average, group/card ranking (teng %da kamroq sarflangan vaqt); student natijalari cross-tenant chiqmasin.
- Export: XLSX/CSV tenant-scoped, student's personal data default private. Rate limit/page/retention.

## 6. QUESTIONS STORE — FAQAT OWNER MODERATSIYASI BILAN

Do‘kon — bepul ochiq savollar kutubxonasi; moliyaviy savdo/tolov tizimi hozir talab qilinmagan.

**Asosiy qoida:** foydalanuvchilar kiritgan savollar **avtomatik ommaga chiqmaydi**. Default `private`.

Teacher: `Private question → «Storega taklif qilish» (explicit consent, original ekanini tasdiqlash, ruxsat/litsenziya) → moderation_pending`.

Owner OS: `pending → review → approve/reject/request_changes/revoke`; kategoriya/teg/daraja, copy-right, spam, duplicates, yechim, sifat tekshiriladi; qarorlar audit logga yoziladi.

Store: approved item only; qidiruv, kategoriya, qiyinchilik, ko‘rish, testga qo‘shish (private tenant copy/immutable version), author attribution ixtiyoriy, reporting, takedown.

**Muhim:** teacherning original savollarini ruxsatsiz ommaga ko‘rsatish, student natijalarini, student ismlarini, yopiq test/kartalarni storega chiqarish mumkin emas. Owner moderatsiyasi faqat teacher explicit taqdim etgan kontentga ishlasin. Ownerning operatsion monitoringi student shaxsiy ma’lumotlarini default ko‘rsatmasin.

## 7. OWNER OS — MUSTAQIL OWNER CONSOLE

Mumkin URL: `/owner` (kerak bo‘lsa `owner.testlab.sysone.top`, lekin DNS/deploy murakkabligini oshirmaslik uchun avval path); alohida shell/layout va qo‘shimcha himoya.

Bo‘limlar:
1. **Overview:** jami tenant, ro‘yxatdan o‘tishlar, kartalar, savollar, test sessiyalar, D1 reads/writes/storage, Workers requests, error rate, quotalar.
2. **Teacher Accounts:** bloklash, qayta faollashtirish, ruxsatlar, abuse va xavfsizlik nazorati.
3. **Store Moderation Queue:** pending/approved/rejected/takedown, comparison, duplicate alert, audit.
4. **Content Catalog:** store categories, feature flags, public question versions, visibility.
5. **Platform Operations:** support inbox, logs, API health, migrations, backups, release status, incidents.
6. **Settings & Security:** support kontaktlari, retention, global maintenance banner, MFA, owner sessionlar.

**Owner ma’lumotlarga kirishni cheklash:** Teacherning maxfiy ma’lumotlari uchun auditlangan, asosli, cheklangan support override; oddiy statistik ekranlarda individual student data chiqmasin. Owner admin token boshqa tenant role sifatida ishlatilmasin.

## 8. MULTI-TENANT DATA MODEL

Mavjud v1.0 bazasi ko‘p o‘qituvchi uchun xavfsiz emas: `admins`, `groups`, `students`, `questions`, `cards`, `attempts` bitta global scope; `tenant_id` yo‘q. v1.0 SQLite-ni production uchun shunchaki internetga chiqarish mumkin emas.

Minimal v2.0 jadvallar:
- `users(id, email?, telegram_sub?, display_name, phone_e164?, phone_verified, status, created_at)`
- `sessions(id_hash, user_id, expires_at, last_used_at, revoked_at)`
- `tenants(id, owner_user_id, slug, name, status, quotas_json, created_at)`
- `tenant_memberships(id, tenant_id, user_id, role, status)`
- `groups(id, tenant_id, name, description)`
- `students(id, tenant_id, group_id, student_code, name, status)`
- `questions(id, tenant_id, category, topic, level, kind, content_version, archived, ...)`
- `question_options(id, tenant_id, question_id, position, text, is_correct)` [correct answers never in public API]
- `cards(id, tenant_id, slug, settings_json, published_version, status, ...)`
- `card_questions(id, tenant_id, card_id, question_id, question_version, position)`
- `attempts(id, tenant_id, card_id, student_id?, student_display_name, server_token_hash, start_at, expires_at, status, score, ...)`
- `attempt_answers(id, tenant_id, attempt_id, question_snapshot_id, selected_json, earned_points, active_time_ms, saved_at)`
- `import_jobs(id, tenant_id, uploaded_by, filename, status, summary_json, ...)`
- `store_submissions(id, tenant_id, question_id, source_version, consent_at, license, moderation_status, reviewer_id, reviewed_at)`
- `store_items(id, publication_version, submission_id, public_content_json, category, status, published_at)`
- `owner_audit_logs(id, owner_user_id, action, target_type, target_id, reason, timestamp)`
- `rate_limit_events` / `support_tickets` / `system_settings` / `backup_manifest` (zaruratga ko‘ra).

**FK/index model:** composite PK/FK `(tenant_id, id)` yoki majburiy tenant scoping; `UNIQUE(tenant_id, group_name_normalized)`; `UNIQUE(tenant_id, student_code)`; `INDEX(tenant_id, card_id, status)`; `INDEX(tenant_id, category, level)`; `INDEX(tenant_id, created_at)`; Store jadvallarini faqat approved/public kontentga cheklash. D1 RLS bermaydi, shuning uchun har query/handlerda application-level permission va tenant filter test bilan majburiy tekshirilsin. Allowlist scope exceptions faqat moderatsiya va public Store uchun.

Migration: v1 DB backup → migration script → initial owner tenant seed → old cards/questions/students/attempts shu tenant bilan rekey → counts/hash + sample exam validation → cutover → rollback plan. Secrets/GitHub access matnga tushmasin. Migratsiyada password hashes rescan yoki majburiy reset haqida qaror qabul qilinsin.

## 9. BEPUL INFRASTRUKTURA VA XARAJAT CHEKLOVLARI (2026-11-21)

Tanlov: **Cloudflare Workers + D1 + R2**. Alohida VPS va har doim ishlaydigan Linux server shart emas. GitHub faqat source, migration va CI uchun; **production ma’lumotlar bazasi GitHubga yuklanmaydi**.

Rasmiy free limitlar:
- Workers: 100 000 request/kun, ~10ms CPU/request, 128MB memory;
- D1: 10 DB/account, **500 MB/DB**, umumiy **5GB/account** (10 ta DB x 500MB), 5 mln read row/kun, 100 ming write row/kun;
- R2 Standard: 10 GB-month storage/oy, 1 mln Class A operatsiya/oy, 10 mln Class B/oy; egress bepul;
- Supabase Free alternativ: 500MB Postgres DB, 1GB file storage, idle faollik bo‘lmasa pauza; agar tanlansa real project limitlari tasdiqlansin;
- Workers `.workers.dev` va `.pages.dev` default hostname; eng to‘g‘ri mahsulot URL: **mavjud `sysone.top` domenidagi bepul `testlab.sysone.top` subdomeni**. Mavjud domen uchun qayta domain fee kerak emas, DNS/Cloudflare to‘g‘ri konfiguratsiya qilinadi.

Hajm taxmini (faqat capacity planning; real DB profiling bilan tasdiqlanadi):
- Savol: o‘rtacha 2–6 KB (matn+variantlar+metadata+indexlar), 10 ming savol ≈ 20–60MB, 100 ming savol ≈ 200–600MB;
- 20 savollik bitta urinish (ixcham javoblar, snapshot/version bilan): taxminan 5–20KB; 10 ming urinish ≈ 50–200MB, 100 ming urinish ≈ 0.5–2GB;
- Rasm/ZIP/PDF D1ga emas, R2ga; katta media obyektlarini signed URL bilan faqat ruxsat doirasida uzatish;
- `attempt_questions.snapshot_json` to‘liq takroriy katta matnlarni saqlash oshirib yuborsa hajm yanada ortadi; Work optimallashtirsin.

**Ishlash limiti:** 1000 o‘quvchi × 20 savol × har bir javob uchun 1–2 write = 20–40 ming SQL update/insert (index write hisobiga bundan ko‘p); har sekund timer update qilish bepul D1ni tez to‘ldiradi. Shuning uchun heartbeat DBga yozilmaydi, debounced autosave/idempotent batch transaction, indekslar, pagination, caching, retention va limitchilar zarur. Free limitlar oshsa, D1 429/quota errors yoki 5xx emas, tushunarli server feedback; avtomatik pullik tarifga o‘tish taqiqlansin. Metrics 70%, 85%, 95% threshold alert.

**Qo‘shimcha bepul email:** Resend free tier rasmiy tarifini ishga tushirish vaqtida qayta tekshirib, verified domain bo‘lsa transaksion email uchun ishlatish. Gratis SMTP/OTP yetkazilishi production darajasida kafolatlanmaydi. Telegram login SMS xarajatini kamaytiradi.

Manbalar: 
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/r2/pricing/
- https://core.telegram.org/bots/telegram-login
- https://supabase.com/pricing
- https://resend.com/pricing
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## 10. GITHUB → SERVER AUTOMATIK DEPLOY

Repo nomi tavsiya: `SysOne/testlab` yoki egasi tomonidan tanlangan private repo. Hisobni Work haqiqatda tekshirmasdan taxmin qilmasin. `main` (production), `develop` (staging), feature branches, PR review. `.gitignore`: `.env*`, `data/*.sqlite3`, `data/first-login.txt`, `*.db`, `node_modules`, credentials, generated secrets, R2 backup exports.

CI: `npm ci` → lint/typecheck → unit/integration → E2E browser → security tests → build → migration dry-run → staging deploy/smoke. Production `main` merge / explicit release gate + `wrangler d1 migrations apply ... --remote` → deploy → postdeploy smoke → healthcheck. `CLOUDFLARE_API_TOKEN` va `CLOUDFLARE_ACCOUNT_ID` GitHub Secrets; local `.dev.vars` hech qachon push emas. GitHub Actions official wrangler-action yoki Cloudflare Workers Builds GitHub integration; bittasini izchil tanlash.

GitHub CI orqali **kod** va migratsiyalar serverga boradi; D1/R2 runtime data alohida Cloudflare hisobida saqlanadi. R2 backup va D1 Time Travel (Free 7 kun) uchun tiklash mashqi. Zero-downtime migration, rollback tags, changelog, observability.

## 11. PERFORMANCE / SECURITY / OPERATIONS

- Tenant boundaries API/resource/CSV/export/file URL/search/store/admin querylarda test; IDOR, mass assignment, CSRF, XSS, SQL injection, path traversal, OTP/auth abuse, session fixation, login bypass.
- Store leakage protection: publish consent, owner approve, public only sanitized immutable snapshot; no hidden answers if active exam uses same question? Storega savol chiqarilsa javobning ochiqligini teacher xabardor bo‘lsin.
- Rate limits per IP/user/tenant/endpoint, Turnstile on signup/login/abuse, idempotency on answer submit/import.
- PII: o‘quvchi ma’lumotlari faqat teacher workspace uchun, shartli qisqartirilgan leaderboard, yashirilgan email/phone, privacy notice, eksport/delete, minors protection. Data retention configurable; owner audit log.
- Monitoring: request count/day, D1 read/write rows, DB size, CPU time, p50/p95, 5xx, errors, auth failures, import errors, tenant isolation tests, backup recency.
- Performance: 100 parallel o‘quvchi × 20 savol ssenariy bo‘yicha load test, p95 API < 800ms target (hosting/network ta’siriga ko‘ra qayta kalibrlansin), yo‘qolgan javob = 0, ikki marta submitdan ikki natija = 0, cross-tenant leaks = 0, kiosk/mobile/weak internet test.
- Frontend: HTML sanitization, stable loading states, skeletons, nonblocking progress, safe retry, mobile scroll/touch, keyboard-only navigation, real branded empty state.

## 12. KOD STRUKTURASI / TAQDIM ETILADIGAN FAYLLAR

Tavsiya monorepo:
```
testlab/
  apps/web/                     # React Teacher Studio + Student Exam + Owner OS
  apps/api/                     # Cloudflare Worker/Hono API
  packages/shared/              # Zod schema, types, permissions, constants
  packages/ui/                  # SysOne Design System
  migrations/                   # D1 SQL migrations
  scripts/                      # v1 SQLite→v2 D1 conversion, seed, import
  templates/                    # Uzbek XLSX/CSV download artifacts
  tests/                        # unit, integration, contract, security, e2e, load
  docs/                         # API, architecture, runbook, privacy, migration
  .github/workflows/            # CI + protected deploy
  wrangler.jsonc
  README.md
  .env.example
```

Work joriy texnologik loyihaga mos holda o‘zgartirishi mumkin, lekin barcha modul va testlar mavjud bo‘lishi shart.

## 13. BOSQICHLAR (BARCHASI V2.0 FINAL RELIZGA KIRADI)

**F0 — Audit:** local source, screenshot, existing endpointlar va v1 E2E test; legacy fixtures backup; ro‘yxatga olingan risklar; GitHub/Cloudflare imkoniyatlari.

**F1 — Arxitektura va migratsiya:** DB schema, tenant scoping, Owner bootstrap, D1 migration, legacy migration scripts, protected tests. **Tenant security testlar o‘tmaguncha public onboarding ishga tushmasin.**

**F2 — Auth va onboarding:** Telegram OIDC, email/password+verify, sessions, rate limits, registration→private workspace→dashboard.

**F3 — Teacher Studio UI:** screenshotga asoslangan professional redesign, dock separation, Support, dashboard, savol, karta, guruh, student, analytics.

**F4 — Excel Import:** o‘zbekcha XLSX/CSV download, parse, validation preview, commit, history, duplicate, transactional import, compatibility with old CSV.

**F5 — Student Exam:** Guest and roster flows, timers/resume/autosave, grading, leaderboard/analytics, export.

**F6 — Store & Owner OS:** publish-consent → moderation → public catalog → import-to-tenant; Owner management and logs.

**F7 — Hardening/Deploy:** QA, 100 concurrent, load/capacity, backup/restore, monitoring, privacy, Cloudflare D1/R2, GitHub CI/CD, DNS `testlab.sysone.top`, product link `sysone.top` Software.

## 14. QABUL QILISH TESTLARI — BIRORTASI O‘TMASA «PRODUCTION READY» DEMASLIK

1. Teacher A va B o‘z akkaunti bilan ro‘yxatdan o‘tadi, ikki alohida tenant ochiladi.
2. A savoli/guruhi/studenti/kartasi/attempti/exportini B oddiy navigatsiyada ham, ID o‘zgartirilgan API URLda ham ko‘ra olmaydi (403/404).
3. B o‘quvchilari A guruhlarini yoki student kodlarini ko‘ra olmaydi; bir xil `student_code` turli tenantlarda xatolarsiz ishlaydi.
4. A 100 savolli **o‘zbekcha** XLSX faylini yuklab olib to‘ldiradi, upload/preview/commit bilan faqat A bazasiga import qiladi.
5. Header mapping: `Oson`, `O‘rtacha`, `Bitta javob`, `A|C`; oldingi `easy`, `multiple` va CSV eski format ham ishlaydi.
6. Noto‘g‘ri satr, formula va takroriy savol xatosi import previewda qator/ustun bilan chiqadi; transaction consistent.
7. Student test boshlaydi, javoblar autosave, sahifa refresh davom etadi, timer serverni aldab qayta boshlanmaydi.
8. Savol/natija/reyting to‘g‘ri; to‘g‘ri javoblar faqat ko‘rsatish ruxsati bo‘lsa ko‘rsatiladi.
9. Teacher storega savol yubormaguncha u public storeda yo‘q. Owner tasdiqlamaguncha ham yo‘q.
10. Owner approve qilganda Storeda faqat savolning public snapshoti paydo bo‘ladi; B uni o‘z bazasiga import qilishi mumkin, lekin Aning private student natijalari yo‘q.
11. Teacher akkaunti hech qanday API bilan Owner rolini ola olmaydi; Owner OS faqat ownerga ochiladi.
12. Telefon login Telegram consent bilan ish beradi; consent bo‘lmasa boshqa login usuli mavjud; ID token signature/claims serverda tekshiriladi.
13. Support tugmasi tasdiqlangan SysOne manziliga ochiladi. Chap dock ko‘rinishi kontentdan vizual ajralgan; mobil drawer ishlaydi.
14. 100 parallel student test load: cross-tenant leaks=0, lost answers=0, duplicate submits=0, error rate belgilangan threshold ichida.
15. GitHub PR’dan staging, main/release’dan production deploy; D1 migration va smoke testlar; secrets, DB, private data repoda yo‘q.
16. D1/R2 backup/restore amalda sinovdan o‘tgan; deploydan keyin mos testlar ishlab turibdi.
17. `testlab.sysone.top` https opens, auth/cookie correct, `sysone.top` Software mahsulotidan real ishlaydigan havola bor.
18. README Uzbek, setup .env.example, API docs, architecture, data policy, Runbook, QA report, release tag, smoke and load test reports topshirilgan.

## 15. YAKUNIY HISOBOT FORMATI (WORKNING OXIRGI JAVOBI)

Work quyidagilarni haqiqiy manzillar bilan topshirsin:
- GitHub repo URL, commit hash, release tag;
- deployed URL, staging URL;
- DB migrations status va backup tiklash sinovi;
- rol/tenant va Store security testlari natijalari;
- qisqa API/e2e/load test hisobot;
- v1.0 data migratsiyasi (ha/yo‘q va sababi);
- mavjud limitlar/rate-quota nazorati;
- bajarilmagan ishlar bo‘lsa real status (faqat «tayyor» deyish mumkin bo‘lgan funksiyalar).

**Chegara:** ishlab turgan 1.0 dasturni o‘chirib tashlash yoki productionga yarim tayyor komponent yuklash mumkin emas. Ma’lumotlarning maxfiyligi va test natijalarining to‘g‘riligi vizual dizayndan ustun turadi.
