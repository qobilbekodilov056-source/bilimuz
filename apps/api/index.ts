import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { AppEnv, Bindings } from "./types";
import { auth } from "./auth";
import { teacher } from "./teacher";
import { owner } from "./owner";
import { exam, finalizeExpired } from "./exam";
import { libraryPublic } from "./library";
import { gamesPublic } from "./games";
import { chatRoutes } from "./chat";
import { billingWebhook } from "./billing";
import { tgbotPublic } from "./tgbot";
import { assignmentsPublic } from "./assignments";
import {
  fail,
  first,
  id,
  likePattern,
  now,
  paging,
  rows,
  settings,
} from "./core";
import { createBackup, retention } from "./backup";
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  const reqUrl = new URL(c.req.url);
  const appUrl = new URL(c.env.APP_ORIGIN);
  const isHttp = reqUrl.protocol === "http:" || c.req.header("x-forwarded-proto") === "http";
  if (
    c.env.ENVIRONMENT !== "development" &&
    (c.req.method === "GET" || c.req.method === "HEAD") &&
    ((reqUrl.host !== appUrl.host && reqUrl.host.endsWith(".workers.dev")) ||
      (reqUrl.host === appUrl.host && appUrl.protocol === "https:" && isHttp))
  ) {
    return c.redirect(c.env.APP_ORIGIN + reqUrl.pathname + reqUrl.search, 301);
  }
  const requestId = id();
  c.set("requestId", requestId);
  const started = Date.now();
  c.header("X-Request-ID", requestId);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://*.firebaseio.com https://*.firebasedatabase.app; frame-src 'self' https: https://challenges.cloudflare.com; object-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  );
  if (c.env.ENVIRONMENT !== "development")
    c.header(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (
      c.req.path !== "/api/v2/billing/auto-webhook" &&
      c.req.path !== "/api/v2/tgbot/webhook" &&
      (!([c.env.APP_ORIGIN, `http://${appUrl.host}`].includes(c.req.header("origin") || "")) ||
        c.req.header("x-requested-with") !== "XMLHttpRequest")
    )
      fail("So‘rov manbasi tasdiqlanmadi", 403);
    const length = Number(c.req.header("content-length"));
    const max = c.req.path.endsWith("/imports/preview")
      ? 10 * 1024 * 1024 + 65536
      : 512 * 1024;
    if (length > max) fail("So‘rov hajmi katta", 413);
    // Bound actual bytes as well as Content-Length; streaming/chunked uploads cannot evade this cap.
    if (c.req.raw.body) {
      const reader = c.req.raw.body.getReader();
      let count = 0;
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const r = await reader.read();
          if (r.done) {
            controller.close();
            return;
          }
          count += r.value.length;
          if (count > max) {
            await reader.cancel();
            controller.error(
              new HTTPException(413, { message: "So‘rov hajmi katta" }),
            );
            return;
          }
          controller.enqueue(r.value);
        },
        cancel() {
          return reader.cancel();
        },
      });
      c.req.raw = new Request(c.req.raw, {
        body: stream,
        duplex: "half",
      } as RequestInit);
    }
  }
  await next();
  console.log(
    JSON.stringify({
      request_id: requestId,
      method: c.req.method,
      status: c.res.status,
      duration_ms: Date.now() - started,
      service: "testlab",
    }),
  );
});
app.get("/api/health", async (c) => {
  await first(c.env.DB, "SELECT 1 ok");
  return c.json({
    ok: true,
    service: "sysone-testlab",
    version: "2.0.0",
    time: now(),
  });
});
app.get("/api/v2/config", async (c) => {
  const s = await settings(c.env);
  return c.json({
    registration_open: c.env.REGISTRATION_OPEN === "true",
    telegram_enabled: !!(
      c.env.TELEGRAM_CLIENT_ID && c.env.TELEGRAM_CLIENT_SECRET
    ),
    email_enabled: !!(c.env.RESEND_API_KEY && c.env.EMAIL_FROM),
    turnstile_site_key: c.env.TURNSTILE_SITE_KEY || "",
    support_email: s.support_email,
    support_telegram: s.support_telegram,
    maintenance: s.maintenance,
    store_enabled: s.store_enabled !== false,
    games_enabled: s.games_enabled !== false,
    chat_enabled: s.chat_enabled !== false,
    firebase_configured: !!s.firebase_db_url,
    tg_bot_username: String(s.tg_bot_username || "").replace(/^@/, ""),
    library_enabled: s.library_enabled !== false,
    assignments_enabled: s.assignments_enabled !== false,
    journal_enabled: s.journal_enabled !== false,
    parent_enabled: s.parent_enabled !== false,
    practice_enabled: s.practice_enabled !== false,
    apk_enabled: s.apk_enabled !== false,
  });
});
app.get("/api/v2/templates/:file", async (c) => {
  const file = c.req.param("file");
  const names: Record<string, string> = {
    "questions.xlsx": "SysOne_TestLab_Import_Shablon_UZ_v2.xlsx",
    "questions.csv": "SysOne_TestLab_Import_Shablon_UZ_v2.csv",
  };
  if (!names[file]) fail("Shablon topilmadi", 404);
  const response = await c.env.ASSETS.fetch(
    new Request(new URL("/templates/" + names[file], c.req.url)),
  );
  if (response.status !== 200) fail("Shablon topilmadi", 404);
  c.header(
    "Content-Type",
    file.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv; charset=utf-8",
  );
  c.header("Content-Disposition", `attachment; filename="${names[file]}"`);
  c.header("Cache-Control", "public, max-age=86400");
  return response.body ? c.body(response.body as ReadableStream, 200) : c.body(null, 200);
});
app.route("/api/v2/auth", auth);
app.route("/api/v2/teacher", teacher);
app.route("/api/v2/owner", owner);
app.route("/api/v2/public", exam);
app.route("/api/v2/library", libraryPublic);
app.route("/api/v2/games", gamesPublic);
app.route("/api/v2/chat", chatRoutes);
app.route("/api/v2/billing", billingWebhook);
app.route("/api/v2/tgbot", tgbotPublic);
app.route("/api/v2/public/assignments", assignmentsPublic);
app.get("/api/v2/app/bilimuz.apk", async (c) => {
  const obj = await c.env.FILES.get("app/BilimUZ.apk");
  if (!obj) fail("Android ilova hali yuklanmagan. Tez orada qo‘shiladi.", 404);
  const headers = new Headers();
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="BilimUZ.apk"');
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(obj.body, { headers });
});
app.get("/api/v2/media/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/api\/v2\/media\//, ""));
  if ((!key.startsWith("qimg/") && !key.startsWith("hw/") && !key.startsWith("libpdf/") && !key.startsWith("cosmetics/") && !key.startsWith("receipts/")) || key.includes("..")) {
    fail("Rasm topilmadi", 404);
  }
  const obj = await c.env.FILES.get(key);
  if (!obj) fail("Rasm topilmadi", 404);
  const headers = new Headers();
  headers.set("Content-Type", obj.httpMetadata?.contentType || "image/png");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(obj.body, { headers });
});
app.get("/api/v2/store", async (c) => {
  const s = await settings(c.env);
  if (!s.store_enabled) fail("Savollar do‘koni vaqtincha yopiq", 503);
  const { limit, offset } = paging(c);
  const q = (c.req.query("q") || "").slice(0, 120),
    category = c.req.query("category") || "",
    level = c.req.query("level") || "";
  const list = await rows(
    c.env.DB,
    "SELECT id,public_content_json,category,level,published_at FROM store_items WHERE status='approved' AND (?='' OR category=?) AND (?='' OR level=?) AND json_extract(public_content_json,'$.question.title') LIKE ? ORDER BY published_at DESC LIMIT ? OFFSET ?",
    category,
    category,
    level,
    level,
    likePattern(q),
    limit,
    offset,
  );
  return c.json({
    items: list.map((r) => ({
      id: r.id,
      ...JSON.parse(r.public_content_json),
      published_at: r.published_at,
    })),
  });
});

