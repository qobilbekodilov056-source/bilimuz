import type { Bindings, Row } from "./types";
import { digest, fail, first, id, json, now, rows, seal, stmt } from "./core";
// Ephemeral authentication tables are deliberately omitted: every restore revokes all sessions.
export const backupTables = [
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
] as const;
export async function createBackup(env: Bindings) {
  if (!env.BACKUP_ENCRYPTION_KEY)
    fail("Backup shifrlash kaliti sozlanmagan", 503);
  const size = {
    bytes: (await stmt(env.DB, "SELECT 1").run()).meta.size_after,
  };
  if (size!.bytes > 8 * 1024 * 1024)
    fail(
      "8 MB dan katta bazada runbookdagi streaming D1 export ishlatilsin",
      413,
    );
  const results = await env.DB.batch<Row>(
    backupTables.map((table) =>
      stmt(env.DB, `SELECT * FROM ${table} LIMIT 20001`),
    ),
  );
  const data: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  for (let i = 0; i < backupTables.length; i++) {
    if (results[i].results.length > 20000)
      fail("Katta jadval uchun streaming backup kerak", 413);
    data[backupTables[i]] = results[i].results;
    counts[backupTables[i]] = results[i].results.length;
  }
  const backupId = id();
  const payload = json({
    format: "sysone-testlab-backup",
    version: 1,
    created_at: now(),
    data,
  });
  if (payload.length > 8 * 1024 * 1024)
    fail("Katta backup uchun streaming export kerak", 413);
  const encrypted = await seal(payload, env.BACKUP_ENCRYPTION_KEY);
  const sha = await digest(encrypted);
  const key = `backups/${new Date().toISOString().slice(0, 10)}/${backupId}.aesgcm`;
  await env.FILES.put(key, encrypted, {
    httpMetadata: { contentType: "application/octet-stream" },
    customMetadata: { sha256: sha, format_version: "1" },
  });
  await stmt(
    env.DB,
    "INSERT INTO backup_manifest(id,object_key,sha256,created_at,table_counts_json) VALUES(?,?,?,?,?)",
    backupId,
    key,
    sha,
    now(),
    json(counts),
  ).run();
  return { id: backupId, sha256: sha, table_counts: counts };
}
export async function retention(env: Bindings) {
  const s = await first(
    env.DB,
    "SELECT value_json FROM system_settings WHERE key='platform'",
  );
  const days = JSON.parse(s!.value_json).retention_days || 365;
  const tick = now();
  const imports = await rows(
    env.DB,
    "SELECT id,preview_key FROM import_jobs WHERE expires_at<? LIMIT 1000",
    tick - 86400,
  );
  const keys = imports
    .map((r) => r.preview_key)
    .filter((k): k is string => !!k);
  if (keys.length) await env.FILES.delete(keys);
  await env.DB.batch([
    stmt(env.DB, "DELETE FROM rate_limits WHERE expires_at<?", tick),
    stmt(env.DB, "DELETE FROM auth_tokens WHERE expires_at<?", tick),
    stmt(env.DB, "DELETE FROM oidc_flows WHERE expires_at<?", tick),
    stmt(
      env.DB,
      "DELETE FROM sessions WHERE expires_at<? OR revoked_at IS NOT NULL",
      tick - 86400,
    ),
    stmt(
      env.DB,
      "DELETE FROM import_jobs WHERE id IN (SELECT value FROM json_each(?))",
      json(imports.map((r) => r.id)),
    ),
    stmt(
      env.DB,
      "DELETE FROM auth_audit_logs WHERE timestamp<?",
      tick - 90 * 86400,
    ),
    stmt(
      env.DB,
      "DELETE FROM attempts WHERE status='submitted' AND submitted_at<? AND id IN (SELECT id FROM attempts WHERE status='submitted' AND submitted_at<? LIMIT 500)",
      tick - days * 86400,
      tick - days * 86400,
    ),
  ]);
  const old = await rows(
    env.DB,
    "SELECT id,object_key FROM backup_manifest WHERE created_at<? LIMIT 100",
    tick - 7 * 86400,
  );
  for (const b of old) {
    await env.FILES.delete(b.object_key);
    await stmt(env.DB, "DELETE FROM backup_manifest WHERE id=?", b.id).run();
  }
}
