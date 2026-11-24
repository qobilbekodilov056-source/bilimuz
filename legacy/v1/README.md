# SysOne TestLab — v1.0 functional MVP

IT guruhlari uchun interaktiv test platforma: o‘qituvchi savollar va test kartalarini yaratadi, o‘quvchi ism-familiya bilan testni boshlaydi, backend yakunda natijalarni baholaydi. Har bir savolga sarflangan faol vaqt, foiz va reyting saqlanadi.

## Dasturda hozir ishlaydigan imkoniyatlar

- Teacher Studio: autentifikatsiya, dashboard, savollar yaratish/tahrirlash/arxivlash, CSV import.
- Qiyinchiliklar: Easy / Medium / Hard / Expert; avtomatik taqsimot yoki qo‘lda tanlash.
- Test kartalari: savollar soni, vaqt, o‘tish foizi, urinishlar limiti, PIN, guruh cheklovi, ko‘rsatish parametrlari, aralashtirish, ochilish/yopilish sanalari.
- Kartani faollashtirish/yopish/arxivlash, nusxa yaratish va ulashish havolasi.
- Guruhlar va o‘quvchilar: noyob student_code bilan testlarni bog‘lash.
- Student Exam: ism-familiya kiritib boshlash, bitta/bir nechta tanlov, kod savoli (variantli), keyboard shortcut (1–8, chap/o‘ng strelka), savol navigatori.
- Javoblarni avtomatik saqlash, sahifa yangilanganda urinishni tiklash, server asosidagi taymer, vaqt tugagach avtomatik yakunlash.
- Natija: ball, foiz, savollar holati, vaqt va o‘rtacha savol vaqti, reyting. Natija/yechimlarni ko‘rsatish o‘qituvchi sozlamasiga bog‘liq.
- Analitika: o‘rtacha baho, o‘tish foizi, savol bo‘yicha to‘g‘ri javob ulushi, CSV eksport.
- Minimalist responsive dizayn, tashqi UI kutubxonasi/CDN talab qilinmaydi.

## Ubuntu/Linux — tez ishga tushirish

Talab: Python 3.10+ (tavsiya Python 3.11–3.13), internet orqali pip paketlarni o‘rnatish.

```bash
unzip sysone-testlab-v1.zip
cd sysone-testlab
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export TESTLAB_ADMIN_EMAIL='admin@sysone.top'
export TESTLAB_ADMIN_PASSWORD='UZUN_VA_YAGONA_MAXFIY_PAROL'
./run.sh
```

Brauzer: **http://127.0.0.1:8080**. O‘qituvchi kirishi: **http://127.0.0.1:8080/admin/login**.

Agar `TESTLAB_ADMIN_PASSWORD` belgilanmasa, tizim birinchi ishga tushishda tasodifiy kuchli parol yaratadi; uni `data/first-login.txt` faylidan o‘qing. Ushbu fayl maxfiy, hech kimga yubormang.

## Windows — tez ishga tushirish

```powershell
cd sysone-testlab
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:TESTLAB_ADMIN_EMAIL = 'admin@sysone.top'
$env:TESTLAB_ADMIN_PASSWORD = 'UZUN_VA_YAGONA_MAXFIY_PAROL'
python -m uvicorn app.main:app --host 127.0.0.1 --port 8080
```

PowerShell virtual muhit activation bloklansa, `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` va `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8080` bilan ishlating.

## Birinchi 5 daqiqada

1. `/admin/login` sahifasiga kiring.
2. Dashboardda **Namuna savollar** tugmasini bosib 16 ta test savolini qo‘shing yoki savollarni qo‘lda yarating.
3. **Test kartalari → Yangi test kartasi** tugmasini bosing.
4. Masalan, fan `Python`, savollar `5` va taqsimot `Easy 40 / Medium 40 / Hard 20 / Expert 0` kiriting (namuna bazada 5 savol uchun mos darajalar mavjud).
5. Kartani yarating, **... → Faollashtirish** orqali tekshiruvdan o‘tkazing.
6. **Ulashish** orqali URL nusxalang, incognito brauzerda testni bajaring.
7. Teacher Studio → Analitika bo‘limida natijalarni ko‘ring.

## API va ma’lumotlar

