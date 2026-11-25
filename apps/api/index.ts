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
app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
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
