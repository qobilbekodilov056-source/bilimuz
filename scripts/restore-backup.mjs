import { readFile, writeFile } from "node:fs/promises";
import { createDecipheriv, createHash } from "node:crypto";
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
  !args.file ||
  !args.sha256 ||
  !args.output ||
  !process.env.BACKUP_ENCRYPTION_KEY
)
  throw Error(
    "Required: --file --sha256 --output and BACKUP_ENCRYPTION_KEY. Output is new-database SQL, never an in-place restore.",
  );
const text = await readFile(args.file, "utf8");
if (createHash("sha256").update(text).digest("hex") !== args.sha256)
  throw Error("Backup SHA-256 mismatch");
const [iv, data] = text.split(".");
const bytes = Buffer.from(data, "base64"),
  key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "base64");
if (key.length !== 32) throw Error("32-byte backup key required");
const decipher = createDecipheriv(
  "aes-256-gcm",
  key,
  Buffer.from(iv, "base64"),
);
decipher.setAuthTag(bytes.subarray(-16));
const backup = JSON.parse(
  Buffer.concat([
    decipher.update(bytes.subarray(0, -16)),
    decipher.final(),
  ]).toString("utf8"),
);
if (backup.version !== 1 || backup.format !== "sysone-testlab-backup")
  throw Error("Unsupported backup format");
const allowed = [
  "users",
  "tenants",
  "tenant_memberships",
  "groups",
  "students",
  "questions",
  "question_versions",
  "cards",
  "card_releases",
  "card_questions",
  "attempts",
  "attempt_questions",
  "attempt_answers",
  "import_jobs",
  "store_submissions",
  "store_items",
  "store_reports",
  "owner_audit_logs",
  "auth_audit_logs",
  "support_tickets",
  "system_settings",
  "ops_metrics",
];
const quote = (v) =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : "'" + String(v).replaceAll("'", "''") + "'";
const lines = [
  "-- Apply core schema to a NEW EMPTY DB first. All authentication sessions remain revoked.",
  "PRAGMA foreign_keys=ON;",
  "DROP TRIGGER attempt_admission;",
  "DELETE FROM system_settings;",
];
for (const table of allowed) {
  const list = backup.data[table];
  if (!Array.isArray(list)) throw Error("Missing table " + table);
  for (const row of list) {
    const columns = Object.keys(row);
    if (columns.some((c) => !/^[_a-z]+$/.test(c)))
      throw Error("Invalid column");
    lines.push(
      `INSERT INTO ${table}(${columns.join(",")}) VALUES(${Object.values(row).map(quote).join(",")});`,
    );
  }
}
const schema = await readFile(
  new URL("../migrations/0001_core.sql", import.meta.url),
  "utf8",
);
const trigger =
  "CREATE TRIGGER attempt_admission" +
  schema.split("CREATE TRIGGER attempt_admission")[1].split("\nEND;")[0] +
  "\nEND;";
lines.push(trigger, "PRAGMA foreign_key_check;");
await writeFile(args.output, lines.join("\n") + "\n", {
  mode: 0o600,
  flag: "wx",
});
console.log(
  JSON.stringify(
    {
      ok: true,
      counts: Object.fromEntries(
        allowed.map((t) => [t, backup.data[t].length]),
      ),
      sessions: "revoked",
    },
    null,
    2,
  ),
);