- Backend: FastAPI + Python `sqlite3` (hech qanday ORM shart emas).
- Frontend: modern HTML/CSS/JavaScript, statik SPA. Node yoki npm kerak emas.
- Bazaning joylashuvi: `data/testlab.sqlite3` (avtomatik yaratiladi).
- Admin sessiyasi HttpOnly cookie, parol PBKDF2-HMAC-SHA256; student urinish tokeni qo‘shimcha sarlavhada, browser localStorage'da urinishni tiklash uchun saqlanadi.
- API statuslari: `GET /api/health`.
- Savollar bilan ishlash: `/api/admin/questions`.
- Kartalar: `/api/admin/cards`.
- Student: `/api/public/cards/{slug}/attempts`, `/api/public/attempts/{id}`.
- Natijalar: `/api/public/attempts/{id}/result`, `/api/admin/cards/{id}/analytics`.
- To‘g‘ri javoblar test ishlash paytida public JSON orqali uzatilmaydi.

## Sinovlarni bajarish

```bash
pip install -r requirements-dev.txt
python -m pytest -q tests/
node --check static/assets/app.js  # Node mavjud bo‘lsa
```

**Avtomatlashtirilgan testlarda** server orqali haqiqiy login, savol/karta, test boshlash, javob, yakunlash, grading, leaderboard, export, PIN/guruh, timer va statik sahifalar tekshiriladi.

## SysOne saytiga ulash

Bu modul **hozircha mustaqil server** sifatida ishlaydi. `sysone.top` ning amaldagi source repozitoriysi ushbu sessiyada mavjud emas; shu sabab mavjud saytga production kod o‘zgarishi **amalga oshirilmagan**.

Eng kam xavfli integratsiya:

1. TestLab uchun `testlab.sysone.top` kabi subdomen ajrating yoki asosiy sayt proxy orqali `/tests` yo‘lida ishga tushiring.
2. Python backendni persistent diskli serverda HTTPS bilan joylashtiring.
3. SysOne dasturlar katalogiga TestLab haqida karta va **TestLab'ni ochish** havolasini qo‘shing.
4. Kerak bo‘lsa, admin loginni SysOne SSO bilan keyingi integratsiyada almashtiring.

Statik sayt yoki Cloudflare Pages **o‘zi** Python/SQLite backendni ishga tushirmaydi. Cloudflare Worker'ga to‘liq ko‘chirish uchun alohida API/D1 port zarur. Render free ephemeralda SQLite saqlash uchun xavfsiz emas; persistent disk yoki PostgreSQL adapter talab qilinadi.

## Ehtiyot choralar / ishlab chiqarishdan oldin

- **HTTPS, doimiy disk, zaxira nusxa, logging, monitoring** va public rate-limiting sozlang.
- O‘qituvchi uchun kuchli, maxfiy parol o‘rnating; `data/` papkasini web orqali ochmang.
- Guest ism-familiya bilan kirish identifikatsiyani kafolatlamaydi. Qat’iy cheklov uchun student_code + qo‘shimcha autentifikatsiya kerak.
- Faqat browser ko‘rsatgan savol vaqti taxminiy; serverdagi `expires_at` mutlaq vaqt cheklovi.
- Uzoq muddatli yoki katta parallel yuklamada SQLite o‘rniga server DB (masalan PostgreSQL) tavsiya etiladi.
- Bu **real ishlaydigan MVP**, ammo to‘liq production xavfsizlik auditi, accessibility va 100 parallel foydalanuvchi load-test o‘tkazilmagan.
- CSV XLSX emas, Excel'da ochiladigan UTF-8 BOM formatida eksport qilinadi. Bevosita `.xlsx` eksport keyingi iteratsiyaga rejalashtiriladi.
- Real kod bajariladigan Code Challenge emas: kodli savol hozir syntax fragment + variantli javob turi.

## Loyihaning tuzilishi

```text
sysone-testlab/
├── app/
│   ├── db.py               # SQLite schema, auth hash, bootstrap
│   ├── main.py             # FastAPI, grading, analytics, cards, questions
│   └── __init__.py
├── static/
│   ├── index.html
│   └── assets/
│       ├── app.css         # responsive visual design system
│       └── app.js          # Teacher Studio, Student Exam SPA
├── tests/test_e2e.py      # API funksional sinovlari
├── data/                  # runtime-only; arxivda bo‘sh
├── .env.example
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
├── docker-compose.yml
├── .gitignore
├── run.sh
└── README.md
```
