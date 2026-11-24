# Release qabul mezonlari

**Hozirgi qaror: PRODUCTION BLOCKED.** Lokal muvaffaqiyatli sinov remote xizmatlar ishlayotganini bildirmaydi. Original domen talabi bekor: mustaqil domen/server aniqlanishi kerak.

| # | Mezon | Holat va dalil |
| --- | --- | --- |
| 1 | Ikki teacher signup va alohida workspace | Lokal PASS: haqiqiy register/verify endpointlari, D1; provider yetkazishi test double |
| 2 | A ma'lumotini B ID almashtirib ko'ra olmaydi | PASS: question/group/student/card/attempt/analytics/export/import GET va mutation IDOR |
| 3 | Student code va guruhlar tenant doirasida | PASS: bir xil kod ikki tenantda, composite FK, roster/PIN |
| 4 | 100 o'zbekcha XLSX import | PASS: preview bazani o'zgartirmaydi, commit 100; katta R2 preview alohida sinov |
| 5 | O'zbekcha va legacy header/enum mapping | PASS: Oson/O'rtacha/multiple/A\|C/legacy CSV/BOM |
| 6 | Noto'g'ri satr/formula/duplicate, atomic commit | PASS: row/column, fail-all, valid-only, parallel idempotent commit |
| 7 | Autosave, refresh, offline va server timer | PASS: Worker integration va haqiqiy Chromium browser |
| 8 | Grading, natija siyosati, reyting | PASS: weighted/exact-match grading, key leakage check, best attempt ranking |
| 9 | Private savol avtomatik Storega chiqmaydi | PASS: explicit consent/original/licence; pending hali yopiq |
| 10 | Owner approve, public snapshot, B private copy | PASS: revoke, ownership, attribution/provenance, no student/token fields |
| 11 | Teacher role escalation yo'q, Owner MFA | PASS: strict payload, scope separation, TOTP va replay rejection |
| 12 | Telegram real verified phone consent | BLOCKED: JWKS/claims/PKCE/state/nonce lokal sinovlari o'tdi; real BotFather client va consent drill kerak |
| 13 | Ajratilgan dock, mobile drawer, haqiqiy Support | UI PASS; external support kontaktlari hali tasdiqlanmagan, in-app ticket/reply PASS |
| 14 | 100 parallel × 20 savol, p95 <800ms | Lokal PASS: reports/load.json; real hosting CPU/network load BLOCKED |
| 15 | GitHub → staging → production, secrets | Workflow va dry-run PASS; remote repo/CI/CD hali ulanmagan |
| 16 | D1/R2 backup/restore | Kichik encrypted R2 → fresh D1 fixture PASS; remote Time Travel/katta streaming restore drill BLOCKED |
| 17 | Mustaqil domen HTTPS va auth cookie | BLOCKED: yangi domen va server turi hali berilmagan. Oldingi asosiy sayt product-link talabi bekor |
| 18 | README, API, privacy, runbook, QA, release tag | Hujjatlar/manba beriladi; production qabul qilinmaguncha final release tag chiqarilmaydi |

## Release gate

`scripts/release-gate.mjs` joriy Git commit uchun dalillarni tekshiradi. Dalil yo'q, noto'g'ri commit, eskirgan tekshiruv, placeholder/eski domen yoki birorta required check o'tmagan bo'lsa process nonzero bilan tugaydi. `release-evidence.local.json` Gitga kirmaydi.

Kerakli evidence kalitlari: tenant_isolation, unit_integration, browser_e2e, accessibility, security, load_100, backup_restore, legacy_migration_dry_run, telegram_live, email_live, turnstile_live, owner_mfa_live, staging_smoke, dns_https, server_target_confirmed, cloud_capacity, monitoring_live, support_contacts_verified, legacy_migration_reviewed.

Har birida `status: passed` va tekshiriladigan artifact/run/URL bo'lsin. `checked_at` UTC timestamp, `commit` exact HEAD, `origin` haqiqiy mustaqil HTTPS domen. Bo'sh schema namunasi `docs/release-evidence.example.json`da; bu fayl tasdiqlangan dalil emas.

## Hali olinmagan haqiqiy ma'lumotlar

Mustaqil domen, server turi va kirish; GitHub maqsadli hisob/private repo ulanishi; Telegram OIDC client, tasdiqlangan email sender, Turnstile; Owner MFA enrollment; mavjud SQLite snapshoti va PIN/password reset cutover qarori. Credentiallarni chat matniga yuborish talab qilinmaydi — mos xavfsiz sozlash yo'li ishlatiladi.

Hozir pullik tarifga o'tish, DNS yozuvi, live database o'zgartirish yoki production deploy amalga oshirilmagan. Tashqi usage/alert integratsiyasi va Workers free CPU sig'imi ham ochiq release mezonlari.
