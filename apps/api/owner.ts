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
import { billingOwner } from "./billing";
import { tgbotOwner } from "./tgbot";
export const owner = new Hono<AppEnv>();
owner.use("*", async (c, next) => {
  const p = await authenticate(c);
  if (p.scope !== "owner") fail("Owner ruxsati kerak", 403);
  if (!["GET", "HEAD"].includes(c.req.method)) await csrf(c);
  await rate(c, "owner", 120, 60, p.userId);
  await next();
});
owner.route("/games", gamesOwner);
owner.route("/billing", billingOwner);
owner.route("/tgbot", tgbotOwner);
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
  const d1Limit = 500 * 1024 * 1024; // 500 MB Cloudflare D1 Free
  const d1Used = Number(size?.bytes || 0);
  const r2Limit = 10 * 1024 * 1024 * 1024; // 10 GB Cloudflare R2 Free
  let r2Used = 0;
  let r2Count = 0;
  const r2Breakdown: Record<string, { bytes: number; count: number }> = {
    apk: { bytes: 0, count: 0 },
    cosmetics: { bytes: 0, count: 0 },
    libpdf: { bytes: 0, count: 0 },
    hw: { bytes: 0, count: 0 },
    qimg: { bytes: 0, count: 0 },
    backups: { bytes: 0, count: 0 },
    other: { bytes: 0, count: 0 },
  };
  try {
    let cursor: string | undefined = undefined;
    for (let page = 0; page < 5; page++) {
      const listed = await c.env.FILES.list({ limit: 1000, cursor });
      for (const obj of listed.objects || []) {
        const sz = Number(obj.size || 0);
        r2Used += sz;
        r2Count++;
        const k = obj.key || "";
        const bucket =
          k.startsWith("app/") ? "apk" :
          k.startsWith("cosmetics/") ? "cosmetics" :
          k.startsWith("libpdf/") ? "libpdf" :
          k.startsWith("hw/") ? "hw" :
          k.startsWith("qimg/") ? "qimg" :
          k.startsWith("backup") ? "backups" : "other";
        r2Breakdown[bucket].bytes += sz;
        r2Breakdown[bucket].count++;
      }
      if (!listed.truncated || !listed.cursor) break;
      cursor = listed.cursor;
    }
  } catch {}

  return c.json({
    stats,
    health: {
      database: "ok",
      storage_bytes: d1Used,
      last_backup: backup || null,
    },
    resources: {
      d1: {
        used_bytes: d1Used,
        limit_bytes: d1Limit,
        free_bytes: Math.max(0, d1Limit - d1Used),
        percent: Number(((d1Used / d1Limit) * 100).toFixed(2)),
      },
      r2: {
        used_bytes: r2Used,
        limit_bytes: r2Limit,
        free_bytes: Math.max(0, r2Limit - r2Used),
        percent: Number(((r2Used / r2Limit) * 100).toFixed(3)),
        files_count: r2Count,
        breakdown: r2Breakdown,
      },
    },
    usage: metric || null,
    usage_notice:
      "D1 (500 MB) va R2 (10 GB) Cloudflare bepul tarif limitlari bo‘yicha jonli hisoblanadi.",
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

// Owner: barcha kitoblar (narx, muqova, bob soni bilan)
owner.get("/library-catalog", async (c) => {
  const items = await rows(
    c.env.DB,
    `SELECT b.*, t.name tenant_name,
      (SELECT COUNT(*) FROM library_chapters ch WHERE ch.book_id=b.id) chapter_count,
      (SELECT COUNT(*) FROM library_book_orders o WHERE o.book_id=b.id AND o.status='paid') sales_count
     FROM library_books b
     LEFT JOIN tenants t ON t.id=b.tenant_id
     ORDER BY b.updated_at DESC LIMIT 200`,
  );
  const orders = await rows(
    c.env.DB,
    `SELECT o.*, b.title book_title
     FROM library_book_orders o
     JOIN library_books b ON b.id=o.book_id
     ORDER BY o.created_at DESC LIMIT 100`,
  );
  return c.json({ items, orders });
});

// Owner: yangi rasmiy kitob / IELTS qo‘llanma yaratish (darhol tasdiqlangan)
owner.post("/library-books/create", async (c) => {
  const p = c.get("principal");
  const d = await body(
    c,
    z.object({
      title: z.string().trim().min(2).max(180),
      subject: z.string().trim().min(2).max(80),
      summary: z.string().trim().max(1200).optional().default(""),
      author_name: z.string().trim().max(100).optional().default("Bilim UZ Rasmiy"),
      price_uzs: z.coerce.number().int().min(0).max(5000000).default(0),
      chapter_title: z.string().trim().max(180).optional().default(""),
      chapter_content: z.string().max(40000).optional().default(""),
    }).strict(),
  );
  const t = now();
  // Rasmiy tenant mavjud bo‘lmasa yaratamiz
  await stmt(
    c.env.DB,
    `INSERT OR IGNORE INTO tenants(id, owner_user_id, slug, name, status, quotas_json, created_at)
     VALUES('tenant_bilimuz_official', ?, 'bilimuz-official', 'Bilim UZ Rasmiy Bazasi', 'active', '{"questions":50000,"students":50000}', ?)`,
    p.userId,
    t,
  ).run();
  const bid = id();
  await stmt(
    c.env.DB,
    `INSERT INTO library_books(id,tenant_id,title,subject,summary,tags,author_name,linked_card_slug,published,moderation_status,views_count,cover_key,price_uzs,created_at,updated_at)
     VALUES(?,'tenant_bilimuz_official',?,?,?,'',?,'',1,'approved',0,'',?,?,?)`,
    bid,
    d.title,
    d.subject,
    d.summary,
    d.author_name || "Bilim UZ Rasmiy",
    d.price_uzs,
    t,
    t,
  ).run();
  if (d.chapter_title && d.chapter_content) {
    await stmt(
      c.env.DB,
      `INSERT INTO library_chapters(id,book_id,position,title,summary,content,created_at,updated_at)
       VALUES(?,?,1,?,'',?,?,?)`,
      id(),
      bid,
      d.chapter_title,
      d.chapter_content,
      t,
      t,
    ).run();
  }
  return c.json({ ok: true, id: bid }, 201);
});

// Owner: mavjud kitobga yangi bob qo‘shish
owner.post("/library-books/:id/chapters", async (c) => {
  const bid = c.req.param("id");
  const d = await body(
    c,
    z.object({
      title: z.string().trim().min(2).max(180),
      content: z.string().trim().min(5).max(50000),
    }).strict(),
  );
  const mx: any = await first(c.env.DB, "SELECT COALESCE(MAX(position),0) m FROM library_chapters WHERE book_id=?", bid);
  const t = now();
  await stmt(
    c.env.DB,
    "INSERT INTO library_chapters(id,book_id,position,title,summary,content,created_at,updated_at) VALUES(?,?,?,?, '', ?, ?, ?)",
    id(),
    bid,
    Number(mx?.m || 0) + 1,
    d.title,
    d.content,
    t,
    t,
  ).run();
  await stmt(c.env.DB, "UPDATE library_books SET updated_at=? WHERE id=?", t, bid).run();
  return c.json({ ok: true }, 201);
});

// Owner: istalgan kitob narxini belgilash (0 = bepul)
owner.post("/library-books/:id/pricing", async (c) => {
  const bid = c.req.param("id");
  const d = await body(
    c,
    z.object({
      price_uzs: z.coerce.number().int().min(0).max(5000000),
    }).strict(),
  );
  await stmt(
    c.env.DB,
    "UPDATE library_books SET price_uzs=?, updated_at=? WHERE id=?",
    d.price_uzs,
    now(),
    bid,
  ).run();
  return c.json({ ok: true, price_uzs: d.price_uzs });
});

// Owner: kitobga yengil WebP muqova yuklash
owner.delete("/library-books/:id/cover", async (c) => {
  const bid = c.req.param("id");
  const b: any = await first(c.env.DB, "SELECT cover_key FROM library_books WHERE id=?", bid);
  if (b?.cover_key) {
    try { await c.env.FILES.delete(String(b.cover_key)); } catch {}
  }
  await stmt(c.env.DB, "UPDATE library_books SET cover_key='', updated_at=? WHERE id=?", now(), bid).run();
  return c.json({ ok: true });
});

owner.post("/library-books/:id/cover", async (c) => {
  const bid = c.req.param("id");
  const fd = await c.req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) fail("Muqova rasmi tanlanmadi", 400);
  if (file.size > 350 * 1024) fail("Muqova hajmi 350 KB dan oshmasligi kerak", 400);
  const key = `library/covers/${bid}.webp`;
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/webp" },
  });
  await stmt(c.env.DB, "UPDATE library_books SET cover_key=?, updated_at=? WHERE id=?", key, now(), bid).run();
  return c.json({ ok: true, cover_key: key });
});

