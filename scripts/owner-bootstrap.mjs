import {
  randomUUID,
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createHmac,
} from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (a, x, i, list) =>
        i % 2 === 0 ? [...a, [x.replace(/^--/, ""), list[i + 1]]] : a,
      [],
    ),
);
if (
  !args.email ||
  !args.name ||
  !args.output ||
  !process.env.OWNER_PASSWORD ||
  !process.env.MFA_ENCRYPTION_KEY ||
  !process.env.PASSWORD_PEPPER
)
  throw Error(
    "Required: --email --name --output; secrets OWNER_PASSWORD and MFA_ENCRYPTION_KEY plus PASSWORD_PEPPER in environment",
  );
if (process.env.OWNER_PASSWORD.length < 16)
  throw Error("Owner password must contain at least 16 characters");
const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY, "base64");
if (key.length !== 32) throw Error("MFA_ENCRYPTION_KEY must be 32 bytes");
const root = resolve(args.output);
await mkdir(root, { recursive: false, mode: 0o700 });
const seed = randomBytes(20);
let bits = 0,
  value = 0,
  secret = "";
for (const b of seed) {
  value = (value << 8) | b;
  bits += 8;
  while (bits >= 5) {
    bits -= 5;
    secret += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[(value >>> bits) & 31];
  }
}
const iv = randomBytes(12),
  cipher = createCipheriv("aes-256-gcm", key, iv);
const encrypted = Buffer.concat([
  cipher.update(secret, "utf8"),
  cipher.final(),
  cipher.getAuthTag(),
]);
const encryptedSecret =
  iv.toString("base64") + "." + encrypted.toString("base64");
const salt = randomBytes(16);
const hash = `pbkdf2_sha256_hmac$100000$${salt.toString("base64")}$${pbkdf2Sync(createHmac("sha256", process.env.PASSWORD_PEPPER).update(process.env.OWNER_PASSWORD).digest("base64"), salt, 100000, 32, "sha256").toString("base64")}`;
const q = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const tick = Math.floor(Date.now() / 1000);
const sql = `INSERT INTO users(id,email,password_hash,email_verified,display_name,role,mfa_secret,terms_at,created_at) VALUES(${[randomUUID(), args.email.toLowerCase(), hash, 1, args.name, "platform_owner", encryptedSecret, tick, tick].map(q).join(",")});\n`;
await writeFile(resolve(root, "owner.sql"), sql, { mode: 0o600, flag: "wx" });
await writeFile(
  resolve(root, "totp-enrollment.txt"),
  `Import into your authenticator, then remove this file securely:\notpauth://totp/SysOneTestLab:${encodeURIComponent(args.email)}?secret=${secret}&issuer=SysOneTestLab&algorithm=SHA1&digits=6&period=30\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Owner SQL and authenticator enrollment written to the private output directory. Apply SQL only to the intended environment. No credential was printed.",
);
