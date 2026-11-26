import { settings } from "./core";
import { rows } from "./core";
import { getEffectivePlan, getEffectiveLearnerPlan, LEARNER_PLANS, pickUniqueAmount, activateTenantPlan } from "./billing";
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
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "tempmail.com", "temp-mail.org", "temp-mail.io",
  "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "sharklasers.com", "yopmail.com", "yopmail.fr",
  "throwawaymail.com", "trashmail.com", "trashmail.net", "getnada.com",
  "mohmal.com", "maildrop.cc", "dispostable.com", "fakeinbox.com",
  "mintemail.com", "dropmail.me", "emailondeck.com", "tempail.com",
  "mailnesia.com", "inboxbear.com", "tempr.email", "burnermail.io",
  "moakt.com", "mailcatch.com", "spamgourmet.com", "mytemp.email",
]);

async function validateRealEmailDomain(email: string) {
  const domain = String(email || "").split("@")[1]?.trim().toLowerCase() || "";
  if (!domain || !domain.includes(".") || domain.length > 253) {
    fail("Email manzil noto‘g‘ri kiritilgan", 400);
  }
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    fail("Bir martalik (vaqtinchalik) email manzillardan foydalanish taqiqlangan. Haqiqiy pochtangizni kiriting.", 400);
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: "application/dns-json" }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (res.ok) {
      const data: any = await res.json();
      // Status 3 = NXDOMAIN (domen umuman mavjud emas)
      if (data?.Status === 3) {
        fail("Bunday email domeni mavjud emas. Haqiqiy pochta manzilingizni tekshirib kiriting.", 400);
      }
      const answers = Array.isArray(data?.Answer) ? data.Answer : [];
      const hasMx = answers.some((a: any) => a.type === 15 && a.data && !String(a.data).endsWith(" ."));
      if (!hasMx) {
        fail("Ushbu email domenida pochta qabul qilish (MX) sozlanmagan. Haqiqiy email kiriting.", 400);
      }
    }
  } catch (e: any) {
    if (e?.status === 400) throw e;
    // Tarmoq timeout bo'lsa, haqiqiy foydalanuvchini bloklamaslik uchun o'tkazib yuboramiz
  }
}

