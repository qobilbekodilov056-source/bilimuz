import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import {
  audit,
  body,
  fail,
  first,
  id,
  json,
  now,
  paging,
  rate,
  rows,
  settings,
  stmt,
} from "./core";
import { authenticate, csrf } from "./auth";
import { questionSchema } from "../../packages/shared/schema";
import { createBackup } from "./backup";
import { gamesOwner } from "./games";
export const owner = new Hono<AppEnv>();
owner.use("*", async (c, next) => {
  const p = await authenticate(c);
  if (p.scope !== "owner") fail("Owner ruxsati kerak", 403);
  if (!["GET", "HEAD"].includes(c.req.method)) await csrf(c);
  await rate(c, "owner", 120, 60, p.userId);
  await next();
});
owner.route("/games", gamesOwner);
owner.get("/overview", async (c) => {
  const stats = await first(
    c.env.DB,
    `SELECT (SELECT COUNT(*) FROM tenants WHERE status!='deleted') tenants,(SELECT COUNT(*) FROM users WHERE role='teacher' AND status='active') teachers,
 (SELECT COUNT(*) FROM questions) questions,(SELECT COUNT(*) FROM cards) cards,(SELECT COUNT(*) FROM attempts) attempts,
 (SELECT COUNT(*) FROM store_submissions WHERE moderation_status='pending') pending,(SELECT COUNT(*) FROM support_tickets WHERE status='open') support_open`,
  );
  const size = {
    bytes: (await stmt(c.env.DB, "SELECT 1").run()).meta.size_after,
  };
  const metric = await first(
    c.env.DB,
    "SELECT * FROM ops_metrics WHERE day=?",
    new Date().toISOString().slice(0, 10),
  );
  const backup = await first(
    c.env.DB,
    "SELECT id,created_at FROM backup_manifest ORDER BY created_at DESC LIMIT 1",
  );
  return c.json({
    stats,
    health: {
      database: "ok",
      storage_bytes: size!.bytes,
      last_backup: backup || null,
    },
    usage: metric || null,
    usage_notice:
      "Workers/D1 usage tashqi monitoring orqali yuklanadi; bo‘sh qiymat nol sarfni bildirmaydi.",
    thresholds: [70, 85, 95],
  });
});
owner.get("/teachers", async (c) => {
  const { limit, offset } = paging(c);
  return c.json({
    items: await rows(
      c.env.DB,
      "SELECT t.id,t.name,t.slug,t.status,t.created_at,u.display_name,CASE WHEN u.email IS NULL THEN NULL ELSE substr(u.email,1,2)||'***@'||substr(u.email,instr(u.email,'@')+1) END email,u.phone_verified FROM tenants t JOIN users u ON u.id=t.owner_user_id ORDER BY t.created_at DESC LIMIT ? OFFSET ?",
      limit,
      offset,
    ),
  });
});
owner.post("/teachers/:id/status", async (c) => {
  const d = await body(
    c,
    z
      .object({
        status: z.enum(["active", "blocked"]),
        reason: z.string().trim().min(10).max(1000),
      })
      .strict(),
  );
  const t = await first(
    c.env.DB,
    "SELECT id,owner_user_id FROM tenants WHERE id=?",
    c.req.param("id"),
  );
  if (!t) fail("Workspace topilmadi", 404);
  await c.env.DB.batch([
    stmt(c.env.DB, "UPDATE tenants SET status=? WHERE id=?", d.status, t.id),
    stmt(
      c.env.DB,
      "UPDATE sessions SET revoked_at=? WHERE tenant_id=?",
      now(),
      t.id,
    ),
    stmt(
      c.env.DB,
      "INSERT INTO owner_audit_logs VALUES(?,?,?,?,?,?,?)",
      id(),
      c.get("principal").userId,
      "tenant_" + d.status,
      "tenant",
      t.id,
      d.reason,
      now(),
    ),
  ]);
  return c.json({ ok: true });
});
owner.get("/moderation", async (c) => {
  const status = c.req.query("status") || "pending";
  if (
    ![
      "pending",
      "approved",
      "rejected",
      "revoked",
      "changes_requested",
    ].includes(status)
  )
    fail("Status noto‘g‘ri");
  const { limit, offset } = paging(c);
  const items = await rows(
    c.env.DB,
    "SELECT s.*,(SELECT COUNT(*) FROM store_items i WHERE i.fingerprint=s.fingerprint AND i.status='approved') duplicate_count FROM store_submissions s WHERE s.moderation_status=? ORDER BY s.consent_at LIMIT ? OFFSET ?",
    status,
    limit,
    offset,
  );
  return c.json({
    items: items.map((r) => ({
      ...r,
      content: JSON.parse(r.content_json),
      content_json: undefined,
    })),
  });
});
owner.post("/moderation/bulk", async (c) => {
  const d = await body(
    c,
    z
      .object({
        ids: z.array(z.string().min(1)).min(1).max(200),
        decision: z.enum([
          "approved",
          "rejected",
          "changes_requested",
          "revoked",
        ]),
        reason: z.string().trim().max(2000).optional().default(""),
      })
      .strict(),
  );
  const reason =
    d.reason.length >= 3
      ? d.reason
      : d.decision === "approved"
        ? "Owner tomonidan ommaviy tasdiqlandi va nashr qilindi"
        : d.decision === "rejected"
          ? "Owner tomonidan ommaviy rad etildi"
          : "Owner tomonidan ommaviy holat yangilandi";
  const ts = now();
  const uid = c.get("principal").userId;
  let processed = 0;
  let skipped = 0;
  const batches: any[] = [];

  for (const sid of d.ids) {
    const s = await first(
      c.env.DB,
      "SELECT * FROM store_submissions WHERE id=?",
      sid,
    );
    if (!s) {
      skipped++;
      continue;
    }
    if (d.decision === "approved") {
      if (!s.consent_at || s.license !== "CC-BY-4.0") {
        skipped++;
        continue;
      }
      const q = questionSchema.parse(JSON.parse(s.content_json));
      const publicContent = {
        question: q,
        license: s.license,
        attribution: s.attribution,
        source_version: s.source_version,
      };
      batches.push(
        stmt(
          c.env.DB,
          "INSERT INTO store_items(id,submission_id,publication_version,public_content_json,category,level,fingerprint,status,published_at) VALUES(?,?,1,?,?,?,?,'approved',?) ON CONFLICT(submission_id) DO UPDATE SET status='approved',published_at=excluded.published_at",
          id(),
          s.id,
          json(publicContent),
          q.category,
          q.level,
          s.fingerprint,
          ts,
        ),
      );
    } else {
      batches.push(
        stmt(
          c.env.DB,
          "UPDATE store_items SET status='revoked' WHERE submission_id=?",
          s.id,
        ),
      );
    }
    batches.push(
      stmt(
        c.env.DB,
        "UPDATE store_submissions SET moderation_status=?,reviewer_id=?,reviewed_at=?,reason=? WHERE id=?",
        d.decision,
        uid,
        ts,
        reason,
        s.id,
      ),
    );
    processed++;
  }

  if (processed > 0) {
    batches.push(
      stmt(
        c.env.DB,
        "INSERT INTO owner_audit_logs VALUES(?,?,?,?,?,?,?)",
        id(),
        uid,
        "store_bulk_" + d.decision,
        "submission",
        `bulk:${processed}`,
        reason,
        ts,
      ),
    );
    // D1 batch chunking (max ~80 statements per batch for safety)
    for (let i = 0; i < batches.length; i += 80) {
      await c.env.DB.batch(batches.slice(i, i + 80));
    }
  }
  return c.json({ ok: true, processed, skipped });
});
owner.post("/moderation/:id", async (c) => {
  const d = await body(
    c,
    z
      .object({
        decision: z.enum([
          "approved",
          "rejected",
          "changes_requested",
          "revoked",
        ]),
        reason: z.string().trim().min(10).max(2000),
      })
      .strict(),
  );
  const s = await first(
    c.env.DB,
    "SELECT * FROM store_submissions WHERE id=?",
    c.req.param("id"),
  );
  if (!s) fail("Taklif topilmadi", 404);
  const batches = [];
  if (d.decision === "approved") {
    if (!s.consent_at || s.license !== "CC-BY-4.0")
      fail("Muallif roziligi mavjud emas", 403);
    const q = questionSchema.parse(JSON.parse(s.content_json));
    const publicContent = {
      question: q,
      license: s.license,
      attribution: s.attribution,
      source_version: s.source_version,
    };
    batches.push(
      stmt(
        c.env.DB,
        "INSERT INTO store_items(id,submission_id,publication_version,public_content_json,category,level,fingerprint,status,published_at) VALUES(?,?,1,?,?,?,?,'approved',?) ON CONFLICT(submission_id) DO UPDATE SET status='approved',published_at=excluded.published_at",
        id(),
        s.id,
        json(publicContent),
        q.category,
        q.level,
        s.fingerprint,
        now(),
      ),
    );
  } else
    batches.push(
      stmt(
        c.env.DB,
        "UPDATE store_items SET status='revoked' WHERE submission_id=?",
        s.id,
      ),
    );
  batches.push(
    stmt(
      c.env.DB,
      "UPDATE store_submissions SET moderation_status=?,reviewer_id=?,reviewed_at=?,reason=? WHERE id=?",
      d.decision,
      c.get("principal").userId,
      now(),
      d.reason,
      s.id,
    ),
  );
  batches.push(
    stmt(
      c.env.DB,
      "INSERT INTO owner_audit_logs VALUES(?,?,?,?,?,?,?)",
      id(),
      c.get("principal").userId,
      "store_" + d.decision,
      "submission",
      s.id,
      d.reason,
      now(),
    ),
  );
  await c.env.DB.batch(batches);
  return c.json({ ok: true });
});
owner.get("/audit", async (c) => {
  const { limit, offset } = paging(c);
  return c.json({
    items: await rows(
      c.env.DB,
      "SELECT * FROM owner_audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?",
      limit,
      offset,
    ),
  });
});
owner.get("/market-cards", async (c) => {
  const st = c.req.query("status") || "pending";
  const items = await rows(
    c.env.DB,
    `SELECT c.id, c.slug, c.title, c.settings_json, c.market_status, c.market_solves, c.updated_at, t.name tenant_name
     FROM cards c JOIN tenants t ON t.id=c.tenant_id
     WHERE c.market_status=?
     ORDER BY c.updated_at DESC LIMIT 100`,
    st,
  );
  return c.json({
    items: items.map((r) => {
      const s = JSON.parse(r.settings_json || "{}");
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        category: s.category || "",
        question_count: s.question_count || 0,
        duration_minutes: s.duration_minutes || 0,
        description: s.description || "",
        tenant_name: r.tenant_name,
        market_status: r.market_status,
        market_solves: Number(r.market_solves || 0),
        updated_at: r.updated_at,
      };
    }),
  });
});
owner.post("/market-cards/:id", async (c) => {
  const d = await body(
    c,
    z.object({ decision: z.enum(["approved", "rejected"]) }),
  );
  const cid = c.req.param("id");
  await stmt(
    c.env.DB,
    "UPDATE cards SET market_status=?, updated_at=? WHERE id=?",
    d.decision,
    now(),
    cid,
  ).run();
  return c.json({ ok: true, market_status: d.decision });
});
owner.get("/library-books", async (c) => {
  const st = c.req.query("status") || "pending";
  const items = await rows(
    c.env.DB,
    `SELECT b.id, b.title, b.subject, b.summary, b.author_name, b.moderation_status, b.updated_at,
      t.name tenant_name,
      (SELECT COUNT(*) FROM library_chapters ch WHERE ch.book_id=b.id) chapter_count
     FROM library_books b JOIN tenants t ON t.id=b.tenant_id
     WHERE b.published=1 AND b.moderation_status=?
     ORDER BY b.updated_at DESC LIMIT 100`,
    st,
  );
  return c.json({ items });
});
owner.post("/library-books/:id", async (c) => {
  const d = await body(c, z.object({ decision: z.enum(["approved", "rejected"]) }));
  await stmt(
    c.env.DB,
    "UPDATE library_books SET moderation_status=?, updated_at=? WHERE id=?",
    d.decision,
    now(),
    c.req.param("id"),
  ).run();
  return c.json({ ok: true, moderation_status: d.decision });
});
owner.get("/reports", async (c) =>
  c.json({
    items: await rows(
      c.env.DB,
      "SELECT id,item_id,reason,created_at,status FROM store_reports ORDER BY created_at DESC LIMIT 100",
    ),
  }),
);
owner.post("/reports/:id/resolve", async (c) => {
  const d = await body(
    c,
    z.object({ reason: z.string().min(10).max(1000) }).strict(),
  );
  const r = await first(
    c.env.DB,
    "SELECT id FROM store_reports WHERE id=?",
    c.req.param("id"),
  );
  if (!r) fail("Shikoyat topilmadi", 404);
  await stmt(
    c.env.DB,
    "UPDATE store_reports SET status='resolved' WHERE id=?",
    r.id,
  ).run();
  await audit(c, "report_resolved", "report", r.id, d.reason);
  return c.json({ ok: true });
});
owner.get("/support", async (c) =>
  c.json({
    items: await rows(
      c.env.DB,
      "SELECT id,tenant_id,subject,message,status,reply,created_at FROM support_tickets ORDER BY created_at DESC LIMIT 100",
    ),
  }),
);
owner.post("/support/:id/reply", async (c) => {
  const d = await body(
    c,
    z
      .object({
        reply: z.string().trim().min(3).max(4000),
        status: z.enum(["open", "resolved"]),
      })
      .strict(),
  );
  const r = await first(
    c.env.DB,
    "SELECT id FROM support_tickets WHERE id=?",
    c.req.param("id"),
  );
  if (!r) fail("Murojaat topilmadi", 404);
  await stmt(
    c.env.DB,
    "UPDATE support_tickets SET reply=?,status=? WHERE id=?",
    d.reply,
    d.status,
    r.id,
  ).run();
  await audit(c, "support_reply", "support", r.id, "Murojaatga javob berildi");
  return c.json({ ok: true });
});
owner.get("/settings", async (c) => c.json(await settings(c.env)));
owner.put("/settings", async (c) => {
  const d = await body(
    c,
    z
      .object({
        support_email: z.union([z.email(), z.literal("")]),
        support_telegram: z
          .string()
          .regex(/^(https:\/\/t\.me\/\+?[-A-Za-z0-9_]{5,64})?$/),
        maintenance: z.string().max(500),
        retention_days: z.number().int().min(30).max(730),
        store_enabled: z.boolean().default(true),
        games_enabled: z.boolean().default(true),
        library_enabled: z.boolean().default(true),
        assignments_enabled: z.boolean().default(true),
        journal_enabled: z.boolean().default(true),
        parent_enabled: z.boolean().default(true),
        practice_enabled: z.boolean().default(true),
        apk_enabled: z.boolean().default(true),
        reason: z.string().min(5).max(1000),
      })
      .strict(),
  );
  const { reason, ...data } = d;
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE system_settings SET value_json=? WHERE key='platform'",
      json(data),
    ),
    stmt(
      c.env.DB,
      "INSERT INTO owner_audit_logs VALUES(?,?,?,?,?,?,?)",
      id(),
      c.get("principal").userId,
      "settings_updated",
      "settings",
      "platform",
      reason,
      now(),
    ),
  ]);
  return c.json({ ok: true });
});
owner.get("/sessions", async (c) =>
  c.json({
    items: await rows(
      c.env.DB,
      "SELECT id_hash,created_at,expires_at,revoked_at FROM sessions WHERE user_id=? AND scope='owner' ORDER BY created_at DESC",
      c.get("principal").userId,
    ),
  }),
);
owner.delete("/sessions/:id", async (c) => {
  await stmt(
    c.env.DB,
    "UPDATE sessions SET revoked_at=? WHERE id_hash=? AND user_id=?",
    now(),
    c.req.param("id"),
    c.get("principal").userId,
  ).run();
  return c.json({ ok: true });
});
owner.get("/backups", async (c) =>
  c.json({
    items: await rows(
      c.env.DB,
      "SELECT id,sha256,created_at,table_counts_json,format_version FROM backup_manifest ORDER BY created_at DESC LIMIT 30",
    ),
  }),
);
owner.post("/backups", async (c) => {
  const d = await body(
    c,
    z.object({ reason: z.string().min(10).max(1000) }).strict(),
  );
  await rate(c, "backup", 2, 3600, c.get("principal").userId);
  const b = await createBackup(c.env);
  await audit(c, "backup_created", "backup", b.id, d.reason);
  return c.json(b, 201);
});
owner.get("/readiness", async (c) =>
  c.json({
    registration_open: c.env.REGISTRATION_OPEN === "true",
    telegram: !!(c.env.TELEGRAM_CLIENT_ID && c.env.TELEGRAM_CLIENT_SECRET),
    email: !!(c.env.RESEND_API_KEY && c.env.EMAIL_FROM),
    turnstile: !!(c.env.TURNSTILE_SECRET && c.env.TURNSTILE_SITE_KEY),
    owner_mfa_key: !!c.env.MFA_ENCRYPTION_KEY,
    backup_key: !!c.env.BACKUP_ENCRYPTION_KEY,
    origin: c.env.APP_ORIGIN,
    environment: c.env.ENVIRONMENT,
  }),
);
