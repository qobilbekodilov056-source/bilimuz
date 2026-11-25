import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { registrationSchema } from "../../packages/shared/schema";
import type { AppEnv, Ctx, Principal } from "./types";
import {
  authAudit,
  b64url,
  body,
  digest,
  equal,
  fail,
  first,
  id,
  json,
  now,
  passwordHash,
  passwordVerify,
  rate,
  stmt,
  token,
  turnstile,
  unseal,
} from "./core";

const COOKIE = "testlab_session";
export async function authenticate(c: Ctx) {
  const raw = getCookie(c, COOKIE);
  if (!raw) fail("Hisobingizga kiring", 401);
  const hash = await digest(raw);
  const r = await first(
    c.env.DB,
    `SELECT s.*,u.display_name,u.email,u.role,u.status user_status,u.email_verified,u.telegram_sub,
 t.status tenant_status,m.role membership_role,m.status membership_status
 FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN tenants t ON t.id=s.tenant_id
 LEFT JOIN tenant_memberships m ON m.tenant_id=s.tenant_id AND m.user_id=s.user_id
 WHERE s.id_hash=? AND s.expires_at>? AND s.revoked_at IS NULL`,
    hash,
    now(),
  );
  if (
    !r ||
    r.user_status !== "active" ||
    (!r.email_verified && !r.telegram_sub)
  )
    fail("Sessiya yaroqsiz", 401);
  if (
    r.scope === "teacher" &&
    (r.role !== "teacher" ||
      r.tenant_status !== "active" ||
      r.membership_status !== "active")
  )
    fail("Workspacega kirish cheklangan", 403);
  if (r.scope === "owner" && (r.role !== "platform_owner" || !r.mfa_verified))
    fail("Owner tasdiqlashi kerak", 403);
  const p: Principal = {
    userId: r.user_id,
    tenantId: r.tenant_id,
    scope: r.scope,
    sessionHash: hash,
    csrfHash: r.csrf_hash,
    name: r.display_name,
    email: r.email,
    membershipRole: r.membership_role,
  };
  c.set("principal", p);
  return p;
}
export async function csrf(c: Ctx) {
  const p = c.get("principal");
  if (
    !(await equal(await digest(c.req.header("x-csrf-token") || ""), p.csrfHash))
  )
    fail("Sahifani yangilab qayta urinib ko‘ring", 403);
}
export async function session(
  c: Ctx,
  userId: string,
  scope: "teacher" | "owner",
) {
  const tenant =
    scope === "teacher"
      ? await first(
          c.env.DB,
          "SELECT t.id FROM tenants t JOIN tenant_memberships m ON m.tenant_id=t.id WHERE m.user_id=? AND m.status='active' AND t.status='active' ORDER BY t.created_at LIMIT 1",
          userId,
        )
      : null;
  if (scope === "teacher" && !tenant) fail("Workspace topilmadi", 403);
  const raw = token(40),
    csrfRaw = token();
  const previous = getCookie(c, COOKIE);
  const batch = [];
  if (previous)
    batch.push(
      stmt(
        c.env.DB,
        "UPDATE sessions SET revoked_at=? WHERE id_hash=?",
        now(),
        await digest(previous),
      ),
    );
  batch.push(
    stmt(
      c.env.DB,
      "INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,NULL)",
      await digest(raw),
      userId,
      tenant?.id || null,
      await digest(csrfRaw),
      scope,
      scope === "owner" ? 1 : 0,
      now(),
      now() + (scope === "owner" ? 30 * 86400 : 90 * 86400),
    ),
  );
  // Explicit column count kept independent from user role; no role comes from a request body.
  await c.env.DB.batch(batch);
  setCookie(c, COOKIE, raw, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== "development",
    sameSite: "Lax",
    path: "/",
    maxAge: scope === "owner" ? 30 * 86400 : 90 * 86400,
  });
  setCookie(c, "testlab_csrf", csrfRaw, {
    secure: c.env.ENVIRONMENT !== "development",
    sameSite: "Strict",
    path: "/",
    maxAge: 90 * 86400,
  });
  return csrfRaw;
}
export function newTeacherStatements(
  c: Ctx,
  u: {
    id: string;
    email: string | null;
    password_hash: string | null;
    display_name: string;
    workplace: string;
    telegram_sub: string | null;
    phone: string | null;
    verified: number;
    terms_at: number;
  },
) {
  const tid = id();
  return {
    tenantId: tid,
    statements: [
      stmt(
        c.env.DB,
        "INSERT INTO users(id,email,password_hash,display_name,workplace,telegram_sub,phone_e164,phone_verified,terms_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        u.id,
        u.email,
        u.password_hash,
        u.display_name,
        u.workplace,
        u.telegram_sub,
        u.phone,
        u.verified,
        u.terms_at,
        now(),
      ),
      stmt(
        c.env.DB,
        "INSERT INTO tenants(id,owner_user_id,slug,name,created_at) VALUES(?,?,?,?,?)",
        tid,
        u.id,
        "ws-" + token(12),
        u.display_name + " — Workspace",
        now(),
      ),
      stmt(
        c.env.DB,
        "INSERT INTO tenant_memberships VALUES(?,?,'tenant_owner','active')",
        tid,
        u.id,
      ),
    ],
  };
}
async function sendAuthEmail(
  c: Ctx,
  email: string,
  raw: string,
  purpose: "verify" | "reset",
) {
  if (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM)
    fail("Email yetkazish xizmati hali sozlanmagan", 503);
  const link = `${c.env.APP_ORIGIN}/${purpose === "verify" ? "verify-email" : "reset-password"}#token=${raw}`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": await digest(raw),
    },
    body: json({
      from: c.env.EMAIL_FROM,
      to: [email],
      subject:
        purpose === "verify"
          ? "TestLab — emailingizni tasdiqlang"
          : "TestLab — parolni tiklash",
      text: `${purpose === "verify" ? "Hisobingizni tasdiqlash" : "Parolni tiklash"} uchun: ${link}\nHavola 30 daqiqa amal qiladi. Agar so‘rov sizdan bo‘lmasa, uni e’tiborsiz qoldiring.`,
    }),
  });
  if (!r.ok)
    fail(
      "Emailni yetkazib bo‘lmadi. Qayta yuborish tugmasidan foydalaning.",
      503,
    );
}
export async function verifyTelegramIdToken(
  idToken: string,
  clientId: string,
  nonce: string,
  jwks = telegramJWKS,
) {
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: "https://oauth.telegram.org",
      audience: clientId,
      algorithms: ["RS256", "ES256"],
      maxTokenAge: "10m",
      requiredClaims: ["exp", "iat", "sub", "nonce"],
    });
    if (!(await equal(String(payload.nonce || ""), nonce)))
      fail("Telegram nonce mos kelmadi", 401);
    if (typeof payload.sub !== "string" || !payload.sub)
      fail("Telegram foydalanuvchisi topilmadi", 401);
    return payload;
  } catch {
    fail("Telegram ID token tasdiqlanmadi", 401);
  }
}
const telegramJWKS = createRemoteJWKSet(
  new URL("https://oauth.telegram.org/.well-known/jwks.json"),
);
function base32Decode(s: string) {
  let bits = 0,
    v = 0;
  const out = [];
  for (const ch of s.toUpperCase().replace(/=+$/, "")) {
    const n = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(ch);
    if (n < 0) throw Error("Invalid base32");
    v = (v << 5) | n;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((v >>> bits) & 255);
    }
  }
  return new Uint8Array(out);
}
export async function totp(secret: string, step: number) {
  const k = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(step));
  const out = new Uint8Array(await crypto.subtle.sign("HMAC", k, b));
  const at = out[out.length - 1] & 15;
  const n =
    ((out[at] & 127) << 24) |
    (out[at + 1] << 16) |
    (out[at + 2] << 8) |
    out[at + 3];
  return String(n % 1000000).padStart(6, "0");
}
export const auth = new Hono<AppEnv>();
auth.post("/register", async (c) => {
  await rate(c, "register", 5, 3600);
  const d = await body(c, registrationSchema);
  if (c.env.REGISTRATION_OPEN !== "true")
    fail("Ro‘yxatdan o‘tish hozircha yopiq", 503);
  await turnstile(c, d.turnstile_token, "register");
  if (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM || !c.env.PASSWORD_PEPPER)
    fail("Email kirish xizmati sozlanmagan", 503);
  if (await first(c.env.DB, "SELECT id FROM users WHERE email=?", d.email))
    return c.json(
      { message: "Emailni tekshiring yoki parolni tiklashdan foydalaning." },
      202,
    );
  const uid = id(),
    raw = token();
  const { statements } = newTeacherStatements(c, {
    id: uid,
    email: d.email,
    password_hash: await passwordHash(d.password, c.env.PASSWORD_PEPPER),
    display_name: d.display_name,
    workplace: d.workplace,
    telegram_sub: null,
    phone: null,
    verified: 0,
    terms_at: now(),
  });
  statements.push(
    stmt(
      c.env.DB,
      "INSERT INTO auth_tokens VALUES(?,?,?,?,?)",
      await digest(raw),
      uid,
      "verify",
      now() + 1800,
      now(),
    ),
  );
  await c.env.DB.batch(statements);
  await sendAuthEmail(c, d.email, raw, "verify");
  await authAudit(c, "registered", uid);
  return c.json(
    { message: "Emailingizga tasdiqlash havolasi yuborildi." },
    202,
  );
});
auth.post("/verify", async (c) => {
  await rate(c, "verify", 15, 300);
  const d = await body(
    c,
    z.object({ token: z.string().min(32).max(128) }).strict(),
  );
  const h = await digest(d.token);
  const result = await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE users SET email_verified=1 WHERE id=(SELECT user_id FROM auth_tokens WHERE id_hash=? AND purpose='verify' AND expires_at>?) AND status='active' RETURNING id",
      h,
      now(),
    ),
    stmt(
      c.env.DB,
      "DELETE FROM auth_tokens WHERE id_hash=? AND purpose='verify'",
      h,
    ),
  ]);
  if (!result[0].results.length)
    fail("Havola muddati tugagan yoki ishlatilgan", 400);
  return c.json({ ok: true });
});
auth.post("/resend", async (c) => {
  await rate(c, "resend", 3, 3600);
  const d = await body(
    c,
    z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        turnstile_token: z.string(),
      })
      .strict(),
  );
  await turnstile(c, d.turnstile_token, "resend");
  const u = await first(
    c.env.DB,
    "SELECT id,email FROM users WHERE email=? AND email_verified=0 AND status='active'",
    d.email,
  );
  if (u) {
    const raw = token();
    await c.env.DB.batch([
      stmt(
        c.env.DB,
        "DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify'",
        u.id,
      ),
      stmt(
        c.env.DB,
        "INSERT INTO auth_tokens VALUES(?,?,?,?,?)",
        await digest(raw),
        u.id,
        "verify",
        now() + 1800,
        now(),
      ),
    ]);
    await sendAuthEmail(c, u.email, raw, "verify");
  }
  return c.json(
    { message: "Hisob mavjud bo‘lsa, tasdiqlash xati yuborildi." },
    202,
  );
});
auth.post("/login", async (c) => {
  if (!c.env.PASSWORD_PEPPER) fail("Kirish xizmati sozlanmagan", 503);
  await rate(c, "login-ip", 10, 300);
  const d = await body(
    c,
    z
      .object({
        email: z.email().transform((s) => s.toLowerCase()),
        password: z.string().max(128),
        turnstile_token: z.string(),
      })
      .strict(),
  );
  await rate(c, "login-account", 10, 300, d.email);
  await turnstile(c, d.turnstile_token, "login");
  const u = await first(c.env.DB, "SELECT * FROM users WHERE email=?", d.email);
  const valid = await passwordVerify(
    d.password,
    u?.password_hash ||
      "pbkdf2_sha256$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    c.env.PASSWORD_PEPPER,
  );
  if (!u || !valid || u.status !== "active" || u.role !== "teacher") {
    await authAudit(c, "login_failed", null);
    fail("Email yoki parol noto‘g‘ri", 401);
  }
  if (!u.email_verified) fail("Avval emailingizni tasdiqlang", 403);
  const csrf = await session(c, u.id, "teacher");
  await authAudit(c, "login", u.id);
  return c.json({ ok: true, csrf });
});
auth.post("/forgot", async (c) => {
  await rate(c, "forgot", 3, 3600);
  const d = await body(
    c,
    z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        turnstile_token: z.string(),
      })
      .strict(),
  );
  await turnstile(c, d.turnstile_token, "forgot");
  const u = await first(
    c.env.DB,
    "SELECT id,email FROM users WHERE email=? AND role='teacher' AND status='active'",
    d.email,
  );
  if (u) {
    const raw = token();
    await c.env.DB.batch([
      stmt(
        c.env.DB,
        "DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset'",
        u.id,
      ),
      stmt(
        c.env.DB,
        "INSERT INTO auth_tokens VALUES(?,?,?,?,?)",
        await digest(raw),
        u.id,
        "reset",
        now() + 1800,
        now(),
      ),
    ]);
    await sendAuthEmail(c, u.email, raw, "reset");
  }
  return c.json(
    { message: "Hisob mavjud bo‘lsa, tiklash havolasi yuborildi." },
    202,
  );
});
auth.post("/reset", async (c) => {
  if (!c.env.PASSWORD_PEPPER) fail("Kirish xizmati sozlanmagan", 503);
  await rate(c, "reset", 10, 300);
  const d = await body(
    c,
    z
      .object({
        token: z.string().min(32).max(128),
        password: z.string().min(12).max(128),
      })
      .strict(),
  );
  const h = await digest(d.token);
  const t = now();
  const result = await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE sessions SET revoked_at=? WHERE user_id=(SELECT user_id FROM auth_tokens WHERE id_hash=? AND purpose='reset' AND expires_at>?)",
      t,
      h,
      t,
    ),
    stmt(
      c.env.DB,
      "UPDATE users SET password_hash=?,email_verified=1 WHERE role='teacher' AND status='active' AND id=(SELECT user_id FROM auth_tokens WHERE id_hash=? AND purpose='reset' AND expires_at>?) RETURNING id",
      await passwordHash(d.password, c.env.PASSWORD_PEPPER),
      h,
      t,
    ),
    stmt(
      c.env.DB,
      "DELETE FROM auth_tokens WHERE id_hash=? AND purpose='reset'",
      h,
    ),
  ]);
  if (!result[1].results.length)
    fail("Havola muddati tugagan yoki ishlatilgan");
  return c.json({ ok: true });
});
auth.post("/telegram/start", async (c) => {
  await rate(c, "oidc-start", 10, 300);
  const d = await body(
    c,
    z
      .object({
        consent: z.boolean(),
        phone_consent: z.boolean(),
        turnstile_token: z.string(),
      })
      .strict(),
  );
  await turnstile(c, d.turnstile_token, ["telegram", "login", "register"]);
  if (!c.env.TELEGRAM_CLIENT_ID || !c.env.TELEGRAM_CLIENT_SECRET)
    fail("Telegram login hali sozlanmagan", 503);
  const raw = token(),
    browser = token(),
    verifier = token(48),
    nonce = token();
  await stmt(
    c.env.DB,
    "INSERT INTO oidc_flows VALUES(?,?,?,?,?,?,?)",
    await digest(raw),
    await digest(browser),
    verifier,
    nonce,
    d.consent ? now() : null,
    d.phone_consent ? 1 : 0,
    now() + 600,
  ).run();
  setCookie(c, "testlab_oidc", browser, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== "development",
    sameSite: "Lax",
    path: "/api/v2/auth/telegram/callback",
    maxAge: 600,
  });
  const url = new URL("https://oauth.telegram.org/auth");
  const challenge = b64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  url.search = new URLSearchParams({
    client_id: c.env.TELEGRAM_CLIENT_ID,
    redirect_uri: c.env.APP_ORIGIN + "/api/v2/auth/telegram/callback",
    response_type: "code",
    scope: "openid profile" + (d.phone_consent ? " phone" : ""),
    state: raw,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return c.json({ url: url.toString() });
});
auth.get("/telegram/callback", async (c) => {
  await rate(c, "oidc-callback", 20, 300);
  const state = c.req.query("state") || "",
    code = c.req.query("code") || "",
    browser = getCookie(c, "testlab_oidc") || "";
  deleteCookie(c, "testlab_oidc", { path: "/api/v2/auth/telegram/callback" });
  if (!state || !code || !browser)
    fail("Telegram kirish bekor qilindi yoki sessiya tugadi", 401);
  const flow = await first(
    c.env.DB,
    "DELETE FROM oidc_flows WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *",
    await digest(state),
    await digest(browser),
    now(),
  );
  if (!flow) fail("Telegram state yaroqsiz", 401);
  if (!c.env.TELEGRAM_CLIENT_ID || !c.env.TELEGRAM_CLIENT_SECRET)
    fail("Telegram login sozlanmagan", 503);
  const r = await fetch("https://oauth.telegram.org/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        btoa(c.env.TELEGRAM_CLIENT_ID + ":" + c.env.TELEGRAM_CLIENT_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: c.env.APP_ORIGIN + "/api/v2/auth/telegram/callback",
      client_id: c.env.TELEGRAM_CLIENT_ID,
      code_verifier: flow.verifier,
    }),
  });
  if (!r.ok) fail("Telegram tasdiqlashi bajarilmadi", 401);
  const result = (await r.json()) as { id_token: string };
  const claims = await verifyTelegramIdToken(
    result.id_token,
    c.env.TELEGRAM_CLIENT_ID,
    flow.nonce,
  );
  let u = await first(
    c.env.DB,
    "SELECT * FROM users WHERE telegram_sub=?",
    claims.sub,
  );
  const phone =
    flow.phone_consent &&
    claims.phone_number_verified === true &&
    typeof claims.phone_number === "string"
      ? "+" + claims.phone_number.replace(/^\+/, "")
      : null;
  const phoneValid = phone && /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
  if (!u) {
    if (!flow.terms_at || c.env.REGISTRATION_OPEN !== "true")
      fail("Ro‘yxatdan o‘tish uchun rozilik va ochiq registratsiya kerak", 403);
    const uid = id();
    await c.env.DB.batch(
      newTeacherStatements(c, {
        id: uid,
        email: null,
        password_hash: null,
        display_name: String(claims.name || "O‘qituvchi").slice(0, 120),
        workplace: "",
        telegram_sub: claims.sub!,
        phone: phoneValid,
        verified: phoneValid ? 1 : 0,
        terms_at: flow.terms_at,
      }).statements,
    );
    u = { id: uid, status: "active", role: "teacher" };
  } else if (phoneValid) {
    await stmt(
      c.env.DB,
      "UPDATE users SET phone_e164=?,phone_verified=1 WHERE id=?",
      phoneValid,
      u.id,
    ).run();
  }
  if (u.status !== "active" || u.role !== "teacher")
    fail("Akkauntga kirish cheklangan", 403);
  await session(c, u.id, "teacher");
  await authAudit(c, "telegram_login", u.id);
  return c.redirect("/studio");
});
auth.post("/owner-login", async (c) => {
  await rate(c, "owner-login", 5, 300);
  const d = await body(
    c,
    z
      .object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().max(128),
        otp: z.string().regex(/^(\d{6})?$/).optional().default(""),
        turnstile_token: z.string(),
      })
      .strict(),
  );
  await turnstile(c, d.turnstile_token, "owner");
  const u = await first(
    c.env.DB,
    "SELECT * FROM users WHERE email=? AND role='platform_owner'",
    d.email,
  );
  if (
    !u ||
    u.status !== "active" ||
    !u.mfa_secret ||
    !c.env.MFA_ENCRYPTION_KEY ||
    !c.env.PASSWORD_PEPPER ||
    !(await passwordVerify(d.password, u.password_hash, c.env.PASSWORD_PEPPER))
  )
    fail("Owner kirishi tasdiqlanmadi", 401);
  if (d.otp) {
    const secret = await unseal(u.mfa_secret, c.env.MFA_ENCRYPTION_KEY);
    const step = Math.floor(now() / 30);
    let matched = -1;
    for (const tick of [step - 1, step, step + 1])
      if (
        tick > u.mfa_last_step &&
        (await equal(await totp(secret, tick), d.otp))
      )
        matched = tick;
    if (matched < 0) fail("MFA kodi noto‘g‘ri", 401);
    const update = await first(
      c.env.DB,
      "UPDATE users SET mfa_last_step=? WHERE id=? AND mfa_last_step<? RETURNING id",
      matched,
      u.id,
      matched,
    );
    if (!update) fail("MFA kodi ishlatilgan", 401);
  }
  const csrf = await session(c, u.id, "owner");
  await authAudit(c, "owner_login", u.id);
  return c.json({ ok: true, csrf });
});
auth.get("/me", async (c) => {
  const p = await authenticate(c);
  const u = await first(
    c.env.DB,
    "SELECT display_name,email,email_verified,phone_verified,workplace FROM users WHERE id=?",
    p.userId,
  );
  const tenant = p.tenantId
    ? await first(
        c.env.DB,
        "SELECT id,name,slug FROM tenants WHERE id=?",
        p.tenantId,
      )
    : null;
  return c.json({
    user: { ...u, scope: p.scope },
    tenant,
    csrf: getCookie(c, "testlab_csrf") || "",
  });
});
auth.post("/logout", async (c) => {
  await authenticate(c);
  await csrf(c);
  await stmt(
    c.env.DB,
    "UPDATE sessions SET revoked_at=? WHERE id_hash=?",
    now(),
    c.get("principal").sessionHash,
  ).run();
  deleteCookie(c, COOKIE, { path: "/" });
  deleteCookie(c, "testlab_csrf", { path: "/" });
  return c.json({ ok: true });
});
