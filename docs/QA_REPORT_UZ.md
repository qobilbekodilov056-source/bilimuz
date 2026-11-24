# SysOne TestLab 2.0 — QA hisoboti

Sana: 2026-11-21. **Release qarori: PRODUCTION BLOCKED.** Domen/server, GitHub va tashqi auth sozlamalari hali tasdiqlanmagan. Bajarilmagan deploy tayyor deb belgilanmadi.

## Sinov natijalari

| Tekshiruv | Haqiqiy natija |
| --- | --- |
| TypeScript / ESLint | PASS |
| Unit + Worker/D1 integration/security | 45/45 PASS |
| Original v1 regressiya | 5/5 PASS |
| Legacy migratsiya | 5/5 PASS |
| Haqiqiy Chromium brauzer | 7/7 PASS |
| Jami avtomatlashtirilgan test | 62 PASS |
| npm audit | 0 vulnerability |
| Frontend + Worker build | PASS |
| Local D1 migration | 0001_core.sql, 49 SQL buyruq PASS |
| Wrangler deployment dry-run | PASS; remote upload bajarilmadi |
| Release gate | Kutilgan BLOCK: real acceptance evidence yo'q |

## 100 parallel o'quvchi yuklamasi

100 o'quvchi × 20 savol; batch autosave, refresh/restore, ikki parallel finish, B teacher IDOR tekshiruvi. 700 HTTP so'rov. p50 **334.47 ms**, p95 **794.79 ms**, maksimum 892.83 ms. Xatolik 0%; yo'qolgan javob **0**, takroriy natija **0**, tenantdan tashqariga sizish **0**. Lokal maqsad p95 <800 ms: PASS.

Bu lokal workerd va SQLite-backed D1 emulyatsiyasi. Cloudflare edge tarmoq, haqiqiy Workers CPU/free quota va tashqi Telegram/email xizmatlari bu p95ga kirmaydi. Yagona lokal yugurish production SLA emas.

## Qamrov

Public register → private workspace → email verification. CSRF/Origin/XHR, server sessions/revocation/reset, brute-force, TOTP/replay, OIDC state/browser/PKCE/nonce/JWKS signature/iss/aud/exp. Privilege escalation, composite FK va question/group/student/card/attempt/analytics/export/import IDOR; bir xil student kodlari tenantlararo qonuniy.

100 o'zbekcha XLSX, legacy UTF-8 BOM CSV, malformed/formula/duplicate row/column, preview yozmasligi, fail-all/valid-only va parallel idempotent commit. 450 savolli 2 MBdan katta preview private R2da, metadata D1da; SQL transaction 500 KB qismlarga ajratiladi.

Manual va auto difficulty mix, weighted multiple exact-match grading, server expiry, pinned question versions, old revision rejection va teng revision conflict, parallel admission/idempotent retry, hidden result/answer policy, qisqartirilgan best-attempt reyting. Brauzerda real API orqali savol/guruh/student yaratish, import, offline/reconnect, refresh, finish va Owner shell access.

Explicit Store consent → pending → Owner approve/revoke → public snapshot → B private copy. Student/token/tenant private maydonlari public Storega kirmaydi. Owner oddiy Teacher API sifatida ishlamaydi. Support ticket va Owner javobi tenantga bog'langan.

AES-256-GCM R2 backup SHA256 tekshiruvi bilan fresh D1ga tiklandi. Jadval countlari mos, FK check bo'sh, auth sessiyalar qayta tiklanmadi. Haqiqiy remote D1 Time Travel/R2 va katta streaming export/restore hali bajarilmagan.

Legacy migratsiya manbani read-only saqlaydi. Historik ball/vaqt/version saqlanadi, active attempt bo'lsa to'xtaydi, output overwrite rad etiladi, eski PINlar yopilib reset talab qilinadi, duplicate savol aliaslari karta pozitsiyalarini saqlaydi. Foydalanuvchining haqiqiy SQLite fayli ilova qilinmagani sabab real data cutover bajarilmadi.

## UI va accessibility

1440px desktop va 390px mobile ko'rinishlar real brauzerda ko'rildi. Ajratilgan navy dock, SysOne Support, API loading/empty/error, native dialog, keyboard Escape va mobile drawer. Axe WCAG 2 A/AA, 2.1 AA va 2.2 AA avtomatik tekshiruvlarida tekshirilgan sahifalarda violation yo'q. Bu avtomatik va lokal tekshiruv doirasi; mustaqil to'liq accessibility sertifikati emas. Sintetik o'qituvchi ma'lumoti ishlatildi; userning real studentlari yo'q.

## Hali bajarilmagan ishlar

- Haqiqiy mustaqil domen/server tanlash va HTTPS/cookie smoke.
- GitHub private repository yaratish/ulash, remote push, branch/environment protection, haqiqiy CI/CD va release tag.
- BotFather client/redirect/phone consent; verified email sender va real yetkazish; real Turnstile va Owner enrollment.
- Real hostingdagi 100-parallel sinov, Workers 10ms CPU sig'imi, quota/usage va 70/85/95% alert integratsiyasi.
- Remote D1/R2 restore drill, mavjud v1 snapshot cutover va rollback review.

`reports/tests.json`, `reports/browser.json`, `reports/load.json`, `reports/dependencies.json`, `reports/validation.json` — xom mashina hisobotlari. `.github/workflows`ning mavjudligi uning GitHubda ishlaganini anglatmaydi. [ACCEPTANCE_UZ.md](ACCEPTANCE_UZ.md) release mezonlari uchun yakuniy ro'yxat.
