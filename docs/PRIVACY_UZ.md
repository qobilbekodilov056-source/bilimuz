# Ma'lumotlar siyosati

Teacher kontenti private by default. Workspace membership va tenant FK orqali savollar, guruhlar, o'quvchilar, attemptlar, import preview va eksportlar ajratiladi. Public Storega faqat explicit original-content roziligi, CC BY 4.0 litsenziya va Owner approve bilan savol snapshoti chiqadi. Student shaxsiy ma'lumoti bu snapshotga kirmaydi.

Hisob uchun ism, email, ixtiyoriy ish joyi; Telegram stable subject, faqat consent bo'lsa verified phone. Token/email-password hashlar public APIga chiqmaydi. Owner ro'yxatida email qisqartiriladi, student shaxsiy natijalari umumiy monitoringda ko'rsatilmaydi. Ownerga boshqa teacher sifatida yashirin kirish endpointi yo'q.

Guest testda ism, ixtiyoriy roster kodi, javoblar, server vaqti va taxminiy question activity yoziladi. Public reyting qisqartirilgan ism bilan va faqat teacher ruxsatida; default yopiq. Activity cheating isboti hisoblanmaydi. O'qituvchi voyaga yetmaganlarning ma'lumotlarini kiritish uchun tegishli rozilik va huquqiy asosni ta'minlaydi.

Teacher `Sozlamalar → Eksport` orqali o'z ma'lumotini olishi, exact confirmation bilan hisobini o'chirishi mumkin. O'chirish savol, guruh, student, kartalar va attemptlarni olib tashlaydi, Store nashrlarini qaytaradi, sessiyalarni bekor qiladi va private import R2 fayllarini o'chiradi. Shifrlangan backuplar 7 kunlik retention tugaguncha qolishi mumkin. Restore amaliyotida oldin o'chirilgan hisoblar qayta ochilib ketmasligi operator tomonidan tekshiriladi.

Default attempt retention 365 kun, owner 30–730 kun tanlaydi. Verify/reset token 30 daqiqa; OIDC state 10 daqiqa; teacher session 7 kun; Owner session 1 soat. Private eksportlar reklama, Store yoki GitHubga yuborilmaydi. Qurilmada offline javoblar sessionStoragega yoziladi va shu browser sessiyasi doirasida tiklanadi.

Tashqi xizmatlar: Cloudflare hosting/D1/R2/Turnstile, Telegram OIDC va tasdiqlangan email provider. Ishga tushirishdan avval mustaqil domen, support kontaktlari, operator yuridik ma'lumotlari va tegishli xizmat siyosatlari bilan foydalanuvchi notice yakuniy ko'rib chiqiladi. Ushbu siyosat tashqi huquqiy audit o'tganini bildirmaydi.