// Owner: kitob buyurtmasini qo‘lda tasdiqlash / rad etish

owner.get("/paid-tests", async (c) => {
  const cards = await rows(
    c.env.DB,
    `SELECT c.id, c.slug, c.title, c.price_uzs, c.market_solves, c.updated_at, t.name tenant_name,
      (SELECT COUNT(*) FROM test_card_orders o WHERE o.card_id=c.id AND o.status='paid') sales_count
     FROM cards c
     JOIN tenants t ON t.id=c.tenant_id
     WHERE c.status='active' AND c.group_id IS NULL AND c.settings_json LIKE '%"access_mode":"open"%'
     ORDER BY c.updated_at DESC LIMIT 200`,
  );
  const orders = await rows(
    c.env.DB,
    `SELECT o.*, c.title card_title
     FROM test_card_orders o
     JOIN cards c ON c.id=o.card_id
     ORDER BY o.created_at DESC LIMIT 100`,
  );
  return c.json({ cards, orders });
});

owner.post("/paid-tests/:cardId/pricing", async (c) => {
  const cid = c.req.param("cardId");
  const d = await body(c, z.object({ price_uzs: z.coerce.number().int().min(0).max(5000000) }).strict());
  await stmt(c.env.DB, "UPDATE cards SET price_uzs=?, updated_at=? WHERE id=?", d.price_uzs, now(), cid).run();
  return c.json({ ok: true, price_uzs: d.price_uzs });
});