app.get("/api/v2/store/packs", async (c) => {
  const s = await settings(c.env);
  if (!s.store_enabled) fail("Savollar do‘koni vaqtincha yopiq", 503);
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const grouped = await rows(
    c.env.DB,
    `SELECT COALESCE(NULLIF(TRIM(category), ''), 'Umumiy') category,
            COUNT(*) total,
            SUM(CASE WHEN level='easy' THEN 1 ELSE 0 END) easy,
            SUM(CASE WHEN level='medium' THEN 1 ELSE 0 END) medium,
            SUM(CASE WHEN level='hard' THEN 1 ELSE 0 END) hard,
            MAX(published_at) latest_at
     FROM store_items
     WHERE status='approved'
     GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Umumiy')
     ORDER BY total DESC, latest_at DESC`,
  );
  const packs = [];
  for (const g of grouped) {
    const cat = String(g.category || "Umumiy");
    if (q && !cat.toLowerCase().includes(q)) continue;
    const samples = await rows(
      c.env.DB,
      `SELECT json_extract(public_content_json, '$.question.title') title
       FROM store_items
       WHERE status='approved' AND COALESCE(NULLIF(TRIM(category), ''), 'Umumiy')=?
       ORDER BY published_at DESC LIMIT 3`,
      cat,
    );
    packs.push({
      category: cat,
      total: Number(g.total || 0),
      easy: Number(g.easy || 0),
      medium: Number(g.medium || 0),
      hard: Number(g.hard || 0),
      latest_at: Number(g.latest_at || 0),
      sample_titles: samples.map((x: any) => String(x.title || "")).filter(Boolean),
    });
  }
  return c.json({ packs });
});

