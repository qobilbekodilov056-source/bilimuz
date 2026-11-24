// Operator tool: streams a D1 SQL export through AES-256-GCM into a private R2
// object. This is the large-database path; no whole-database JSON buffering.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm, writeFile, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { resolve } from "node:path";
import { readConfig } from "./config.mjs";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce(
      (a, x, i, list) =>
        i % 2 === 0 ? [...a, [x.replace(/^--/, ""), list[i + 1]]] : a,
      [],
    ),
);
if (!["staging", "production"].includes(args.env) || !args.directory)
  throw Error(
    "Required: --env staging|production --directory NEW_PRIVATE_DIRECTORY",
  );
const secret = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64");
if (secret.length !== 32)
  throw Error("BACKUP_ENCRYPTION_KEY: 32 bytes required");
const config = await readConfig();
const target = config.env[args.env];
if (JSON.stringify(target).includes("REPLACE"))
  throw Error("Configure actual resources first");
const root = resolve(args.directory);
await mkdir(root, { mode: 0o700 });
const run = (cmd, argv) =>
  new Promise((done, reject) => {
    const child = spawn(cmd, argv, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? done() : reject(Error(cmd + " failed: " + code)),
    );
  });
const plain = resolve(root, "database.sql"),
  encrypted = resolve(root, "database.sql.aesgcm");
if (args.restore_file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(args.restore_file))
    hash.update(chunk);
  if (hash.digest("hex") !== args.sha256) throw Error("SHA256 mismatch");
  const handle = await open(args.restore_file, "r");
  const metadata = Buffer.alloc(19);
  await handle.read(metadata, 0, 19, 0);
  if (metadata.subarray(0, 7).toString() !== "S1BKP02")
    throw Error("Unknown streaming backup version");
  const size = (await handle.stat()).size;
  const tag = Buffer.alloc(16);
  await handle.read(tag, 0, 16, size - 16);
  await handle.close();
  const decrypt = createDecipheriv("aes-256-gcm", secret, metadata.subarray(7));
  decrypt.setAuthTag(tag);
  await pipeline(
    createReadStream(args.restore_file, { start: 19, end: size - 17 }),
    decrypt,
    createWriteStream(plain, { mode: 0o600, flags: "wx" }),
  );
  console.log(
    "Decrypted SQL in private directory. Apply only to an empty isolated restore target; validate counts and FK before cutover.",
  );
} else {
  await run("npx", [
    "wrangler",
    "d1",
    "export",
    "DB",
    "--env",
    args.env,
    "--remote",
    "--output",
    plain,
  ]);
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", secret, iv);
  await writeFile(encrypted, Buffer.concat([Buffer.from("S1BKP02"), iv]), {
    mode: 0o600,
    flag: "wx",
  });
  await pipeline(
    createReadStream(plain),
    cipher,
    createWriteStream(encrypted, { flags: "a" }),
  );
  const handle = await open(encrypted, "a");
  await handle.write(cipher.getAuthTag());
  await handle.close();
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(encrypted)) hash.update(chunk);
  const sha256 = hash.digest("hex");
  const objectKey = `backups-stream/${new Date().toISOString().replace(/[:.]/g, "-")}.sql.aesgcm`;
  const bucket = target.r2_buckets[0].bucket_name;
  await run("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    bucket + "/" + objectKey,
    "--remote",
    "--file",
    encrypted,
  ]);
  const manifest = {
    format_version: 2,
    environment: args.env,
    created_at: new Date().toISOString(),
    object_key: objectKey,
    sha256,
    size: (await stat(encrypted)).size,
    sessions: "revoke all sessions after restore before exposing application",
  };
  const manifestFile = resolve(root, "manifest.json");
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await run("npx", [
    "wrangler",
    "r2",
    "object",
    "put",
    bucket + "/" + objectKey + ".manifest.json",
    "--remote",
    "--file",
    manifestFile,
  ]);
  await rm(plain);
  console.log(
    "Encrypted streaming backup stored. Recovery key stays outside R2; apply a 7-day lifecycle policy to backups-stream/.",
  );
}
