import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const checks = [
  "tenant_isolation",
  "unit_integration",
  "browser_e2e",
  "accessibility",
  "security",
  "load_100",
  "backup_restore",
  "legacy_migration_dry_run",
  "telegram_live",
  "email_live",
  "turnstile_live",
  "owner_mfa_live",
  "staging_smoke",
  "dns_https",
  "server_target_confirmed",
  "cloud_capacity",
  "monitoring_live",
  "support_contacts_verified",
  "legacy_migration_reviewed",
];
let evidence;
try {
  evidence = JSON.parse(
    await readFile(
      process.env.RELEASE_EVIDENCE_FILE || "release-evidence.local.json",
      "utf8",
    ),
  );
} catch {
  console.error(
    "RELEASE BLOCKED: real acceptance evidence is required. See docs/ACCEPTANCE_UZ.md.",
  );
  process.exit(1);
}
const sha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const missing = checks.filter(
  (k) =>
    evidence.checks?.[k]?.status !== "passed" || !evidence.checks[k].evidence,
);
if (evidence.commit !== sha) missing.push("evidence_commit_mismatch");
if (
  !evidence.origin ||
  !evidence.origin.startsWith("https://") ||
  /REPLACE|sysone\.top/.test(evidence.origin)
)
  missing.push("independent_domain");
const checkedAt = Date.parse(evidence.checked_at);
if (
  !Number.isFinite(checkedAt) ||
  Date.now() - checkedAt > 24 * 3600000 ||
  checkedAt > Date.now() + 300000
)
  missing.push("evidence_expired");
if (missing.length) {
  console.error("RELEASE BLOCKED: " + missing.join(", "));
  process.exit(1);
}
console.log(
  "Release evidence matches current commit and required acceptance gates.",
);
