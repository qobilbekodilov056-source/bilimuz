# v1.0 audit — 2026-11-21

Manba: handoff ZIP ichidagi v1.0; `/home/eram-laptop/sysone-testlab` bu ijro muhitida mavjud emas. Haqiqiy foydalanuvchi SQLite bazasi berilmagan.

Original FastAPI testlari: **5/5 o'tdi**. Login, savollar, guruh, PIN, manual/auto mix, timer, grading, leaderboard, CSV eksport va statik sahifa ishlaydi. Original kod `legacy/v1` ichida saqlanadi; foydalanuvchi kompyuteridagi dastur o'zgartirilmagan.

## Xavflar

1. Barcha biznes jadvallar global; self-registration IDOR va ma'lumot oqishiga olib keladi.
2. Faqat admin login; email verification, recovery, owner MFA, Telegram OIDC yo'q.
3. Process throttling Workerlar o'rtasida umumiy emas.
4. Har attemptda takrorlangan to'liq savollar D1 hajmini oshiradi.
5. Haqiqiy XLSX preview/transaction yo'q.
6. Guest ismi va roster kodi tasdiqlangan shaxs emas; muhim imtihon uchun PIN va nazorat zarur.

## Arxitektura qarori

React/TypeScript + Hono Worker + D1 + private R2. Biznes jadvallarida `(tenant_id,id)` unique va composite foreign key. Tenant session a'zoligidan olinadi. Clientdan tenant/role/score olinmaydi. Owner session Teacher APIga kirmaydi. Public API faqat karta metadatasi, opaque student token yoki approved snapshot orqali ishlaydi. Immutable question versions va card question pinning; atomic conditional autosave va grading, client revisions, server expiry.

## Tashqi imkoniyatlar

Cloudflare hisobidagi mavjud IAS loyihasi o'zgartirilmaydi. Yangi mustaqil domen/server hali aniqlanmagan. GitHub CLI login yo'q; uchta ulangan hisobda TestLab repo topilmadi. Telegram va email credentiallari berilmagan. Release acceptance bularni BLOCKED sifatida ko'rsatadi.