app.get("/api/v2/store/:id", async (c) => {
  if (!(await settings(c.env)).store_enabled)
    fail("Savollar do‘koni vaqtincha yopiq", 503);
  const r = await first(
    c.env.DB,
    "SELECT id,public_content_json,published_at FROM store_items WHERE id=? AND status='approved'",
    c.req.param("id"),
  );
  if (!r) fail("Savol topilmadi", 404);
  return c.json({
    id: r.id,
    ...JSON.parse(r.public_content_json),
    published_at: r.published_at,
  });
});
app.all("/api/*", (c) => c.json({ error: "API manzili topilmadi" }, 404));
function escHtml(v: string) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get("/robots.txt", (c) => {
  const origin = c.env.APP_ORIGIN.replace(/\/+$/, "");
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(
    [
      "User-agent: *",
      "Allow: /",
      "Allow: /practice",
      "Allow: /library",
      "Allow: /games",
      "Allow: /store",
      "Disallow: /studio",
      "Disallow: /owner",
      "Disallow: /api/",
      "",
      "Sitemap: " + origin + "/sitemap.xml",
    ].join("\n"),
  );
});

app.get("/sitemap.xml", async (c) => {
  const origin = c.env.APP_ORIGIN.replace(/\/+$/, "");
  const today = new Date().toISOString().slice(0, 10);
  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: origin + "/", lastmod: today, priority: "1.0" },
    { loc: origin + "/practice", lastmod: today, priority: "0.9" },
    { loc: origin + "/library", lastmod: today, priority: "0.9" },
    { loc: origin + "/store", lastmod: today, priority: "0.8" },
    { loc: origin + "/games", lastmod: today, priority: "0.8" },
    { loc: origin + "/student", lastmod: today, priority: "0.7" },
    { loc: origin + "/parent", lastmod: today, priority: "0.7" },
  ];
  try {
    const cards = await rows(
      c.env.DB,
      `SELECT slug, updated_at FROM cards
       WHERE status='active' AND group_id IS NULL AND settings_json LIKE '%"access_mode":"open"%'
       ORDER BY updated_at DESC LIMIT 300`,
    );
    for (const r of cards) {
      const lm = r.updated_at ? new Date(Number(r.updated_at) * 1000).toISOString().slice(0, 10) : today;
      urls.push({ loc: origin + "/practice/" + encodeURIComponent(String(r.slug)), lastmod: lm, priority: "0.8" });
    }
  } catch {}
  try {
    const books = await rows(
      c.env.DB,
      `SELECT id, updated_at FROM library_books WHERE published=1 AND moderation_status='approved' ORDER BY updated_at DESC LIMIT 300`,
    );
    for (const b of books) {
      const lm = b.updated_at ? new Date(Number(b.updated_at) * 1000).toISOString().slice(0, 10) : today;
      urls.push({ loc: origin + "/library/" + encodeURIComponent(String(b.id)), lastmod: lm, priority: "0.8" });
    }
  } catch {}
  try {
    const games = await rows(
      c.env.DB,
      `SELECT id, created_at FROM games WHERE status='published' ORDER BY created_at DESC LIMIT 100`,
    );
    for (const g of games) {
      const lm = g.created_at ? new Date(Number(g.created_at) * 1000).toISOString().slice(0, 10) : today;
      urls.push({ loc: origin + "/games/" + encodeURIComponent(String(g.id)), lastmod: lm, priority: "0.7" });
    }
  } catch {}

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `  <url><loc>${escHtml(u.loc)}</loc><lastmod>${u.lastmod || today}</lastmod><priority>${u.priority}</priority></url>`,
      )
      .join("\n") +
    "\n</urlset>";
  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=900");
  return c.body(xml);
});

