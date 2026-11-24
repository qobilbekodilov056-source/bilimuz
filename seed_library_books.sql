-- Bilim UZ Raqamli Kutubxonasi: 3 ta interaktiv qo'llanma (14 ta bob)
-- Eslatma: avtomatik ravishda tizimdagi birinchi workspace (tenant) ga biriktiriladi.

INSERT OR REPLACE INTO library_books (id, tenant_id, title, subject, summary, tags, author_name, linked_card_slug, published, moderation_status, views_count, created_at, updated_at) VALUES ('book-kompyuter-savodxonligi-01', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'Kompyuter savodxonligi: Noldan pro darajagacha', 'Kompyuter savodxonligi', 'Kompyuter tuzilishi, xotira birliklari, Windows sirlari, tezkor tugmalar, ofis dasturlari va internet asoslari — sodda tilda, jadvallar va mini-savollar bilan.', 'kompyuter, windows, word, excel, internet, asoslar', 'Bilim UZ · SysOne', '', 1, 'approved', 0, 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ks-01', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kompyuter-savodxonligi-01', 1, 'Kompyuterning ichki olami — inson tanasi bilan qiyoslash', 'Protsessor, RAM, SSD va Videokarta nima ish qilishini hayotiy o‘xshatishlar orqali 3 daqiqada tushunib olasiz.', '## Kompyuterni tushunishning eng oson yo‘li

Ko‘pchilik **CPU, RAM, GPU, SSD** kabi atamalarni eshitganda murakkab texnik so‘zlar deb o‘ylaydi. Aslida kompyuter xuddi **oshxonada ovqat pishirayotgan oshpaz** kabi ishlaydi!

| Qurilma | Texnik nomi | Hayotiy o‘xshatish | Asosiy vazifasi |
| --- | --- | --- | --- |
| **Protsessor (CPU)** | Markaziy protsessor | Oshpazning miyasi | Barcha hisoblash va buyruqlarni bajaradi |
| **Tezkor xotira (RAM)** | Random Access Memory | Ish stoli (doska) | Hozir ochiq turgan dasturlarni vaqtincha ushlab turadi |
| **Doimiy xotira (SSD/HDD)** | Qattiq disk | Muzlatkich / javon | Fayl, rasm, video va tizimni doimiy saqlaydi |
| **Videokarta (GPU)** | Grafik protsessor | Rassom | O‘yinlar, 3D grafika va videolarni chizib beradi |
| **Ona plata** | Motherboard | Butun oshxona xonasi | Barcha qismlarni o‘zaro bog‘lab turadi |

> 🧠 Bilasizmi? Zamonaviy protsessorlar bir soniyada **milliardlab** amalni bajara oladi. Agar inson har soniyada bitta misol yechsa, protsessorning 1 soniyalik ishini bajarish uchun 100 yildan ko‘p vaqt ketardi!

## Nega SSD disk HDD dan ancha tez?

Eski **HDD** disklari ichida magnit plastinka daqiqasiga 5400–7200 marta aylanadi va maxsus igna ma’lumot qidiradi. **SSD** esa xuddi katta tezkor fleska kabi ishlaydi — ichida aylanadigan qism yo‘q!

- **HDD bilan Windows:** 40–90 soniyada yonadi.
- **SSD bilan Windows:** 7–15 soniyada yonadi.

> 💡 Maslahat: Agar eski noutbukingiz sekin ishlayotgan bo‘lsa, yangi kompyuter sotib olishdan oldin unga **SSD o‘rnatib ko‘ring** — tezligi 4–5 barobar oshadi!

??? Agar elektr toki to‘satdan o‘chib qolsa, qaysi xotiradagi saqlanmagan ma’lumotlar o‘chib ketadi: RAM mi yoki SSD? || **RAM (tezkor xotira)** elektrga bog‘liq bo‘lgani uchun tok o‘chganda tozalanadi. SSD esa ma’lumotni doimiy saqlaydi. Shuning uchun muhim hujjatda tez-tez `Ctrl + S` bosib turish kerak!', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ks-02', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kompyuter-savodxonligi-01', 2, 'Axborot o‘lchov birliklari: Bit, Bayt, KB, MB, GB, TB', 'Fayllar hajmi qanday o‘lchanadi va 1 GB xotiraga nechta rasm yoki kitob sig‘adi?', '## Kompyuter faqat 0 va 1 ni tushunadi

Kompyuter ichidagi hamma narsa — siz o‘qiyotgan shu matn, telefoningizdagi rasm, sevimli musiqangiz — eng tubida faqat **0** va **1** raqamlaridan iborat. Bitta 0 yoki 1 **bit** deb ataladi.

| Birlik | Qisqartma | Aniq qiymati | Hayotiy misol |
| --- | --- | --- | --- |
| **Bit** | b | 0 yoki 1 | Bitta chiroq yoniq yoki o‘chiq |
| **Bayt** | B | **8 bit** | 1 ta harf (masalan, `A`) |
| **Kilobayt** | KB | **1024 bayt** | Qisqa 1 betlik matn |
| **Megabayt** | MB | **1024 KB** | 1 ta sifatli rasm (2–5 MB) |
| **Gigabayt** | GB | **1024 MB** | 1 ta HD film (~1.5–3 GB) |
| **Terabayt** | TB | **1024 GB** | 250 000 dan ortiq foto |

> ⚠️ Diqqat: Internet tezligi odatda **Mbps (Megabit/soniya)** da, fayl hajmi esa **MB (Megabayt)** da o‘lchanadi. 1 bayt = 8 bit bo‘lgani uchun **80 Mbps** internet sekundiga taxminan **10 MB** fayl yuklaydi!

??? 2 gigabayt (GB) necha megabayt (MB) ga teng? || 1 GB = 1024 MB bo‘lgani uchun **2 GB = 2048 MB** ga teng.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ks-03', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kompyuter-savodxonligi-01', 3, 'Windows va Fayl tizimi: Tartibli ishlash sirlari', 'Fayl kengaytmalari nimani bildiradi, qotib qolgan dasturni qanday yopish va fayllarni yo‘qotmaslik usullari.', '## Fayl kengaytmasi — faylning pasporti

Har bir fayl nomining oxirida nuqtadan keyin keladigan 3–4 harf uning qaysi dasturda ochilishini bildiradi:

| Kengaytma | Turi | Qayerda ishlatiladi? |
| --- | --- | --- |
| `.docx` | Matn hujjati | Microsoft Word |
| `.xlsx` | Elektron jadval | Microsoft Excel |
| `.pptx` | Taqdimot | Microsoft PowerPoint |
| `.pdf` | Universal hujjat | Hamma qurilmada bir xil ochiladi |
| `.png` / `.jpg` | Rasm | PNG shaffof fonni saqlaydi |
| `.zip` / `.rar` | Arxiv | Ko‘p faylni kichraytirib jamlash |
| `.exe` / `.apk` | Dastur | Windows (.exe) va Android (.apk) |

> ⚠️ Diqqat: Telegram yoki emaildan kelgan notanish `.exe` yoki `.apk` fayllarni aslo ochmang — ularning ichida virus bo‘lishi mumkin!

## Windowsda har kim bilishi shart bo‘lgan 3 ta qutqaruvchi vosita

- **Vazifalar menejeri:** `Ctrl + Shift + Esc` — biror dastur qotib qolsa, kompyuterni o‘chirmasdan aynan o‘sha dasturni yopish mumkin.
- **Ekran qulflash:** `Win + L` — kompyuterdan turib ketayotganda bir soniyada parolga qo‘yish.
- **Butunlay o‘chirish:** `Shift + Delete` — faylni Savatchaga tushirmasdan o‘chiradi (ehtiyot bo‘ling!).

??? Kompyuterdagi muhim fayllarni disk buzilishidan saqlab qolishning eng ishonchli usuli nima? || **Zaxira nusxa (Backup)** olish — muhim hujjatlarni qo‘shimcha fleska yoki **Google Drive** kabi bulutli xotirada saqlash.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ks-04', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kompyuter-savodxonligi-01', 4, '20 ta oltin klaviatura tugmasi — ishingizni 2x tezlashtiring', 'Sichqonchaga kamroq tegib, professional foydalanuvchidek tez ishlash uchun eng muhim kombinatsiyalar.', '## Eng ko‘p ishlatiladigan universal tugmalar

Ushbu kombinatsiyalar Word, Excel, Brauzer va Windowsning deyarli barcha oynalarida bir xil ishlaydi:

| Tugmalar | Nima qiladi? | Qachon foydali? |
| --- | --- | --- |
| `Ctrl + C` / `Ctrl + V` | Nusxalash / Qo‘yish | Matn va fayllarni ko‘chirishda |
| `Ctrl + X` | Kesib olish | Fayl yoki matnni boshqa joyga o‘tkazishda |
| `Ctrl + Z` / `Ctrl + Y` | Ortga qaytarish / Qayta tiklash | Adashib o‘chirib yuborganda qutqaradi |
| `Ctrl + A` | Barchasini belgilash | Butun hujjatni bir zumda tanlash |
| `Ctrl + S` | Saqlash | Har 5 daqiqada bosish odat qiling |
| `Ctrl + F` | Matndan qidirish | Katta sahifadan kerakli so‘zni topish |
| `Alt + Tab` | Oynalar almashish | Dasturlar orasida tez sakrash |
| `Win + Shift + S` | Qirqib skrinshot olish | Ekranning kerakli qismini rasmga olish |
| `Win + E` | Fayl menejeri | «Этот компьютер» ni darhol ochish |
| `Alt + F4` | Dasturni yopish | Faol oynani tez yopish |

> 💡 Maslahat: Har kuni shu jadvaldan atigi **2 ta yangi tugmani** amalda ishlating — 10 kunda qo‘lingiz avtomatik o‘rganib qoladi!

??? Adashib butun paragrafni o‘chirib yubordingiz. Uni 1 soniyada qaytarish uchun qaysi tugmalarni bosasiz? || `Ctrl + Z` (Undo) tugmalarini bosishingiz bilan o‘chirilgan matn darhol qaytadi!', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ks-05', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kompyuter-savodxonligi-01', 5, 'Word, Excel va PowerPoint — qaysi biri nima uchun?', 'Ofis dasturlarining har biridan maksimal foyda olish bo‘yicha qisqa va aniq qo‘llanma.', '## Uchta asosiy ofis dasturi

- **Microsoft Word:** ariza, hisobot, referat, shartnoma va kitoblar yozish uchun. Asosiy tugmalar: `Ctrl + B` (qalin), `Ctrl + I` (qiya), `Ctrl + J` (ikki chetni tekislash), `Ctrl + H` (so‘zni topib almashtirish).
- **Microsoft Excel:** jadval, buxgalteriya, baholar jurnali, xarajatlar hisobi va diagrammalar uchun. Har bir formula `=` belgisi bilan boshlanadi.
- **Microsoft PowerPoint:** dars, loyiha va biznes taqdimotlari uchun. `F5` — boshidan ko‘rsatish, `Shift + F5` — joriy slayddan ko‘rsatish, `Ctrl + M` — yangi slayd.

> 💡 Maslahat: PowerPointda bitta slaydga uzun insho yozmang! **1 slayd = 1 fikr, 3–5 ta qisqa tezis va 1 ta vizual rasm/grafik.** Shunda tinglovchilar zerikmaydi.

??? Word hujjatini boshqa kompyuterda shriftlari buzilmasdan ochilishi uchun qaysi formatda saqlash kerak? || **PDF** formatida (`Fayl → Boshqa nom bilan saqlash → PDF`). PDF har qanday telefon va kompyuterda bir xil ko‘rinadi.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ks-06', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kompyuter-savodxonligi-01', 6, 'Internet qanday ishlaydi? IP, DNS, HTTPS va Inkognito siri', 'Brauzerga sayt nomini yozganingizda 1 soniya ichida nimalar sodir bo‘ladi?', '## Sayt qanday ochiladi?

Siz brauzerga `bilimuz.dpdns.org` deb yozib Enter bosganingizda, orqa fonda 3 ta tezkor jarayon sodir bo‘ladi:

1. **DNS (Internetning telefon kitobi):** inson tushunadigan domen nomini serverning raqamli **IP-manziliga** aylantiradi.
2. **HTTPS (Shifrlangan aloqa):** brauzer va server o‘rtasida xavfsiz tunnel ochiladi — qulfcha belgisi aynan shuni bildiradi.
3. **Cookie:** sayt sizning kirish sessiyangiz va til sozlamangizni eslab qolishi uchun kichik fayl saqlaydi.

> 🧠 Bilasizmi? Ko‘pchilik brauzerdagi **Inkognito (Maxfiy) rejim** meni internetda butunlay ko‘rinmas qiladi deb o‘ylaydi. Aslida u faqat **o‘zingizning kompyuteringizda** tarix va cookie saqlamaydi — internet provayderingiz va kirilgan saytlar baribir IP-manzilingizni ko‘rib turadi!

??? Domen nomini (masalan, google.com) raqamli IP-manzilga aylantirib beruvchi tizim nima deb ataladi? || **DNS (Domain Name System)**.', 1795520861, 1795520861);

INSERT OR REPLACE INTO library_books (id, tenant_id, title, subject, summary, tags, author_name, linked_card_slug, published, moderation_status, views_count, created_at, updated_at) VALUES ('book-excel-formulalar-02', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'Microsoft Excel: Eng kerakli formulalar va amaliy qo‘llanma', 'Kompyuter savodxonligi', 'O‘qishda va ishda har kuni kerak bo‘ladigan Excel formulalari — SUM, AVERAGE, IF, COUNTIF, VLOOKUP va XLOOKUP sodda misollar bilan.', 'excel, formula, jadval, ofis, sum, if, vlookup', 'Bilim UZ · SysOne', '', 1, 'approved', 0, 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ex-01', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-excel-formulalar-02', 1, 'Excel asoslari: Katak manzili va = qoidasi', 'Formula yozishda yangi boshlovchilar eng ko‘p yo‘l qo‘yadigan xatolar va mutlaq manzil ($A$1) siri.', '## Excelning 1-raqamli qoidasi

Excelda har qanday hisob-kitob **albatta `=` (tenglik) belgisi** bilan boshlanadi. Agar `2+2` deb yozsangiz, Excel uni oddiy matn deb o‘ylaydi; `=2+2` deb yozsangiz, **4** natijasini chiqaradi.

- Katak manzili **ustun harfi + qator raqami** dan iborat: masalan, `C5` — 3-ustun, 5-qator.
- Diapazon (oraliq) ikki nuqta bilan yoziladi: `B2:B20` — B2 dan B20 gacha barcha kataklar.

## Mutlaq manzil (`$A$1`) qachon kerak?

Masalan, `E1` katakda dollar kursi (12 800 so‘m) yozilgan. Siz formulani pastga tortganingizda `E1` o‘zgarib `E2, E3` bo‘lib ketmasligi uchun unga dollar belgisi qo‘yiladi:

```
=B2*$E$1
```

> 💡 Maslahat: `$` belgisini qo‘lda terib o‘tirmang — formula ichida katak ustida turib klaviaturadan `F4` tugmasini bosing, Excel o‘zi `$E$1` qilib qo‘yadi!

??? Agar Excel katagida kutilmaganda `###` belgilari chiqib qolsa, bu nimani bildiradi? || Xavotir olmang — bu xato emas! Shunchaki **ustun eni** son yoki sanani sig‘dirish uchun torlik qilmoqda. Ustun chekkasini ikki marta bossangiz darhol tuzaladi.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ex-02', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-excel-formulalar-02', 2, 'Hisoblash formulalari: SUM, AVERAGE, MIN, MAX, COUNT', 'Istalgan jadval bo‘yicha 5 soniyada jami, o‘rtacha, eng yuqori va eng past ko‘rsatkichni chiqarish.', '## Har bir foydalanuvchi bilishi shart bo‘lgan 5 ta funksiya

| Formula | Vazifasi | Amaliy misol |
| --- | --- | --- |
| `=SUM(B2:B10)` | Sonlar yig‘indisi | Oylik umumiy xarajatni hisoblash |
| `=AVERAGE(B2:B10)` | O‘rtacha qiymat | Guruhning o‘rtacha test ballini topish |
| `=MAX(B2:B10)` | Eng katta son | Eng yuqori natija olgan o‘quvchi balli |
| `=MIN(B2:B10)` | Eng kichik son | Eng past ko‘rsatkichni aniqlash |
| `=COUNT(B2:B10)` | Sonli kataklar soni | Nechta o‘quvchi test topshirganini sanash |

> 💡 Maslahat: `Alt + =` tugmalarini bossangiz, Excel yuqoridagi sonlar uchun `=SUM(...)` formulasini **avtomatik** yozib beradi!

??? `COUNT(A1:A10)` va `COUNTA(A1:A10)` o‘rtasida qanday farq bor? || `COUNT` faqat **son** yozilgan kataklarni sanaydi, `COUNTA` esa matn ham, son ham — **bo‘sh bo‘lmagan barcha** kataklarni sanaydi.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ex-03', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-excel-formulalar-02', 3, 'Aqlli shartlar: IF, COUNTIF va SUMIF', 'Excelga qaror qabul qilishni o‘rgating: avtomatik «O‘tdi / O‘tmadi» qo‘yish va shartli hisoblash.', '## IF() — Excelning «Agar» buyrug‘i

Tasavvur qiling, `B2` katakda o‘quvchining test foizi turibdi. Agar 60% dan yuqori bo‘lsa **«O‘tdi»**, aks holda **«Qayta topshirish»** yozish kerak:

```
=IF(B2>=60, "O‘tdi", "Qayta topshirish")
```

## Shartli sanash va qo‘shish

- **`=COUNTIF(C2:C50, "O‘tdi")`** — nechta o‘quvchi imtihondan o‘tganini sanaydi.
- **`=SUMIF(A2:A50, "Toshkent", D2:D50)`** — faqat Toshkent shahriga tegishli summalarni qo‘shadi.

> ⚠️ Diqqat: Ba’zi kompyuterlarda Excel formulasida vergul `,` o‘rniga nuqta-vergul `;` ishlatiladi (mintaqaviy sozlamaga qarab). Agar formula xato bersa, `,` ni `;` ga almashtirib ko‘ring!

??? `=IF(C2>=86, "A''lo", "Yaxshi")` formulasi C2 katakda 90 bo‘lsa qanday natija chiqaradi? || 90 >= 86 sharti rost bo‘lgani uchun **"A''lo"** natijasini chiqaradi.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-ex-04', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-excel-formulalar-02', 4, 'Katta jadvallarda qidiruv: VLOOKUP va XLOOKUP', 'Ikki xil jadvalni o‘quvchi kodi yoki mahsulot ID si orqali bir soniyada bog‘lash.', '## VLOOKUP nima uchun kerak?

Sizda 500 ta o‘quvchining ro‘yxati bor. Boshqa varaqda esa faqat o‘quvchi kodi bor va uning yoniga ismini avtomatik tortib chiqarish kerak. Qo‘lda qidirib o‘tirish o‘rniga `VLOOKUP` yoki zamonaviy `XLOOKUP` ishlatiladi:

```
=XLOOKUP(A2, Oquvchilar!A:A, Oquvchilar!B:B, "Topilmadi")
```

- **A2** — qidirilayotgan kod.
- **Oquvchilar!A:A** — kodlar turgan ustun.
- **Oquvchilar!B:B** — qaytarilishi kerak bo‘lgan ismlar ustuni.
- **"Topilmadi"** — agar kod bazada bo‘lmasa chiqadigan chiroyli xabar.

> 💡 Maslahat: Katta jadvalda kerakli qatorlarni tez ajratib ko‘rish uchun `Ctrl + Shift + L` bosib **Filtr** yoqing!

??? Nega zamonaviy Excelda `XLOOKUP` eski `VLOOKUP` dan qulayroq hisoblanadi? || `XLOOKUP` chapdan o‘ngga ham, o‘ngdan chapga ham qidira oladi, ustun raqamini sanab o‘tirish shart emas va topilmaganda maxsus matn chiqara oladi.', 1795520861, 1795520861);

INSERT OR REPLACE INTO library_books (id, tenant_id, title, subject, summary, tags, author_name, linked_card_slug, published, moderation_status, views_count, created_at, updated_at) VALUES ('book-kiberxavfsizlik-03', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'Kiberxavfsizlik va Raqamli gigiyena', 'Informatika', 'Internetdagi firibgarlar, fishing havolalar, viruslar va parol o‘g‘riligidan o‘zingizni hamda yaqinlaringizni himoya qilish bo‘yicha amaliy qo‘llanma.', 'xavfsizlik, parol, fishing, 2fa, virus, internet', 'Bilim UZ · SysOne', '', 1, 'approved', 0, 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-sec-01', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kiberxavfsizlik-03', 1, 'Kuchli parol va 2FA — hisobingizning ikki qulfi', 'Xakerlar 1 soniyada buzadigan parollar va hisobni 99% himoya qiladigan ikki bosqichli tekshiruv.', '## Oddiy parollar qancha vaqtda buziladi?

| Parol turi | Misol | Xaker dasturi qanchada buzadi? |
| --- | --- | --- |
| 6–8 ta raqam | `12345678` yoki `20080512` | **1 soniyadan kam** |
| Oddiy so‘z | `qwerty` yoki `toshkent` | **Bir necha soniya** |
| 12+ belgili aralash ibora | `Kuzgi_Shamol!2026#Uz` | **Yuzlab yillar** |

## Ikki bosqichli autentifikatsiya (2FA) nima?

**2FA** — bu uyingiz eshigiga ikkinchi qulf o‘rnatishdek gap. Hatto kimdir parolingizni bilib qolsa ham, sizning telefoningizga kelgan bir martalik kod yoki **Google Authenticator** kodisiz hisobingizga kira olmaydi.

> 💡 Maslahat: Telegram, Google (Gmail) va Instagram hisoblaringizda **hoziroq 2FA (Ikki bosqichli tekshiruv)** ni yoqib qo‘ying!

??? Bitta juda murakkab parol o‘ylab topib, uni hamma saytda (Telegram, Gmail, bank) ishlatish to‘g‘rimi? || **Noto‘g‘ri!** Agar o‘sha saytlardan bittasining bazasi sizib chiqsa, jinoyatchilar aynan shu parol bilan qolgan barcha hisoblaringizga ham kirib oladi.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-sec-02', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kiberxavfsizlik-03', 2, 'Fishing va SMS-firibgarlikni 5 soniyada tanib olish', 'Soxta sovrinlar, «bank xodimi» qo‘ng‘iroqlari va zararli Telegram havolalaridan qanday saqlanish kerak?', '## Firibgarlarning eng ko‘p ishlatadigan 3 ta hiylasi

1. **Soxta ovoz berish / sovrin havolasi:** «Do‘stim, bolamga ovoz berib yubor» yoki «Telegram Premium tekin!» degan havola aslida soxta saytga olib kirib, hisobingizni o‘g‘irlaydi.
2. **«Bank xodimi» qo‘ng‘irog‘i:** «Kartangizdan pul yechilmoqda, to‘xtatish uchun kelgan SMS kodni ayting» — **bu 100% firibgarlik!**
3. **O‘xshash domen (Typosquatting):** haqiqiy `google.com` o‘rniga `g00gle-login.xyz` kabi soxta manzil.

> ⚠️ Diqqat: **Hech qachon, hech kimga** telefoningizga kelgan SMS-kodni va bank kartangiz orqasidagi **CVV** kodini aytmang! Haqiqiy bank xodimi bularni hech qachon so‘ramaydi.

??? O‘zini tanish yoki bank xodimi deb ko‘rsatib, insonni psixologik aldab maxfiy ma’lumot olish usuli nima deb ataladi? || **Ijtimoiy muhandislik (Social Engineering)**.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-sec-03', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kiberxavfsizlik-03', 3, 'Viruslar, Ransomware va «Bepul Crack» dasturlar xavfi', 'Nega pullik dasturlarning buzilgan (crack) versiyasini yuklab olish eng qimmatga tushadi?', '## «Tekin pishloq faqat qopqonda bo‘ladi»

Notanish saytlardan o‘yin yoki dasturlarning «crack / aktivator» faylini yuklaganingizda, ko‘pincha ichida quyidagi yashirin zararli dasturlar bo‘ladi:

- **Stealer (O‘g‘ri):** brauzerda saqlangan barcha parol va cookie fayllaringizni xakerga yuboradi.
- **Miner:** kompyuteringiz videokartasidan yashirincha kriptovalyuta qazib, qurilmani qizdiradi va sekinlashtiradi.
- **Ransomware (Tovlamachi virus):** barcha rasm va hujjatlaringizni shifrlab qo‘yib, ochish uchun pul talab qiladi.

> 🧠 Bilasizmi? Windows 10 va 11 ichida o‘rnatilgan **Windows Defender** zamonaviy antivirus hisoblanadi — uni o‘chirib qo‘ymang va tizimni muntazam yangilab turing!

??? Ransomware (tovlamachi virus) fayllaringizni shifrlab qo‘ysa, ma’lumotlaringizni yo‘qotmaslikning eng ishonchli chorasi nima? || Oldindan tashqi diskka yoki bulutli xotiraga **zaxira nusxa (Backup)** olib qo‘yishdir.', 1795520861, 1795520861);
INSERT OR REPLACE INTO library_chapters (id, tenant_id, book_id, position, title, summary, content, created_at, updated_at) VALUES ('ch-sec-04', (SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), 'book-kiberxavfsizlik-03', 4, 'Ochiq Wi-Fi, VPN va Mualliflik huquqi qoidalari', 'Jamoat joylarida internetdan xavfsiz foydalanish va raqamli madaniyat asoslari.', '## Ochiq Wi-Fi tarmoqlarida ehtiyot bo‘ling

Kafe, vokzal yoki aeroportdagi parolsiz **Free Wi-Fi** tarmoqlarida yovuz niyatli shaxslar bir xil tarmoqdagi trafikni kuzatishi mumkin.

- Ochiq Wi-Fi da **bank ilovalari** va muhim parollarga kirmang — buning uchun mobil internet (4G/5G) xavfsizroq.
- Zarur bo‘lganda ishonchli **VPN** (shifrlangan tunnel) dan foydalaning.
- Faqat **`https://`** (qulfcha belgisi) bor saytlarga ma’lumot kiriting.

## Raqamli madaniyat va Mualliflik huquqi

Internetdagi rasm, musiqa, dastur va maqolalarning muallifi bor. Boshqalarning ishini ruxsatsiz o‘z nomidan tarqatish **mualliflik huquqini (Copyright)** buzish hisoblanadi. Bepul foydalanish uchun **Creative Commons** yoki **Open Source** (ochiq litsenziyali) manbalardan foydalaning.

> 💡 Maslahat: Yaxshi dasturchi va mutaxassis nafaqat kompyuterni yaxshi biladi, balki boshqalarning mehnati va shaxsiy ma’lumotlarini ham hurmat qiladi.

??? Jamoat joyidagi parolsiz Wi-Fi orqali bank kartasi parolini kiritish xavfsizmi? || **Yo‘q, xavfsiz emas.** Bank operatsiyalari uchun mobil internetdan foydalanish eng to‘g‘ri va xavfsiz yo‘ldir.', 1795520861, 1795520861);
