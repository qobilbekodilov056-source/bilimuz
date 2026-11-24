# API — v2

JSON xatolar `{error, request_id?}`. Validation 422 va `issues`. Not found 404; auth 401; ruxsat/CSRF 403; conflict 409; limit 429/503. Barcha shaxsiy javoblar `Cache-Control: no-store`.

Mutation: `Origin: APP_ORIGIN`, `X-Requested-With: XMLHttpRequest`. Teacher/Owner uchun cookie va `X-CSRF-Token`. Student uchun `X-Attempt-Token: resume_key`. Login/register Turnstile tokenini ham oladi. Query pagination: `limit` 1–100, `offset` 0–100000.

| Method | `/api/v2` dan keyingi yo'l | Vazifa |
| --- | --- | --- |
| GET | `/config` | Public auth imkoniyatlari, support, maintenance |
| GET | `/templates/questions.xlsx`, `.csv` | Aynan berilgan o'zbekcha shablon |
| POST | `/auth/register` | email,password,display_name,workplace?,consent=true,turnstile_token |
| POST | `/auth/login` | email,password,turnstile_token |
| POST | `/auth/verify` | token |
| POST | `/auth/resend`, `/auth/forgot` | email,turnstile_token |
| POST | `/auth/reset` | token,password |
| POST | `/auth/telegram/start` | consent,phone_consent,turnstile_token; returns redirect URL |
| GET | `/auth/telegram/callback` | Browser-bound OIDC callback |
| POST | `/auth/owner-login` | email,password,otp,turnstile_token |
| GET / POST | `/auth/me`, `/auth/logout` | Joriy hisob / session revocation |
| GET | `/teacher/overview` | Tenant KPI va so'nggi urinishlar |
| GET / POST | `/teacher/questions` | Filterli qidiruv / yaratish |
| GET / PUT / DELETE | `/teacher/questions/:id` | O'qish / `If-Match: content_version` bilan tahrir / arxiv |
| POST | `/teacher/questions/:id/submit-store` | consent,original,license=CC-BY-4.0,attribution? |
| POST | `/teacher/imports/preview` | Multipart `file`; savollar hali yozilmaydi |
| GET | `/teacher/imports`, `/teacher/imports/:id` | Tarix / tekshiruv |
| POST | `/teacher/imports/:id/commit` | policy=fail-all yoki valid-only |
| GET / POST | `/teacher/groups`, `/teacher/students` | Ro'yxat / yaratish |
| GET / PUT / DELETE | `/teacher/groups/:id`, `/teacher/students/:id` | Guruhni tahrirlash/bo'sh guruhni o'chirish; studentni arxivlash |
| GET / POST | `/teacher/cards` | Ro'yxat / qoralama |
| GET / PUT | `/teacher/cards/:id` | Karta / faqat e'lon qilinmagan qoralamani tahrirlash |
| POST | `/teacher/cards/:id/status`, `/duplicate` | Publish/close/archive / nusxa |
| GET | `/teacher/cards/:id/analytics`, `/export?format=xlsx` | Tenant natijalari / CSV yoki XLSX |
| GET | `/teacher/attempts/:id` | Shaxsiy urinish tafsiloti |
| POST | `/teacher/store/:id/copy`, `/report` | Litsenziyali private copy / shikoyat |
| GET | `/teacher/submissions` | O'z takliflari va moderation reason |
| GET / POST | `/teacher/support` | Murojaat tarixi / yangi murojaat |
| PUT | `/teacher/settings` | Profil va workspace nomi |
| GET / DELETE | `/teacher/account/export`, `/teacher/account` | Export / exact confirmation bilan o'chirish |
| GET | `/public/cards/:slug` | Public karta qoidalari |
| POST | `/public/cards/:slug/attempts` | name,student_code?,pin?,resume_key (crypto random 43+ chars) |
| GET | `/public/attempts/:id` | Javob kalitlarisiz savollar va saqlangan javoblar |
| PUT | `/public/attempts/:id/answers` | answers:[{position,selected,revision,active_time_ms?}] |
| POST | `/public/attempts/:id/finish` | Idempotent finalization |
| GET | `/public/attempts/:id/result` | Faqat karta ruxsat bergan natija/izoh |
| GET | `/public/cards/:slug/leaderboard` | Eng yaxshi urinish, qisqartirilgan ism |
| GET | `/store`, `/store/:id` | Faqat approved public snapshot |
| GET | `/owner/overview`, `/teachers`, `/moderation`, `/reports`, `/support`, `/audit` | Owner OS |
| POST | `/owner/teachers/:id/status` | active/blocked + audit reason |
| POST | `/owner/moderation/:id` | decision + audit reason |
| POST | `/owner/support/:id/reply` | reply,status |
| POST | `/owner/reports/:id/resolve` | Audit reason |
| GET / PUT | `/owner/settings` | Support, retention, maintenance, Store flag |
| GET / DELETE | `/owner/sessions`, `/owner/sessions/:id` | Owner session boshqaruvi |
| GET / POST | `/owner/backups` | Metadata / shifrlangan kichik DB backup |
| GET | `/owner/readiness` | Provider sozlanganligi; secret qiymatlari qaytmaydi |

`/api/health` D1 bilan haqiqiy bog'lanishni tekshiradi. Noma'lum API manzil SPA HTML bilan 200 qaytarmaydi.