app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const ct = res.headers.get("content-type") || "";
  const pathname = new URL(c.req.url).pathname;

  if (ct.includes("text/html")) {
    let seoTitle = "";
    let seoDesc = "";
    const origin = c.env.APP_ORIGIN.replace(/\/+$/, "");
    const canonicalUrl = origin + pathname;

    const mPractice = /^\/practice\/([^/]+)$/.exec(pathname);
    const mExam = /^\/t\/([^/]+)$/.exec(pathname);
    const mBook = /^\/library\/([^/]+)$/.exec(pathname);

    try {
      if (mPractice || mExam) {
        const slug = decodeURIComponent((mPractice || mExam)![1]);
        const card: any = await first(
          c.env.DB,
          "SELECT title, description FROM cards WHERE UPPER(slug)=UPPER(?) AND status='active' LIMIT 1",
          slug,
        );
        if (card?.title) {
          seoTitle = `${card.title} — Onlayn test | Bilim UZ`;
          seoDesc = String(card.description || "").trim() || `${card.title} bo‘yicha bepul onlayn mashq testi va natija tahlili — Bilim UZ.`;
        }
      } else if (mBook) {
        const bid = decodeURIComponent(mBook[1]);
        const book: any = await first(
          c.env.DB,
          "SELECT title, subject, summary FROM library_books WHERE id=? AND published=1 AND moderation_status='approved' LIMIT 1",
          bid,
        );
        if (book?.title) {
          seoTitle = `${book.title} (${book.subject}) — Elektron kutubxona | Bilim UZ`;
          seoDesc = String(book.summary || "").trim() || `${book.title} elektron darsligi va qo‘llanmasi — Bilim UZ kutubxonasida bepul o‘qing.`;
        }
      } else if (pathname === "/practice") {
        seoTitle = "Ochiq mashq testlari — Informatika, Ingliz tili, Matematika | Bilim UZ";
        seoDesc = "Barcha fanlardan bepul onlayn mashq testlari, tezkor natija va xatolar tahlili — Bilim UZ.";
      } else if (pathname === "/library") {
        seoTitle = "Elektron kutubxona — Darsliklar va qo‘llanmalar | Bilim UZ";
        seoDesc = "Informatika, Python, Ingliz tili va boshqa fanlardan bepul elektron darsliklar hamda PDF qo‘llanmalar.";
      } else if (pathname === "/store") {
        seoTitle = "Savollar do‘koni — Tayyor fan va mavzu packlari | Bilim UZ";
        seoDesc = "O‘qituvchilar uchun mavzu va fan bo‘yicha tayyor savollar packlari va test kartalari.";
      }
    } catch {}

    if (seoTitle || pathname !== "/") {
      let html = await res.text();
      if (seoTitle) {
        const tEsc = escHtml(seoTitle);
        const dEsc = escHtml(seoDesc.slice(0, 165));
        html = html
          .replace(/<title>[^<]*<\/title>/, `<title>${tEsc}</title>`)
          .replace(/(<meta[^>]+name="description"[^>]+content=")[^"]*(")/, `$1${dEsc}$2`)
          .replace(/(<meta[^>]+property="og:title"[^>]+content=")[^"]*(")/, `$1${tEsc}$2`)
          .replace(/(<meta[^>]+property="og:description"[^>]+content=")[^"]*(")/, `$1${dEsc}$2`)
          .replace(/(<meta[^>]+name="twitter:title"[^>]+content=")[^"]*(")/, `$1${tEsc}$2`)
          .replace(/(<meta[^>]+name="twitter:description"[^>]+content=")[^"]*(")/, `$1${dEsc}$2`);
      }
      html = html
        .replace(/(<link[^>]+rel="canonical"[^>]+href=")[^"]*(")/, `$1${escHtml(canonicalUrl)}$2`)
        .replace(/(<meta[^>]+property="og:url"[^>]+content=")[^"]*(")/, `$1${escHtml(canonicalUrl)}$2`);
      res.headers.forEach((v, k) => {
        if (k.toLowerCase() !== "content-length") c.header(k, v);
      });
      return c.body(html, res.status as 200);
    }
  }

  res.headers.forEach((v, k) => c.header(k, v));
  return res.body ? c.body(res.body as ReadableStream, res.status as 200) : c.body(null, res.status as 200);
});
app.onError((e, c) => {
  if (e instanceof HTTPException)
    return c.json(
      { error: e.message, request_id: c.get("requestId") },
      e.status,
    );
  if (e instanceof ZodError)
    return c.json(
      {
        error: "Kiritilgan ma’lumotni tekshiring",
        issues: e.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      422,
    );
  const message = String(e.message);
  if (
    /UNIQUE constraint|attempt_limit|immutable_|FOREIGN KEY|card_inactive|tenant_blocked|quota_exceeded|answer_revision_collision/.test(
      message,
    )
  )
    return c.json(
      {
        error: /attempt_limit/.test(message)
          ? "Urinishlar limiti tugagan"
          : "Ma’lumot takrorlangan, bog‘langan yoki o‘zgargan. Yangilab qayta urinib ko‘ring.",
      },
      409,
    );
  if (/quota|D1_ERROR.*(limit|overload)/i.test(message))
    return c.json(
      { error: "Xizmat limiti vaqtincha tugagan. Keyinroq urinib ko‘ring." },
      503,
    );
  console.error(
    JSON.stringify({
      request_id: c.get("requestId"),
      error_type: e.name,
      service: "testlab",
      ...(c.env.ENVIRONMENT === "development" ? { debug: e.message } : {}),
    }),
  );
  return c.json(
    {
      error: "Ichki xatolik. So‘rov raqami bilan Supportga murojaat qiling.",
      request_id: c.get("requestId"),
    },
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(
    event: ScheduledController,
    env: Bindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        await finalizeExpired(env);
        if (event.cron === "17 2 * * *") {
          await retention(env);
          await createBackup(env);
        }
      })(),
    );
  },
};
export { app };
