# SysOne TestLab 2.0

Mustaqil domen va alohida muhit uchun Teacher Studio, Student Exam, Owner OS va moderatsiyali Questions Store. **Production deploy hali bajarilmagan.** Real domen/server, Telegram/email/Turnstile sozlamalari va staging qabul sinovlari kerak. Lokal test natijalari [QA_REPORT_UZ.md](docs/QA_REPORT_UZ.md)da.

## Lokal ishga tushirish

Node.js 24, npm, Python 3.12+. Loyiha mavjud v1 papkasining ustiga tekshirmasdan yozilmasin; avval v1 SQLite backup olinsin. Original v1 kodi `legacy/v1`da alohida saqlangan.

```bash
npm ci
cp .env.example .dev.vars
# .dev.vars ichida haqiqiy provider sozlamalarini kiriting.
npm run build
npx wrangler d1 migrations apply DB --local
npm run dev:api
```

Ilova: `http://localhost:8787`. Frontend tezkor tahriri uchun ikkinchi terminalda `npm run dev`; auth ishlashi uchun browserning haqiqiy originini `.dev.vars`dagi `APP_ORIGIN` bilan bir xil qiling. Vite alohida portda bo'lsa `APP_ORIGIN=http://localhost:5173` va Worker proxy orqali ishlaydi. OIDC callback ham aynan shu originga ro'yxatdan o'tkaziladi.

Demo parol yoki yashirin test login yo'q. Providerlar sozlanmaguncha auth fail-closed. Ochiq registratsiya `REGISTRATION_OPEN=true` bilan faqat tenant security tekshiruvlari o'tgach yoqiladi. Owner yaratish ommaviy endpointda mavjud emas: [RUNBOOK_UZ.md](docs/RUNBOOK_UZ.md)ni ko'ring.

## Tekshiruvlar

```bash
npm run typecheck
npm run lint
npm test
python -m pip install -r legacy/v1/requirements-dev.txt
python -m pytest -q legacy/v1/test_e2e.py tests/test_migration.py
npm run build
npx playwright install --with-deps chromium-headless-shell
npm run test:e2e
npm run test:load
npm audit --audit-level=low
```

Testlardagi tashqi provider mocklari faqat `tests/harness.mjs`da. API va D1/R2 runtime haqiqiy workerdga ulanadi. Test serveri production Workerga qo'shilmagan. `PLAYWRIGHT_EXECUTABLE_PATH` o'rnatilgan rasmiy Chromium Headless Shell yo'lini tanlashga imkon beradi.

## Tuzilma

- `apps/web` — React, TypeScript, responsive Teacher/Student/Owner UI.
- `apps/api` — Hono Worker, session/auth, scope, import, exam, Store va backup.
- `packages/shared` — strict Zod schemas va o'zbekcha mapping.
- `migrations` — composite FK va indeksli D1 schema.
- `scripts` — xavfsiz legacy migration, owner bootstrap, backup/restore, release gate, smoke/load.
- `tests` — unit, Worker/D1 integration, security, browser va migration testlar.
- `docs` — arxitektura, API, privacy, acceptance, deploy/runbook va QA.
- `.github/workflows` — CI, develop → staging, himoyalangan main → production release.

GitHub repository va deploy URLlar haqiqatan yaratilmaguncha mavjud deb ko'rsatilmaydi. CI fayllari tayyorligi ularning GitHubda ishga tushganini anglatmaydi. Productionni faqat `npm run check:release` joriy commit uchun barcha haqiqiy qabul dalillarini tasdiqlagach chiqaring.

## Hujjatlar

[Audit](docs/AUDIT_UZ.md) · [Arxitektura](docs/ARCHITECTURE_UZ.md) · [API](docs/API_UZ.md) · [Runbook](docs/RUNBOOK_UZ.md) · [Qabul mezonlari](docs/ACCEPTANCE_UZ.md) · [Maxfiylik](docs/PRIVACY_UZ.md) · [Domen qarori](docs/SCOPE_UPDATE_UZ.md)
