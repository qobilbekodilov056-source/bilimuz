# 2026-11-21 — amaldagi topshiriq o'zgarishi

Foydalanuvchi qarori: `sysone.top` va uning subdomenlari ishlatilmaydi. TestLab mustaqil domen va alohida serverda ishlaydi. Bu qaror original MASTER BRIEFdagi domen va asosiy sayt Software kartasi talabini bekor qiladi. Yangi domen/server ma'lumoti hali berilmagan.

Ilova `APP_ORIGIN` sozlamasini yagona canonical origin sifatida ishlatadi. OIDC redirect, cookies, CSP va email havolalari undan olinadi. Cloudflare Workers + D1 + R2 alohida loyiha sifatida tayyorlanadi. Agar “alohida server” VPSni anglatsa, joylashtirish arxitekturasi yangi serverga mos ravishda tanlanishi kerak; Workers kodini o'zgartirmasdan oddiy VPSga qo'yish deb hisoblanmaydi. Domen/server yakuniy tasdiqlanmaguncha production deploy yopiq.
