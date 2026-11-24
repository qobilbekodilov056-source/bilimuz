# TestLab — o'rnatish, migratsiya va ishlatish

## Hozirgi release holati

Production yopiq. `sysone.top` ishlatilmaydi. Mustaqil domen va server turi hali berilmagan. Workers + D1 + private R2 tayyorlangan target; agar server VPS bo'lsa, alohida runtime adaptatsiyasi, reverse proxy/TLS va qayta sinov talab qilinadi. `wrangler dev` production server deb taqdim etilmaydi.

GitHub connectorida repo yaratish amali yo'q, CLI login yo'q, browserda ham GitHub login sahifasi chiqdi. Repo manzili va remote commit yo'q. Manba va CI fayllari lokal tayyor; mavjud IAS Worker/bucketlariga tegilmagan.

## Muhitni tayyorlash

1. Mustaqil domen va hosting targetni aniqlang. Staging va production uchun alohida D1 va R2 yarating; bir xil database/bucketni ikkala muhitga bog'lamang. Pullik tarifga avtomatik o'tish yo'q.
2. `wrangler.jsonc`dagi `REPLACE_*` qiymatlarini real ID/hostname bilan almashtiring. Production uchun `routes: [{pattern: "SIZNING-DOMEN", custom_domain: true}]`ni faqat domen mavjudligi va TLS tekshirilgach kiriting. `APP_ORIGIN` callback, email, Origin va cookie xavfsizligi uchun aniq bo'lsin.
3. Telegram BotFatherda app origin va `/api/v2/auth/telegram/callback` allowed URLlarini ro'yxatdan o'tkazing. Client ID/secretni alohida staging/production secret sifatida kiriting. Phone so'rovi ixtiyoriy consent bilan sinovdan o'tsin.
4. Email providerda sender domenini tasdiqlang; DKIM/SPF/DMARC va real inbox/spam/delivery tekshiruvi. `RESEND_API_KEY`, `EMAIL_FROM`ni sozlang. SMS ishlatilmaydi va bepul cheksiz SMS va'dasi yo'q.
5. Turnstile saytini canonical hostname uchun sozlang. Server action va hostname'ni tekshiradi. Test harnessdagi tokenlar productionda qabul qilinmaydi.
6. Mustaqil kriptografik tasodifiy `PASSWORD_PEPPER`, `MFA_ENCRYPTION_KEY`, `BACKUP_ENCRYPTION_KEY` yarating. Oxirgi ikkisi 32-byte base64. Kalitlarni GitHub/D1 backup bilan bir joyga qo'ymang; xavfsiz offline recovery nusxasi bo'lsin.
7. Lokal `.dev.vars` Gitga kirmaydi. Remote secretlar `npx wrangler secret put SECRET_NAME --env staging` bilan kiritiladi. GitHubda faqat CI uchun Cloudflare API token/account ID; Worker auth secretlarini repo fayliga yozmang.
8. Tenant testlari va external auth sinovlari o'tmaguncha `REGISTRATION_OPEN=false`.

## Owner bootstrap

Public API Owner yarata olmaydi. Operator xavfsiz terminalida `OWNER_PASSWORD`, `MFA_ENCRYPTION_KEY`, `PASSWORD_PEPPER` env orqali beriladi; qiymatlarni command historyga yoki chatga yozmang.

```bash
node scripts/owner-bootstrap.mjs --email owner@example.com --name "Platforma egasi" --output /secure/testlab-owner
# Intended muhitda yaratilgan owner.sql ni tekshiring va qo'llang.
npx wrangler d1 execute DB --env staging --remote --file /secure/testlab-owner/owner.sql
```

`totp-enrollment.txt`ni autentifikatorga qo'shing, tasdiqlang va xavfsiz olib tashlang. `/owner/login`da parol + TOTP. Bir kod time stepi qayta ishlatilmaydi. Baza yagona faol platform_owner indexini saqlaydi. Owner recovery faqat offline operator jarayoni va audit bilan; self-service reset Owner MFA'ni chetlab o'tmaydi.

## v1 ma'lumotlarini ko'chirish

Haqiqiy baza bu topshiriqqa ilova qilinmagan; faqat original kod va sintetik fixture bilan dry-run bajarildi. Foydalanuvchi kompyuteridagi v1 o'zgartirilmadi.

```bash
python scripts/migrate-v1.py --source /home/eram-laptop/sysone-testlab/data/testlab.sqlite3 --output /secure/testlab-migration --email teacher@example.com
```

Skript manbani read-only ochadi, consistent SQLite backup yaratadi, integrity/FK va count tekshiruvlarini bajaradi. Active urinish bo'lsa to'xtaydi: ular avval v1da tugatilsin. Default/local admin email uchun yetkaziladigan haqiqiy email kerak. Eski admin parollari va sessiyalar ko'chirilmaydi, email recovery orqali yangi parol talab qilinadi.

310000 iteratsiyali eski PINni plaintextsiz 100000 iteratsiyali Workers formatiga qayta hash qilish mumkin emas. Bunday kartalar yopiladi, `manifest.json → pin_reset_cards`da ko'rsatiladi; Teacher nusxa yaratib yangi PIN qo'yadi. Bu o'zgarish cutoverdan avval qabul sinovida tekshirilsin. Original v1 serveri rollback uchun saqlansin.

