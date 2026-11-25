import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { audit, body, fail, first, id, now, rows, settings, stmt } from "./core";

export const billingTeacher = new Hono<AppEnv>();
export const billingOwner = new Hono<AppEnv>();
export const billingWebhook = new Hono<AppEnv>();

export const PLAN_CATALOG = {
  free: {
    id: "free",
    name: "Start (Bepul)",
    price: 0,
    max_groups: 2,
    max_students: 30,
    max_questions: 60,
  },
  pro: {
    id: "pro",
    name: "Ustoz Pro",
    price: 49000,
    max_groups: 20,
    max_students: 300,
    max_questions: 1000,
  },
  center: {
    id: "center",
    name: "Ultra",
    price: 199000,
    max_groups: 200,
    max_students: 2500,
    max_questions: 5000,
  },
} as const;

type PlanId = keyof typeof PLAN_CATALOG;

export async function getEffectivePlan(db: D1Database, tenantId: string) {
  try {
    const row = await first(db, "SELECT * FROM tenant_plans WHERE tenant_id=?", tenantId);
    const ts = now();
    if (row && row.plan !== "free" && (Number(row.expires_at) === 0 || Number(row.expires_at) > ts)) {
      const p = PLAN_CATALOG[row.plan as PlanId] || PLAN_CATALOG.free;
      return { ...p, expires_at: Number(row.expires_at || 0), note: row.note || "" };
    }
  } catch {}
  return { ...PLAN_CATALOG.free, expires_at: 0, note: "" };
}

async function activateTenantPlan(
  db: D1Database,
  tenantId: string,
  plan: "free" | "pro" | "center",
  days: number,
  note = "",
) {
  const ts = now();
  if (plan === "free" || days <= 0) {
    await stmt(
      db,
      `INSERT INTO tenant_plans(tenant_id, plan, expires_at, note, updated_at)
       VALUES(?, 'free', 0, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET plan='free', expires_at=0, note=excluded.note, updated_at=excluded.updated_at`,
      tenantId,
      note,
      ts,
    ).run();
    return 0;
  }
  const existing = await first(db, "SELECT plan, expires_at FROM tenant_plans WHERE tenant_id=?", tenantId);
  const baseStart =
    existing && existing.plan === plan && Number(existing.expires_at || 0) > ts
      ? Number(existing.expires_at)
      : ts;
  const nextExp = baseStart + days * 86400;
  await stmt(
    db,
    `INSERT INTO tenant_plans(tenant_id, plan, expires_at, note, updated_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
       plan=excluded.plan,
       expires_at=excluded.expires_at,
       note=excluded.note,
       updated_at=excluded.updated_at`,
    tenantId,
    plan,
    nextExp,
    note,
    ts,
  ).run();
  return nextExp;
}

// ============================================================================
// TEACHER ROUTES (/api/v2/teacher/billing/*)
// ============================================================================
billingTeacher.get("/status", async (c) => {
  const p = c.get("principal");
  const tenantId = p.tenantId!;
  const s = await settings(c.env);
  const plan = await getEffectivePlan(c.env.DB, tenantId);

  const counts = await first(
    c.env.DB,
    `SELECT
       (SELECT COUNT(*) FROM groups WHERE tenant_id=?) groups_count,
       (SELECT COUNT(*) FROM students WHERE tenant_id=? AND status='active') students_count,
       (SELECT COUNT(*) FROM questions WHERE tenant_id=?) questions_count`,
    tenantId,
    tenantId,
    tenantId,
  );

  let orders: any[] = [];
  try {
    orders = await rows(
      c.env.DB,
      `SELECT id, plan, months, base_amount, unique_amount, status, receipt_key, tx_note, created_at, expires_at, paid_at
       FROM billing_orders WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20`,
      tenantId,
    );
  } catch {}

  return c.json({
    plan,
    plans: Object.values(PLAN_CATALOG),
    usage: {
      groups: Number(counts?.groups_count || 0),
      students: Number(counts?.students_count || 0),
      questions: Number(counts?.questions_count || 0),
    },
    card: {
      number: String(s.billing_card_number || "").trim(),
      holder: String(s.billing_card_holder || "").trim(),
    },
    orders,
  });
});

