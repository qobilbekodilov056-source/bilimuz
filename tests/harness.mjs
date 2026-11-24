import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createHash,
  randomBytes,
  randomUUID,
  pbkdf2Sync,
  createHmac,
} from "node:crypto";
import { applySql } from "../scripts/sql-utils.mjs";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
const root = resolve(import.meta.dirname, "..");
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const tick = () => Math.floor(Date.now() / 1000);
export const randomToken = () => randomBytes(32).toString("base64url");
export async function harness({
  port,
  origin = "https://app.test",
  persist = false,
} = {}) {
  const mails = [],
    telegram = {
      nonce: "",
      sub: "telegram-user-001",
      phone: true,
      aud: "123456789",
      badSignature: false,
    };
  const pair = await generateKeyPair("RS256"),
    wrong = await generateKeyPair("RS256"),
    jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "test-key",
      alg: "RS256",
      use: "sig",
    };
  const mime = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
  };
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      scriptPath: resolve(root, "dist/worker.js"),
      compatibilityDate: "2026-11-21",
      port,
      host: "127.0.0.1",
      log: new Log(LogLevel.ERROR),
      d1Databases: ["DB"],
      r2Buckets: ["FILES"],
      d1Persist: persist,
      r2Persist: persist,
      bindings: {
        ENVIRONMENT: "development",
        APP_ORIGIN: origin,
        REGISTRATION_OPEN: "true",
        TURNSTILE_SECRET: "test-only-secret",
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        RESEND_API_KEY: "test-only-email-key",
        EMAIL_FROM: "TestLab <test@app.test>",
        PASSWORD_PEPPER: "test-only-pepper-very-long-random-key",
        TELEGRAM_CLIENT_ID: "123456789",
        TELEGRAM_CLIENT_SECRET: "test-only-oidc-key",
        MFA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
        BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
      },
      serviceBindings: {
        ASSETS: async (request) => {
          const path = new URL(request.url).pathname;
          const ext = /\.[a-z]+$/.exec(path)?.[0];
          let file = resolve(
            root,
            "dist/client",
            path.slice(1) || "index.html",
          );
          if (!file.startsWith(resolve(root, "dist/client") + "/"))
            return new Response("Forbidden", { status: 403 });
          try {
            return new Response(await readFile(file), {
              headers: { "Content-Type": mime[ext] || "text/html" },
            });
          } catch {
            if (ext) return new Response("Missing", { status: 404 });
            return new Response(
              await readFile(resolve(root, "dist/client/index.html")),
              { headers: { "Content-Type": "text/html" } },
            );
          }
        },
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (url.hostname === "challenges.cloudflare.com") {
          const f = await request.formData();
          const value = f.get("response");
          return Response.json({
            success: typeof value === "string" && value.startsWith("test:"),
            hostname: new URL(origin).hostname,
            action: typeof value === "string" ? value.split(":")[1] : "",
          });
        }
        if (url.hostname === "api.resend.com") {
          mails.push(await request.json());
          return Response.json({ id: randomUUID() });
        }
        if (url.pathname === "/.well-known/jwks.json")
          return Response.json({ keys: [jwk] });
        if (
          url.hostname === "oauth.telegram.org" &&
          url.pathname === "/token"
        ) {
          const payload = {
            nonce: telegram.nonce,
            name: "Telegram O‘qituvchi",
            ...(telegram.phone
              ? { phone_number: "998901234567", phone_number_verified: true }
              : {}),
          };
          const signed = await new SignJWT(payload)
            .setProtectedHeader({ alg: "RS256", kid: "test-key" })
            .setIssuer("https://oauth.telegram.org")
            .setAudience(telegram.aud)
            .setSubject(telegram.sub)
            .setIssuedAt()
            .setExpirationTime("5m")
            .sign(telegram.badSignature ? wrong.privateKey : pair.privateKey);
          return Response.json({ id_token: signed });
        }
        return new Response("Unexpected external request", { status: 502 });
      },
    }),
  );
  await mf.ready;
  const db = await mf.getD1Database("DB");
  await applySql(
    db,
    await readFile(resolve(root, "migrations/0001_core.sql"), "utf8"),
  );
  async function request(
    path,
    {
      method = "GET",
      data,
      cookie = "",
      csrf = "",
      attempt = "",
      headers = {},
      form,
    } = {},
  ) {
    let formBody;
    if (form) {
      const encoded = new Request(origin + path, {
        method: "POST",
        body: form,
      });
      headers["Content-Type"] = encoded.headers.get("content-type");
      formBody = await encoded.arrayBuffer();
    }
    const r = await mf.dispatchFetch(origin + path, {
      method,
      headers: {
        ...(method !== "GET"
          ? { Origin: origin, "X-Requested-With": "XMLHttpRequest" }
          : {}),
        ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(attempt ? { "X-Attempt-Token": attempt } : {}),
        ...headers,
      },
      body: formBody || (data !== undefined ? JSON.stringify(data) : undefined),
      redirect: "manual",
    });
    const text = await r.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = text;
    }
    return { status: r.status, data: result, headers: r.headers, text };
  }
  async function seedTeacher(label = "Teacher", role = "teacher") {
    const uid = randomUUID(),
      tid = randomUUID(),
      raw = randomToken(),
      csrf = randomToken(),
      email = label.toLowerCase().replace(/[^a-z0-9]/g, "") + "@example.test";
    const salt = randomBytes(16);
    const ph = `pbkdf2_sha256_hmac$100000$${salt.toString("base64")}$${pbkdf2Sync(createHmac("sha256", "test-only-pepper-very-long-random-key").update("Correct horse battery staple").digest("base64"), salt, 100000, 32, "sha256").toString("base64")}`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO users(id,email,password_hash,email_verified,display_name,role,terms_at,created_at) VALUES(?,?,?,1,?,?,?,?)",
        )
        .bind(uid, email, ph, label, role, tick(), tick()),
      db
        .prepare(
          "INSERT INTO tenants(id,owner_user_id,slug,name,created_at) VALUES(?,?,?,?,?)",
        )
        .bind(tid, uid, "ws-" + randomToken(), label + " Workspace", tick()),
      db
        .prepare(
          "INSERT INTO tenant_memberships VALUES(?,?,'tenant_owner','active')",
        )
        .bind(tid, uid),
      db
        .prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,NULL)")
        .bind(
          hash(raw),
          uid,
          role === "teacher" ? tid : null,
          hash(csrf),
          role === "teacher" ? "teacher" : "owner",
          role === "teacher" ? 0 : 1,
          tick(),
          tick() + 86400,
        ),
    ]);
    return {
      uid,
      tid,
      email,
      csrf,
      cookie: "testlab_session=" + raw + "; testlab_csrf=" + csrf,
    };
  }
  return {
    mf,
    db,
    mails,
    telegram,
    request,
    seedTeacher,
    origin,
    close: () => mf.dispose(),
  };
}
export const sample = (n = 1, more = {}) => ({
  title: `Python savoli raqam ${n} qanday?`,
  category: "Python",
  topic: "Asoslar",
  level: "easy",
  kind: "single",
  options: [
    { id: "A", text: "To‘g‘ri" },
    { id: "B", text: "Noto‘g‘ri" },
  ],
  correct: ["A"],
  ...more,
});
export async function createQuestion(h, u, n = 1, more = {}) {
  const r = await h.request("/api/v2/teacher/questions", {
    method: "POST",
    ...u,
    data: sample(n, more),
  });
  if (r.status !== 201) throw Error(JSON.stringify(r));
  return r.data.id;
}
export async function createCard(h, u, ids, more = {}) {
  const r = await h.request("/api/v2/teacher/cards", {
    method: "POST",
    ...u,
    data: {
      title: "Tekshiruv testi",
      mode: "manual",
      selected_ids: ids,
      question_count: ids.length,
      duration_minutes: 2,
      random_order: false,
      shuffle_options: false,
      ...more,
    },
  });
  if (r.status !== 201) throw Error(JSON.stringify(r));
  const cid = r.data.id;
  const activated = await h.request(`/api/v2/teacher/cards/${cid}/status`, {
    method: "POST",
    ...u,
    data: { status: "active" },
  });
  if (activated.status !== 200) throw Error(JSON.stringify(activated));
  const got = await h.request(`/api/v2/teacher/cards/${cid}`, u);
  return got.data.card;
}