`migration.sql` va backup shaxsiy ma'lumot hisoblanadi: 0600/0700 ruxsat, Gitga/ochiq havolaga joylanmasin. Avval bo'sh staging D1da schema + migration, so'ng counts/hash, bir nechta tarixiy ball, karta havolalari va test ishlashi tekshirilsin. Duplicate savollar aliaslari manifestda ochiq ko'rsatiladi. Keyin to'xtatilgan qisqa cutover, yakuniy backup va qayta solishtirish; shundan keyin DNS.

## Backup / restore

Kichik bazada (8 MBgacha, jadvaliga 20000 qatorgacha) Owner → Operations → Backup, yoki kunlik cron: consistent D1 batch snapshot → AES-256-GCM → private R2 → SHA-256 manifest. Sessiya/auth/reset/OIDC tokenlari backupga kirmaydi. Kalit R2da saqlanmaydi.

```bash
node scripts/restore-backup.mjs --file /secure/backup.aesgcm --sha256 TASDIQLANGAN_SHA256 --output /secure/restore.sql
# NEW EMPTY DBga avval 0001_core.sql, keyin restore.sql.
```

Hamma jadval countlari, `PRAGMA foreign_key_check`, analytics va bir karta tekshirilsin. Backuplardan tiklash original bazaga web orqali in-place yozmaydi. Oldin alohida restore database; keyin binding switch. Asl R2 bucket va secretlar saqlansin. In-flight import previewlari vaqtinchalik; nusxasi mavjud bo'lmasa fayl qayta yuklanadi. Commit qilingan savollar D1da saqlanadi.

Katta baza uchun streaming yo'l (Worker xotirasiga to'liq DB olinmaydi):

```bash
node scripts/backup-remote.mjs --env production --directory /secure/testlab-backup-YYYYMMDD
node scripts/backup-remote.mjs --env staging --directory /secure/testlab-restore-YYYYMMDD --restore_file /secure/database.sql.aesgcm --sha256 TASDIQLANGAN_SHA256
```

Streaming SQL export schema+data bilan keladi; yangi bo'sh D1ga qo'llang, so'ng `DELETE FROM sessions; DELETE FROM auth_tokens; DELETE FROM oidc_flows;` orqali auth sessiyalarini bekor qiling. SHA256/AES-GCM tekshiruvi tugamaguncha plaintext SQL bajarilmasin. `backups-stream/` uchun R2 7 kunlik lifecycle operator tomonidan o'rnatiladi. Ushbu katta remote yo'l hali real hisobda bajarilmagan: staging restore drill release gate bo'lib qoladi.

## CI/CD va rollout

GitHubda private repository, `main`, `develop`, branch protection va majburiy CI/review. Staging/production GitHub environments alohida secret va required reviewer bilan. CI type/lint/audit/unit/integration/legacy/migration/browser/load → develop staging. `scripts/check-target.mjs` placeholder va noto'g'ri originni rad etadi.

Production faqat main branch, joriy commit uchun 24 soatdan yangi acceptance evidence, protected environment va explicit workflow dispatch bilan. Operator haqiqiy tekshiruv natijalari va report havolalarini `Record verified release evidence` workflowiga JSON sifatida beradi; secret yoki PII kiritilmaydi. Bu workflow check:release o'tsagina bir kunlik release-evidence artifact yaratadi. So'ng uning run IDsi `Verified production release` workflowiga beriladi. Productiondan oldin D1 Time Travel holati va backup tiklash sinovi. Deploydan so'ng `APP_ORIGIN=... node scripts/smoke.mjs`; auth/roster/PIN/Store tenant amaliy smoke ham kerak. Xato bo'lsa oldingi Worker versionga qaytish DBni avtomatik qaytarmaydi; DB uchun alohida restore reja.

## Monitoring va retention

Workers Logs/Traces yoqilgan; request_id/status/duration, secret yoki student javobi loglanmaydi. Owner overview D1 hajmi, backup va aggregate countsni ko'rsatadi. Provider usage ulanmasa `null` chiqadi; nol deb ko'rsatilmaydi. Cloudflare GraphQL/dashboard orqali kunlik reads/writes, requests, CPU p95, error rate va R2 hajmi kuzatilishi shart. 70/85/95% chegaralarida operator alert integratsiyasi real muhitda sozlanib sinovdan o'tishi kerak; hozircha bu tashqi integratsiya yakunlanmagan.

Default natijalar 365 kun, sozlama 30–730; auth audit 90 kun, backup 7 kun. Preview R2 fayllari va joblar muddati tugagach kunlik tozalanadi. Account delete tenant import fayllarini ham olib tashlaydi. Incidentda yangi registratsiyani yoping, kerakli tenantni bloklang, sessionlarni bekor qiling, kalitlar oshkor bo'lgan bo'lsa aylantiring va tekshiruvni auditga yozing.

## Tasdiqlangan platforma chegaralari (2026-11-21)

Workers Free: 100000 request/kun, 10 ms CPU/request, 128 MB. D1 Free: 500 MB/DB, account 5 GB, 5 mln row read/kun, 100000 row write/kun; bir row/bound value 2 MB, LIKE pattern 50 UTF-8 byte. Katta preview R2ga chiqariladi, commit 500 KB qismlarga ajratilgan bitta atomic batch. Auto kartada faqat tanlangan savollar kontenti Worker xotirasiga olinadi. Lokal test cloud CPU limitini sertifikatlamaydi.

Rasmiy manbalar: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Telegram OIDC](https://core.telegram.org/bots/telegram-login), [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/).