billingTeacher.post("/create-order", async (c) => {
  const p = c.get("principal");
  const tenantId = p.tenantId!;
  const d = await body(
    c,
    z.object({
      plan: z.enum(["pro", "center"]),
      months: z.number().int().min(1).max(12).default(1),
    }).strict(),
  );

  const s = await settings(c.env);
  if (!String(s.billing_card_number || "").trim()) {
    fail("To‘lov kartasi hali Owner tomonidan kiritilmagan", 400);
  }

  const ts = now();
  const baseAmount = PLAN_CATALOG[d.plan].price * d.months;

  // Find active pending unique amounts so two teachers never collide
  const activePending = await rows(
    c.env.DB,
    "SELECT unique_amount FROM billing_orders WHERE status='pending' AND expires_at > ?",
    ts,
  );
  const used = new Set(activePending.map((r: any) => Number(r.unique_amount)));

  let uniqueAmount = 0;
  for (let attempt = 0; attempt < 40; attempt++) {
    const offset = 101 + Math.floor(Math.random() * 890); // +101..+990 UZS
    const candidate = baseAmount + offset;
    if (!used.has(candidate)) {
      uniqueAmount = candidate;
      break;
    }
  }
  if (!uniqueAmount) uniqueAmount = baseAmount + 101 + (ts % 800);

  const orderId = "ord_" + id().slice(0, 12);
  const expiresAt = ts + 1800; // 30 minutes

  await stmt(
    c.env.DB,
    `INSERT INTO billing_orders
      (id, tenant_id, user_id, plan, months, base_amount, unique_amount, status, receipt_key, tx_note, created_at, expires_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', '', ?, ?, NULL)`,
    orderId,
    tenantId,
    p.userId,
    d.plan,
    d.months,
    baseAmount,
    uniqueAmount,
    ts,
    expiresAt,
  ).run();

  return c.json({
    id: orderId,
    plan: d.plan,
    months: d.months,
    base_amount: baseAmount,
    unique_amount: uniqueAmount,
    expires_at: expiresAt,
  });
});

billingTeacher.post("/upload-receipt/:orderId", async (c) => {
  const p = c.get("principal");
  const orderId = c.req.param("orderId");
  const ord = await first(
    c.env.DB,
    "SELECT * FROM billing_orders WHERE id=? AND tenant_id=?",
    orderId,
    p.tenantId!,
  );
  if (!ord) fail("Buyurtma topilmadi", 404);
  if (ord.status === "paid") fail("Bu buyurtma allaqachon tasdiqlangan", 400);

  const fd = await c.req.formData();
  const file = fd.get("file");
  const note = String(fd.get("note") || "").trim().slice(0, 200);
  if (!file || typeof file === "string" || file.size === 0) {
    fail("Chek rasmini tanlang", 400);
  }
  if (file.size > 480 * 1024) {
    fail("Rasm hajmi 480 KB dan kichik bo‘lishi kerak", 400);
  }
  const key = `receipts/${orderId}.webp`;
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/webp" },
  });
  await stmt(
    c.env.DB,
    "UPDATE billing_orders SET receipt_key=?, tx_note=? WHERE id=?",
    key,
    note,
    orderId,
  ).run();
  return c.json({ ok: true, receipt_url: "/api/v2/media/" + key });
});

// ============================================================================
// OWNER ROUTES (/api/v2/owner/billing/*)
// ============================================================================
billingOwner.get("/orders", async (c) => {
  try {
    const orders = await rows(
      c.env.DB,
      `SELECT o.*, t.name AS tenant_name, u.display_name AS teacher_name,
              tp.plan AS current_plan, tp.expires_at AS current_expires_at
       FROM billing_orders o
       JOIN tenants t ON t.id = o.tenant_id
       LEFT JOIN users u ON u.id = o.user_id
       LEFT JOIN tenant_plans tp ON tp.tenant_id = o.tenant_id
       ORDER BY CASE WHEN o.status='pending' THEN 0 ELSE 1 END, o.created_at DESC
       LIMIT 100`,
    );
    const activePlans = await rows(
      c.env.DB,
      `SELECT tp.*, t.name AS tenant_name
       FROM tenant_plans tp
       JOIN tenants t ON t.id = tp.tenant_id
       WHERE tp.plan != 'free'
       ORDER BY tp.expires_at DESC LIMIT 100`,
    );
    return c.json({ orders, active_plans: activePlans });
  } catch {
    return c.json({ orders: [], active_plans: [] });
  }
});

billingOwner.post("/orders/:id/approve", async (c) => {
  const orderId = c.req.param("id");
  const ord = await first(c.env.DB, "SELECT * FROM billing_orders WHERE id=?", orderId);
  if (!ord) fail("Buyurtma topilmadi", 404);
  if (ord.status === "paid") return c.json({ ok: true, already_paid: true });

  const ts = now();
  const days = Number(ord.months || 1) * 30;
  const nextExp = await activateTenantPlan(c.env.DB, ord.tenant_id, ord.plan, days, "Owner tasdiqlagan");
  await stmt(
    c.env.DB,
    "UPDATE billing_orders SET status='paid', paid_at=? WHERE id=?",
    ts,
    orderId,
  ).run();
  await audit(c, "billing_approve", "billing_order", orderId, `Tarif ${ord.plan} (${days} kun) yoqildi`);
  return c.json({ ok: true, expires_at: nextExp });
});

billingOwner.post("/orders/:id/reject", async (c) => {
  const orderId = c.req.param("id");
  await stmt(
    c.env.DB,
    "UPDATE billing_orders SET status='rejected' WHERE id=? AND status='pending'",
    orderId,
  ).run();
  await audit(c, "billing_reject", "billing_order", orderId, "To‘lov rad etildi");
  return c.json({ ok: true });
});