owner.get("/promo-codes", async (c) => {
  const items = await rows(
    c.env.DB,
    "SELECT * FROM content_promo_codes ORDER BY created_at DESC LIMIT 200",
  );
  return c.json({ items });
});

owner.post("/promo-codes", async (c) => {
  const d = await body(
    c,
    z.object({
      code: z.string().trim().min(3).max(32),
      target_type: z.enum(["all", "book", "test"]).default("all"),
      target_id: z.string().trim().max(80).optional().default(""),
      discount_percent: z.coerce.number().int().min(0).max(100).default(100),
      discount_uzs: z.coerce.number().int().min(0).max(5000000).default(0),
      max_uses: z.coerce.number().int().min(1).max(100000).default(50),
      expires_days: z.coerce.number().int().min(0).max(3650).default(0),
    }).strict(),
  );
  const code = d.code.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (code.length < 3) fail("Promokod faqat harf va raqamlardan iborat bo‘lsin (kamida 3 belgi)", 400);
  const ts = now();
  const expiresAt = d.expires_days > 0 ? ts + d.expires_days * 86400 : 0;
  const pid = id();
  await stmt(
    c.env.DB,
    `INSERT INTO content_promo_codes(id, code, target_type, target_id, discount_percent, discount_uzs, max_uses, used_count, expires_at, status, created_at)
     VALUES(?,?,?,?,?,?,?,0,?,'active',?)`,
    pid,
    code,
    d.target_type,
    d.target_id,
    d.discount_percent,
    d.discount_uzs,
    d.max_uses,
    expiresAt,
    ts,
  ).run();
  return c.json({ ok: true, id: pid, code }, 201);
});

owner.post("/promo-codes/:pid/toggle", async (c) => {
  const pid = c.req.param("pid");
  const cur: any = await first(c.env.DB, "SELECT status FROM content_promo_codes WHERE id=?", pid);
  if (!cur) fail("Promokod topilmadi", 404);
  const next = cur.status === "active" ? "disabled" : "active";
  await stmt(c.env.DB, "UPDATE content_promo_codes SET status=? WHERE id=?", next, pid).run();
  return c.json({ ok: true, status: next });
});

owner.delete("/promo-codes/:pid", async (c) => {
  await stmt(c.env.DB, "DELETE FROM content_promo_codes WHERE id=?", c.req.param("pid")).run();
  return c.json({ ok: true });
});

