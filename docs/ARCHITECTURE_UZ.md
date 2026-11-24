# TestLab 2.0 arxitekturasi

Amaldagi domen/server qarori: [SCOPE_UPDATE_UZ.md](SCOPE_UPDATE_UZ.md). `APP_ORIGIN` yagona canonical origin. Eski SysOne saytiga bog'lanish yo'q.

## Ishlash chegaralari

| Sirt | Ishonch manbasi | Ma'lumot |
| --- | --- | --- |
| Teacher API | HttpOnly session → faol user → faol membership → faol tenant | Har queryda sessiondan olingan tenant_id |
| Owner API | Alohida scope + platform_owner + majburiy TOTP tasdiqlangan session | Agregatlar, teacher hisob boshqaruvi, explicit Store submission va support xabarlari |
| Student API | Opaque karta slug + 256-bit browser resume key | Faqat shu urinish; to'g'ri javoblar serverda |
| Public Store | approved status + immutable, qat'iy schema bilan olingan snapshot | Savol, javob, izoh va explicit litsenziya; tenant/student eksporti yo'q |
| R2 | Worker binding; public access yo'q | AES-GCM shifrlangan backuplar |

Teacherda role va tenant request payloadidan olinmaydi. Strict Zod schema ortiqcha `tenant_id`, `role`, `score` maydonlarini rad etadi. `(tenant_id,id)` unique va composite FKlar application query xatosida ham boshqa tenant guruh/student/savoliga bog'lanishni bloklaydi. Bu D1 RLS emas; application scoping va database relationship isolation birgalikda ishlaydi.

## Auth

Telegram Authorization Code + S256 PKCE. State serverda bir martalik, browser cookie hashiga bog'langan. Nonce, signature/JWKS, issuer, audience, iat/exp/sub tekshiriladi. Telegram email orqali avtomatik boshqa hisobga bog'lanmaydi. Telefon faqat alohida rozilik, signed verified claim va E.164 tekshiruvidan keyin saqlanadi. Username identifikator emas; barqaror sub saqlanadi.

Email hisob tasdiqlanmaguncha kira olmaydi. Verify/reset link tokenlari D1da faqat SHA-256 hash bilan, 30 daqiqaga saqlanadi. Bir martalik consume/update transaction. Reset barcha sessiyalarni bekor qiladi. Email xizmati yo'q bo'lsa yuborildi deb ko'rsatilmaydi. Havola tokeni URL fragmentda, server access log querysida emas.

Parol: 16-byte random salt, WebCrypto PBKDF2-SHA256 100000 iteratsiya + D1dan tashqari server secretidagi HMAC-SHA256 pepper. Workers WebCrypto iteratsiya cheklovi sabab pepper alohida talab qilinadi. U yo'qolsa email recovery orqali reset; pepper rotation butun credential migration talab qiladi. PIN alohida PBKDF2 hash. Owner paroli kamida 16 belgi va TOTP; TOTP secret AES-GCM bilan shifrlanadi, qayta ishlatilgan time step rad etiladi.

SameSite=Lax HttpOnly session, productionda Secure. CSRF token session hashiga bog'langan, mutation uchun exact Origin + X-Requested-With + X-CSRF-Token talab qilinadi. Authdan oldin Origin/XHR va Turnstile action+hostname tekshiriladi. Server-side rate limit isolate xotirasiga bog'liq emas. Token taqqoslash timing-safe WebCrypto orqali.

## Savollar va imtihon

`questions` — tahrirlanadigan shaxsiy kartochka, `question_versions` — immutable content. Publish vaqtida `card_releases` va `card_questions` aniq versiyalarga bog'lanadi. Original savol keyin tahrirlansa eski test o'zgarmaydi. Savollar har bir attemptda to'liq takrorlanmaydi: attempt faqat versiyaga reference va variantlar tartibini saqlaydi.

Boshlashda admission trigger urinish limitini parallel requestlarda ham tekshiradi. Bir xil resume key bir sessiyani qaytaradi. Guest nomi tasdiqlangan shaxs emas; roster kodi ham shaxsni mustaqil tasdiqlamaydi. Yuqori ahamiyatli imtihon uchun PIN va o'qituvchi nazorati zarur.

Autosave client revision bilan conditional SQL update. Bir batchdagi duplicate position va variantlar rad etiladi; eski revision yangi javobni yozmaydi. Finalize va answer save D1 transactionlari tartibida bajariladi, shuning uchun saqlangan javob bilan yakuniy ball o'rtasida poyga bo'lmaydi. Finish takroran yuborilsa bitta natija. Expiry barcha server write/readlarda tekshiriladi, client soati o'zgarsa vaqt uzaymaydi.

Faol savol vaqti taxminiy. Client visibility/focus qoidabuzarlik isboti sifatida ishlatilmaydi. Har sekund DB write yo'q. Brauzer javoblarni sessionStoragega yozadi va tarmoq qaytganda batched retry qiladi; expiry o'tgach yetib kelgan javob qabul qilinmaydi.

## Import

10 MB siqilgan fayl, 20 MB ochilgan XLSX, bir XML 8 MB, ko'pi bilan 1000 qator. XLSXning faqat Savollar varag'i; namespace, inline/shared strings, UTF-8 CSV BOM va eski inglizcha headerlar taniladi. DTD/entity, formula, noto'g'ri javob va dublikatlar qator/ustun bilan chiqadi. Preview faqat import_jobga yozadi, savollar bazasiga emas. Commit valid-only/fail-all siyosatida bitta D1 batch transaction; takroriy commit oldingi natijani qaytaradi. Storega avtomatik yubormaydi.

## Hali real muhitda tekshirilishi kerak

External auth testlarda faqat provider chegarasi mock qilingan; application API, D1/R2 va JWT signature tekshiruvi haqiqiy. Real Telegram consent, email DKIM/delivery, Turnstile, TLS/cookies, Workers CPU va quota monitoring qabul mezonlarida alohida release gate. Lokal workerd p95 cloud p95 o'rnini bosmaydi. Readiness mavjud bo'lmagan metrikaning o'rniga uydirma nol qo'ymaydi.