async function sendAuthEmail(
  c: Ctx,
  email: string,
  raw: string,
  purpose: "verify" | "reset",
) {
  const fromRaw = c.env.EMAIL_FROM || "";
  if ((!c.env.RESEND_API_KEY && !c.env.BREVO_API_KEY) || !fromRaw)
    fail("Email yetkazish xizmati hali sozlanmagan", 503);

  const link = `${c.env.APP_ORIGIN}/${purpose === "verify" ? "verify-email" : "reset-password"}#token=${raw}`;
  const subject =
    purpose === "verify"
      ? "Bilim UZ — emailingizni tasdiqlang"
      : "Bilim UZ — parolni tiklash";
  const text = `${purpose === "verify" ? "Bilim UZ hisobingizni tasdiqlash" : "Bilim UZ parolini tiklash"} uchun havola: ${link}\nHavola 30 daqiqa amal qiladi. Agar so‘rov sizdan bo‘lmasa, uni e’tiborsiz qoldiring.`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;background:#f8fafc;border-radius:16px">
    <h2 style="margin:0 0 12px;color:#0f172a">Bilim UZ</h2>
    <p style="margin:0 0 18px;line-height:1.6;color:#334155">${purpose === "verify" ? "Hisobingizni faollashtirish va haqiqiy emailingizni tasdiqlash uchun quyidagi tugmani bosing:" : "Parolingizni yangilash uchun quyidagi tugmani bosing:"}</p>
    <p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;padding:12px 22px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600">${purpose === "verify" ? "Emailni tasdiqlash" : "Parolni tiklash"}</a></p>
    <p style="margin:0;font-size:12px;color:#64748b">Havola 30 daqiqa amal qiladi. Agar bu so‘rov sizdan bo‘lmasa, xatni e’tiborsiz qoldiring.</p>
  </div>`;

  // 1-urinish: Resend (3 000/oy, 100/kun bepul)
  if (c.env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": await digest(raw),
        },
        body: json({
          from: fromRaw,
          to: [email],
          subject,
          text,
          html,
        }),
      });
      if (r.ok) return;
    } catch {}
  }

  // 2-urinish (avto-zaxira): Brevo (300/kun bepul)
  if (c.env.BREVO_API_KEY) {
    const m = fromRaw.match(/^\s*(?:"?([^"<]+)"?\s*)?<([^>]+)>\s*$/);
    const senderName = (m?.[1] || "Bilim UZ").trim();
    const senderEmail = (m?.[2] || fromRaw).trim();
    try {
      const b = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": c.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: json({
          sender: { name: senderName, email: senderEmail },
          to: [{ email }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
      });
      if (b.ok) return;
    } catch {}
  }

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
async function recordReferralIfValid(
  db: D1Database,
  refCode: string,
  referredUserId: string,
  referredEmail: string,
) {
  const code = String(refCode || "").trim();
  if (!code) return null;
  try {
    const refTenant: any = await first(
      db,
      "SELECT id, owner_user_id FROM tenants WHERE slug=? AND status='active' LIMIT 1",
      code,
    );
    if (!refTenant || refTenant.owner_user_id === referredUserId) return null;
    const rid = id();
    await stmt(
      db,
      "INSERT OR IGNORE INTO teacher_referrals(id,referrer_tenant_id,referrer_user_id,referred_user_id,referred_email,ref_code,status,reward_days,created_at) VALUES(?,?,?,?,?,?,'pending',15,?)",
      rid,
      refTenant.id,
      refTenant.owner_user_id,
      referredUserId,
      referredEmail,
      code,
      now(),
    ).run();
    return rid;
  } catch {
    return null;
  }
}

async function grantReferralReward(db: D1Database, referredUserId: string) {
  try {
    const ref: any = await first(
      db,
      "SELECT * FROM teacher_referrals WHERE referred_user_id=? AND status='pending' LIMIT 1",
      referredUserId,
    );
    if (!ref) return;
    const rewardedCnt: any = await first(
      db,
      "SELECT COUNT(*) n FROM teacher_referrals WHERE referrer_tenant_id=? AND status='rewarded'",
      ref.referrer_tenant_id,
    );
    if (Number(rewardedCnt?.n || 0) >= 12) return;
    const days = Number(ref.reward_days || 15);
    await activateTenantPlan(
      db,
      ref.referrer_tenant_id,
      "pro",
      days,
      `Referral bonusi (+${days} kun)`,
    );
    await stmt(
      db,
      "UPDATE teacher_referrals SET status='rewarded', rewarded_at=? WHERE id=?",
      now(),
      ref.id,
    ).run();
  } catch {}
}

export const auth = new Hono<AppEnv>();
auth.post("/register", async (c) => {
  await rate(c, "register", 5, 3600);
  const d = await body(c, registrationSchema);
  if (c.env.REGISTRATION_OPEN !== "true")
    fail("Ro‘yxatdan o‘tish hozircha yopiq", 503);
  await turnstile(c, d.turnstile_token, ["register", "login"]);
  if (!c.env.PASSWORD_PEPPER)
    fail("Parol xizmati sozlanmagan", 503);
  await validateRealEmailDomain(d.email);
  if (await first(c.env.DB, "SELECT id FROM users WHERE email=?", d.email))
    fail("Bu email allaqachon ro‘yxatdan o‘tgan. Tizimga kiring yoki parolni tiklang.", 409);
  const uid = id(),
    raw = token();
  const hasEmailSender = Boolean((c.env.RESEND_API_KEY || c.env.BREVO_API_KEY) && c.env.EMAIL_FROM);
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
      "UPDATE users SET account_type=?, email_verified=? WHERE id=?",
      d.account_type || "teacher",
      hasEmailSender ? 0 : 1,
      uid,
    ),
  );
  if (hasEmailSender) {
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
    if (d.ref) await recordReferralIfValid(c.env.DB, d.ref, uid, d.email);
    await sendAuthEmail(c, d.email, raw, "verify");
    await authAudit(c, "registered", uid);
    return c.json(
      { message: "Emailingizga tasdiqlash havolasi yuborildi.", account_type: d.account_type },
      202,
    );
  }
  await c.env.DB.batch(statements);
  if (d.ref) {
    await recordReferralIfValid(c.env.DB, d.ref, uid, d.email);
    await grantReferralReward(c.env.DB, uid);
  }
  const csrfToken = await session(c, uid, "teacher");
  await authAudit(c, "registered_instant", uid);
  return c.json(
    {
      ok: true,
      auto_logged_in: true,
      account_type: d.account_type || "teacher",
      csrf: csrfToken,
      message: "Muvaffaqiyatli ro‘yxatdan o‘tdingiz!",
    },
    201,
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
  const verifiedUid = String((result[0].results[0] as any)?.id || "");
  if (verifiedUid) await grantReferralReward(c.env.DB, verifiedUid);
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
  await turnstile(c, d.turnstile_token, ["login", "register"]);
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
  return c.json({ ok: true, csrf, account_type: u.account_type || "teacher" });
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
        password: z.string().min(8).max(16),
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
    "SELECT display_name,email,email_verified,phone_verified,workplace,account_type FROM users WHERE id=?",
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

auth.get("/learner-hub", async (c) => {
  const p = await authenticate(c);
  const u: any = await first(
    c.env.DB,
    "SELECT id, display_name, email, workplace, account_type FROM users WHERE id=?",
    p.userId,
  );
  const plan = await getEffectiveLearnerPlan(c.env.DB, p.userId);
  const paidBooks = await rows(
    c.env.DB,
    `SELECT DISTINCT b.id, b.title, b.subject, b.summary, b.cover_key, b.price_uzs, b.updated_at, o.paid_at
     FROM library_book_orders o
     JOIN library_books b ON b.id=o.book_id
     WHERE o.user_id=? AND o.status='paid'
     ORDER BY o.paid_at DESC LIMIT 50`,
    p.userId,
  );
  const paidTests = await rows(
    c.env.DB,
    `SELECT DISTINCT c.id, c.slug, c.title, c.price_uzs, o.paid_at
     FROM test_card_orders o
     JOIN cards c ON c.id=o.card_id
     WHERE o.user_id=? AND o.status='paid'
     ORDER BY o.paid_at DESC LIMIT 50`,
    p.userId,
  );
  let testHistory: any[] = [];
  try {
    testHistory = await rows(
      c.env.DB,
      "SELECT id, card_slug, card_title, score, max_score, percentage, passed, duration_seconds, created_at FROM learner_test_history WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
      p.userId,
    );
  } catch {}
  return c.json({
    user: { ...u, scope: p.scope, account_type: u?.account_type || "teacher" },
    plan,
    has_books_access: p.scope === "owner" || plan.id === "learner_books" || plan.id === "learner_pro",
    has_tests_access: p.scope === "owner" || plan.id === "learner_pro",
    paid_books: paidBooks,
    paid_tests: paidTests,
    test_history: testHistory,
  });
});

auth.post("/account-type", async (c) => {
  const p = await authenticate(c);
  if (p.scope !== "owner") fail("Hisob rolini o‘zgartirish mumkin emas", 403);
  const d = await body(c, z.object({ account_type: z.enum(["teacher", "learner"]) }).strict());
  await stmt(c.env.DB, "UPDATE users SET account_type=? WHERE id=?", d.account_type, p.userId).run();
  return c.json({ ok: true, account_type: d.account_type });
});


auth.get("/learner-billing/status", async (c) => {
  const p = await authenticate(c);
  const plan = await getEffectiveLearnerPlan(c.env.DB, p.userId);
  const stg: any = await settings(c.env);
  const orders = await rows(
    c.env.DB,
    "SELECT id, plan, months, base_amount, unique_amount, status, created_at, paid_at FROM learner_billing_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 15",
    p.userId,
  );
  return c.json({
    plan,
    plans: LEARNER_PLANS,
    card_number: String(stg.billing_card_number || ""),
    card_holder: String(stg.billing_card_holder || ""),
    bank_name: String(stg.billing_bank_name || ""),
    orders,
  });
});

auth.post("/learner-billing/create-order", async (c) => {
  const p = await authenticate(c);
  const d = await body(
    c,
    z.object({
      plan: z.enum(["learner_books", "learner_pro"]),
      months: z.coerce.number().int().min(1).max(12).default(1),
    }).strict(),
  );
  const stg: any = await settings(c.env);
  if (!String(stg.billing_card_number || "").trim()) {
    fail("To‘lov kartasi hali sozlanmagan", 400);
  }
  const ts = now();
  const discountMul = d.months >= 12 ? 0.8 : d.months >= 6 ? 0.85 : d.months >= 3 ? 0.9 : 1;
  const baseAmount = Math.round((LEARNER_PLANS[d.plan].price * d.months * discountMul) / 1000) * 1000;
  const uniqueAmount = await pickUniqueAmount(c.env.DB, baseAmount, ts);
  const oid = id();
  const expiresAt = ts + 30 * 60;
  await stmt(
    c.env.DB,
    `INSERT INTO learner_billing_orders(id, user_id, plan, months, base_amount, unique_amount, status, tx_note, created_at, expires_at)
     VALUES(?,?,?,?,?,?,'pending','',?,?)`,
    oid,
    p.userId,
    d.plan,
    d.months,
    baseAmount,
    uniqueAmount,
    ts,
    expiresAt,
  ).run();
  return c.json({
    order_id: oid,
    plan: d.plan,
    plan_name: LEARNER_PLANS[d.plan].name,
    months: d.months,
    base_amount: baseAmount,
    unique_amount: uniqueAmount,
    expires_at: expiresAt,
    card_number: String(stg.billing_card_number || ""),
    card_holder: String(stg.billing_card_holder || ""),
    bank_name: String(stg.billing_bank_name || ""),
  }, 201);
});

auth.get("/learner-billing/order/:oid/status", async (c) => {
  const p = await authenticate(c);
  const o: any = await first(
    c.env.DB,
    "SELECT id, status, plan, paid_at FROM learner_billing_orders WHERE id=? AND user_id=?",
    c.req.param("oid"),
    p.userId,
  );
  if (!o) fail("Buyurtma topilmadi", 404);
  return c.json({ order_id: o.id, status: o.status, paid: o.status === "paid", plan: o.plan });
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