billingOwner.post("/grant", async (c) => {
  const d = await body(
    c,
    z.object({
      tenant_id: z.string().min(3).max(80),
      plan: z.enum(["free", "pro", "center"]),
      days: z.number().int().min(0).max(3650),
      note: z.string().max(200).default("Owner bergan"),
    }).strict(),
  );
  const exp = await activateTenantPlan(c.env.DB, d.tenant_id, d.plan, d.days, d.note);
  await audit(c, "billing_grant", "tenant", d.tenant_id, `${d.plan} (${d.days} kun): ${d.note}`);
  return c.json({ ok: true, expires_at: exp });
});

// ============================================================================
// AUTO-WEBHOOK (/api/v2/billing/auto-webhook) — called by Telegram Userbot / SMS
// ============================================================================
billingWebhook.post("/auto-webhook", async (c) => {
  const secret = String(c.env.BILLING_WEBHOOK_SECRET || "").trim();
  const got = String(c.req.header("x-webhook-secret") || "").trim();
  if (!secret || got !== secret) {
    fail("Webhook kaliti noto‘g‘ri", 403);
  }
  const d = await body(
    c,
    z.object({
      amount: z.number().int().min(1000).max(100000000),
      source: z.string().max(80).default("telegram_bot"),
      raw_text: z.string().max(500).default(""),
    }).strict(),
  );

  const ts = now();
  const ord = await first(
    c.env.DB,
    `SELECT * FROM billing_orders
     WHERE status='pending' AND unique_amount=? AND expires_at >= ?
     ORDER BY created_at DESC LIMIT 1`,
    d.amount,
    ts,
  );
  if (!ord) {
    return c.json({ ok: false, matched: false, message: "Mos keluvchi faol buyurtma topilmadi" });
  }

  const days = Number(ord.months || 1) * 30;
  const nextExp = await activateTenantPlan(
    c.env.DB,
    ord.tenant_id,
    ord.plan,
    days,
    `Avto-tasdiq (${d.source})`,
  );
  await stmt(
    c.env.DB,
    "UPDATE billing_orders SET status='paid', paid_at=?, tx_note=? WHERE id=?",
    ts,
    d.raw_text.slice(0, 180) || d.source,
    ord.id,
  ).run();

  return c.json({
    ok: true,
    matched: true,
    order_id: ord.id,
    tenant_id: ord.tenant_id,
    plan: ord.plan,
    expires_at: nextExp,
  });
});

// Teacher redeems a Product Key from Owner (/api/v2/teacher/billing/redeem-key)
billingTeacher.post("/redeem-key", async (c) => {
  const p = c.get("principal");
  const d = await body(
    c,
    z.object({ code: z.string().trim().min(4).max(40) }).strict(),
  );
  const cleanCode = d.code.toUpperCase().replace(/\s+/g, "");
  const keyRow = await first(
    c.env.DB,
    "SELECT * FROM billing_keys WHERE UPPER(code)=?",
    cleanCode,
  );
  if (!keyRow) fail("Bunday Product Key topilmadi", 404);
  if (Number(keyRow.used_count || 0) >= Number(keyRow.max_uses || 1)) {
    fail("Bu Product Key limiti tugagan", 400);
  }

  const nextExp = await activateTenantPlan(
    c.env.DB,
    p.tenantId!,
    keyRow.plan,
    Number(keyRow.days || 30),
    `Kalit: ${keyRow.code}`,
  );
  await stmt(
    c.env.DB,
    "UPDATE billing_keys SET used_count = used_count + 1 WHERE id=?",
    keyRow.id,
  ).run();
  await audit(c, "billing_redeem_key", "billing_key", keyRow.id, `${keyRow.code} -> ${keyRow.plan} (${keyRow.days} kun)`);
  return c.json({ ok: true, plan: keyRow.plan, days: keyRow.days, expires_at: nextExp });
});

// Owner creates, lists, and deletes Product Keys (/api/v2/owner/billing/keys)
billingOwner.get("/keys", async (c) => {
  try {
    const items = await rows(
      c.env.DB,
      "SELECT * FROM billing_keys ORDER BY created_at DESC LIMIT 100",
    );
    return c.json({ items });
  } catch {
    return c.json({ items: [] });
  }
});

billingOwner.post("/keys", async (c) => {
  const d = await body(
    c,
    z.object({
      plan: z.enum(["pro", "center"]),
      days: z.number().int().min(1).max(3650).default(30),
      max_uses: z.number().int().min(1).max(500).default(1),
      note: z.string().max(120).default(""),
    }).strict(),
  );
  const prefix = d.plan === "center" ? "CTR" : "PRO";
  const rand = id().replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
  const code = `${prefix}-${d.days}D-${rand}`;
  const keyId = "key_" + id().slice(0, 12);
  await stmt(
    c.env.DB,
    `INSERT INTO billing_keys (id, code, plan, days, max_uses, used_count, note, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    keyId,
    code,
    d.plan,
    d.days,
    d.max_uses,
    d.note,
    now(),
  ).run();
  return c.json({ ok: true, id: keyId, code });
});

billingOwner.delete("/keys/:id", async (c) => {
  await stmt(c.env.DB, "DELETE FROM billing_keys WHERE id=?", c.req.param("id")).run();
  return c.json({ ok: true });
});
