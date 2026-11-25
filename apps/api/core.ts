import { HTTPException } from "hono/http-exception";
import type { ZodType } from "zod";
import type { Bindings, Ctx, Row } from "./types";
export const now = () => Math.floor(Date.now() / 1000);
export const id = () => crypto.randomUUID();
export const json = (value: unknown) => JSON.stringify(value);
export function likePattern(value: string) {
  let out = "",
    bytes = 0;
  const encoder = new TextEncoder();
  for (const ch of value) {
    bytes += encoder.encode(ch).length;
    if (bytes > 48) break;
    out += ch;
  }
  return "%" + out + "%";
}
export function fail(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 503 = 400,
): never {
  throw new HTTPException(status, { message });
}
export const stmt = (db: D1Database, sql: string, ...args: unknown[]) =>
  db.prepare(sql).bind(...args);
export const first = <T = Row>(
  db: D1Database,
  sql: string,
  ...args: unknown[]
) => stmt(db, sql, ...args).first<T>();
export async function rows<T = Row>(
  db: D1Database,
  sql: string,
  ...args: unknown[]
): Promise<T[]> {
  return (await stmt(db, sql, ...args).all<T>()).results;
}
export async function body<T>(c: Ctx, schema: ZodType<T>): Promise<T> {
  let raw;
  try {
    raw = await c.req.json();
  } catch {
    fail("JSON noto‘g‘ri");
  }
  return schema.parse(raw);
}
export const b64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
};
export const unb64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export const b64url = (b: Uint8Array) =>
  b64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const token = (n = 32) =>
  b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function digest(text: string | Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof text === "string"
          ? new TextEncoder().encode(text)
          : new Uint8Array(text),
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function equal(a: string, b: string) {
  const encoded = new TextEncoder();
  const [ah, bh] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoded.encode(a)),
    crypto.subtle.digest("SHA-256", encoded.encode(b)),
  ]);
  const compare = Reflect.get(crypto.subtle, "timingSafeEqual") as
    ((a: ArrayBuffer, b: ArrayBuffer) => boolean) | undefined;
  if (compare) return compare.call(crypto.subtle, ah, bh);
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    await crypto.subtle.sign("HMAC", key, ah),
    bh,
  );
}
async function passwordInput(password: string, pepper?: string) {
  if (!pepper) return password;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password)),
    ),
  );
}
export async function passwordHash(password: string, pepper?: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await passwordInput(password, pepper)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  return `${pepper ? "pbkdf2_sha256_hmac" : "pbkdf2_sha256"}$100000$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}
export async function passwordVerify(
  password: string,
  encoded: string,
  pepper?: string,
) {
  try {
    const [alg, n, salt, expected] = encoded.split("$");
    if (
      !["pbkdf2_sha256", "pbkdf2_sha256_hmac"].includes(alg) ||
      +n < 100000 ||
      +n > 600000 ||
      (alg === "pbkdf2_sha256_hmac" && !pepper)
    )
      return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(
        await passwordInput(
          password,
          alg === "pbkdf2_sha256_hmac" ? pepper : undefined,
        ),
      ),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    return equal(
      b64(
        new Uint8Array(
          await crypto.subtle.deriveBits(
            {
              name: "PBKDF2",
              salt: unb64(salt),
              iterations: +n,
              hash: "SHA-256",
            },
            key,
            256,
          ),
        ),
      ),
      expected,
    );
  } catch {
    return false;
  }
}
export async function seal(value: string, keyText: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    unb64(keyText),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `${b64(iv)}.${b64(new Uint8Array(encrypted))}`;
}
export async function unseal(value: string, keyText: string) {
  const [iv, data] = value.split(".");
  const key = await crypto.subtle.importKey(
    "raw",
    unb64(keyText),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(iv) },
      key,
      unb64(data),
    ),
  );
}
export async function rate(
  c: Ctx,
  topic: string,
  limit: number,
  window = 60,
  identity?: string,
) {
  const hash = await digest(
    `${topic}:${identity || c.req.header("cf-connecting-ip") || "local"}:${Math.floor(now() / window)}`,
  );
  const r = await first(
    c.env.DB,
    "INSERT INTO rate_limits(key_hash,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET hits=hits+1 RETURNING hits",
    hash,
    now() + window * 2,
  );
  if (r!.hits > limit) {
    c.header("Retry-After", String(window));
    fail("So‘rovlar ko‘paydi. Birozdan keyin qayta urinib ko‘ring.", 429);
  }
}
export async function turnstile(c: Ctx, value: string, action: string | string[]) {
  if (!c.env.TURNSTILE_SECRET)
    fail("Xavfsizlik tekshiruvi hali sozlanmagan", 503);
  const r = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({
        secret: c.env.TURNSTILE_SECRET,
        response: value,
        remoteip: c.req.header("cf-connecting-ip") || "",
        idempotency_key: id(),
      }),
    },
  );
  if (!r.ok) fail("Xavfsizlik xizmati vaqtincha ishlamayapti", 503);
  const result = (await r.json()) as {
    success: boolean;
    hostname?: string;
    action?: string;
  };
  const allowed = Array.isArray(action) ? action : [action];
  if (
    !result.success ||
    result.hostname !== new URL(c.env.APP_ORIGIN).hostname ||
    (result.action && !allowed.includes(result.action))
  )
    fail("Xavfsizlik tekshiruvidan qayta o‘ting", 403);
}
export async function audit(
  c: Ctx,
  action: string,
  targetType: string,
  targetId: string,
  reason: string,
) {
  const p = c.get("principal");
  await stmt(
    c.env.DB,
    "INSERT INTO owner_audit_logs VALUES(?,?,?,?,?,?,?)",
    id(),
    p.userId,
    action,
    targetType,
    targetId,
    reason,
    now(),
  ).run();
}
export async function authAudit(c: Ctx, action: string, userId: string | null) {
  await stmt(
    c.env.DB,
    "INSERT INTO auth_audit_logs VALUES(?,?,?,?,?)",
    id(),
    userId,
    action,
    await digest(c.req.header("cf-connecting-ip") || "local"),
    now(),
  ).run();
}
export async function settings(env: Bindings) {
  const r = await first(
    env.DB,
    "SELECT value_json FROM system_settings WHERE key='platform'",
  );
  return JSON.parse(r!.value_json);
}
export function paging(c: Ctx) {
  return {
    limit: Math.min(100, Math.max(1, Number(c.req.query("limit")) || 30)),
    offset: Math.max(0, Math.min(100000, Number(c.req.query("offset")) || 0)),
  };
}
export async function scoped(
  c: Ctx,
  table:
    | "questions"
    | "cards"
    | "groups"
    | "students"
    | "import_jobs"
    | "attempts"
    | "support_tickets",
  resourceId: string,
) {
  const r = await first(
    c.env.DB,
    `SELECT * FROM ${table} WHERE tenant_id=? AND id=?`,
    c.get("principal").tenantId,
    resourceId,
  );
  if (!r) fail("Ma’lumot topilmadi", 404);
  return r;
}