owner.post("/test-orders/:oid/decision", async (c) => {
  const oid = c.req.param("oid");
  const d = await body(c, z.object({ status: z.enum(["paid", "rejected"]) }).strict());
  await stmt(
    c.env.DB,
    "UPDATE test_card_orders SET status=?, paid_at=?, tx_note=? WHERE id=?",
    d.status,
    d.status === "paid" ? now() : null,
    d.status === "paid" ? "Owner tasdiqladi" : "Owner rad etdi",
    oid,
  ).run();
  return c.json({ ok: true });
});

owner.post("/library-orders/:oid/decision", async (c) => {
  const oid = c.req.param("oid");
  const d = await body(c, z.object({ status: z.enum(["paid", "rejected"]) }).strict());
  await stmt(
    c.env.DB,
    "UPDATE library_book_orders SET status=?, paid_at=?, tx_note=? WHERE id=?",
    d.status,
    d.status === "paid" ? now() : null,
    d.status === "paid" ? "Owner tasdiqladi" : "Owner rad etdi",
    oid,
  ).run();
  return c.json({ ok: true });
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
        chat_enabled: z.boolean().default(true),
        firebase_db_url: z.string().max(300).optional().default(""),
        billing_card_number: z.string().max(40).optional().default(""),
        billing_card_holder: z.string().max(80).optional().default(""),
        tg_bot_username: z.string().max(80).optional().default(""),
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

// Owner Cosmetic Packs (Banners, Transparent PNG Frames, Avatars, Titles)
owner.get("/shop-items", async (c) => {
  try {
    const items = await rows(
      c.env.DB,
      "SELECT * FROM shop_items_custom ORDER BY created_at DESC LIMIT 200",
    );
    return c.json({ items });
  } catch {
    return c.json({ items: [] });
  }
});

owner.post("/shop-items", async (c) => {
  const fd = await c.req.formData();
  const slot = String(fd.get("slot") || "").trim();
  if (!["banner", "frame", "avatar", "title"].includes(slot)) {
    fail("Tur noto‘g‘ri (banner, frame, avatar, title)", 400);
  }
  const name = String(fd.get("name") || "").trim().slice(0, 80);
  if (name.length < 2) fail("Nomini kiriting", 400);
  const description = String(fd.get("description") || "").trim().slice(0, 200);
  const price = Math.max(0, Math.min(100000, Math.round(Number(fd.get("price") || 0))));
  const rarityRaw = String(fd.get("rarity") || "rare").trim();
  const rarity = ["free", "common", "rare", "epic", "legendary"].includes(rarityRaw) ? rarityRaw : "rare";
  const titleText = String(fd.get("title_text") || "").trim().slice(0, 60);
  let imageUrl = String(fd.get("image_url") || "").trim().slice(0, 500);
  let imageKey = "";

  const file = fd.get("file");
  const itemId = "pack_" + id().slice(0, 12);

  if (file && typeof file !== "string" && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) {
      fail("Fayl hajmi 2 MB dan oshmasligi kerak (WebP/PNG tavsiya etiladi)", 400);
    }
    const mime = file.type || "image/png";
    const ext =
      mime.includes("webp") ? "webp" :
      mime.includes("gif") ? "gif" :
      mime.includes("svg") ? "svg" :
      mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
    imageKey = `cosmetics/${itemId}.${ext}`;
    await c.env.FILES.put(imageKey, await file.arrayBuffer(), {
      httpMetadata: { contentType: mime },
    });
    imageUrl = `/api/v2/media/${imageKey}`;
  }

  await stmt(
    c.env.DB,
    `INSERT INTO shop_items_custom
      (id, slot, name, description, price, rarity, image_key, image_url, title_text, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    itemId,
    slot,
    name,
    description,
    price,
    rarity,
    imageKey,
    imageUrl,
    titleText,
    now(),
  ).run();

  return c.json({ ok: true, id: itemId, image_url: imageUrl });
});

owner.delete("/shop-items/:id", async (c) => {
  const itemId = c.req.param("id");
  const row = await first(c.env.DB, "SELECT image_key FROM shop_items_custom WHERE id=?", itemId);
  if (!row) fail("Pack topilmadi", 404);
  if (row.image_key) {
    try { await c.env.FILES.delete(row.image_key); } catch {}
  }
  await stmt(c.env.DB, "DELETE FROM shop_items_custom WHERE id=?", itemId).run();
  return c.json({ ok: true });
});
