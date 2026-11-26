import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { body, fail, first, id, now, rate, rows, stmt } from "./core";
import { authenticate } from "./auth";
import { getEffectivePlan } from "./billing";

export const libraryPublic = new Hono<AppEnv>();
export const libraryTeacher = new Hono<AppEnv>();

const bookSchema = z.object({
  title: z.string().trim().min(2).max(160),
  subject: z.string().trim().min(2).max(100),
  summary: z.string().trim().max(1000).default(""),
  tags: z.string().trim().max(300).default(""),
  author_name: z.string().trim().max(120).default(""),
  linked_card_slug: z.string().trim().max(40).default(""),
  published: z.boolean().default(true),
});

const chapterSchema = z.object({
  title: z.string().trim().min(2).max(180),
  summary: z.string().trim().max(600).default(""),
  content: z.string().trim().min(5).max(80000),
  position: z.number().int().min(1).max(500).optional(),
});

function makeSnippet(text: string, tokens: string[]): string {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const lower = clean.toLowerCase();
  let bestIdx = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx === -1) return clean.slice(0, 180) + (clean.length > 180 ? "…" : "");
  const start = Math.max(0, bestIdx - 60);
  const end = Math.min(clean.length, bestIdx + 130);
  return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
}

// Ochiq katalog + aqlli ko'p maydonli qidiruv (nom + tavsif + fan + teg + boblar matni)
libraryPublic.get("/", async (c) => {
  const qRaw = (c.req.query("q") || "").trim().slice(0, 140);
  const subject = (c.req.query("subject") || "").trim();
  const tokens = qRaw
    .toLowerCase()
    .split(/[\s,.;:!?()\[\]]+/)
    .filter((w) => w.length >= 2)
    .slice(0, 6);

  const books = await rows(
    c.env.DB,
    `SELECT b.* FROM library_books b
     JOIN tenants t ON t.id=b.tenant_id
     WHERE b.published=1 AND b.moderation_status='approved' AND t.status='active'
     ORDER BY b.updated_at DESC LIMIT 200`,
  );

  // Fanlar kesimidagi sonlar
  const subjMap = new Map<string, number>();
  for (const b of books) {
    const s = String(b.subject || "Boshqa");
    subjMap.set(s, (subjMap.get(s) || 0) + 1);
  }
  const subjects = Array.from(subjMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const bookIds = books.map((b) => b.id);
  const chByBook = new Map<string, any[]>();
  if (bookIds.length) {
    const allCh = await rows(
      c.env.DB,
      `SELECT id, book_id, position, title, summary, content
       FROM library_chapters
       WHERE book_id IN (SELECT value FROM json_each(?))
       ORDER BY position ASC`,
      JSON.stringify(bookIds),
    );
    for (const ch of allCh) {
      if (!chByBook.has(ch.book_id)) chByBook.set(ch.book_id, []);
      chByBook.get(ch.book_id)!.push(ch);
    }
  }

  const scored: any[] = [];
  for (const b of books) {
    if (subject && b.subject !== subject) continue;
    const chapters = chByBook.get(b.id) || [];
    const titleL = String(b.title || "").toLowerCase();
    const subjL = String(b.subject || "").toLowerCase();
    const sumL = String(b.summary || "").toLowerCase();
    const tagsL = String(b.tags || "").toLowerCase();

    if (!tokens.length) {
      scored.push({
        id: b.id,
        title: b.title,
        subject: b.subject,
        summary: b.summary,
        tags: b.tags,
        author_name: b.author_name,
        linked_card_slug: b.linked_card_slug,
        views_count: Number(b.views_count || 0),
        chapter_count: chapters.length,
        updated_at: Number(b.updated_at),
        match_snippet: b.summary || (chapters[0]?.summary || makeSnippet(chapters[0]?.content || "", [])),
        match_chapter_id: null,
        match_chapter_title: null,
        _score: 0,
      });
      continue;
    }

    const combinedBook = titleL + " " + subjL + " " + sumL + " " + tagsL;
    const combinedAll =
      combinedBook +
      " " +
      chapters
        .map((ch) => `${ch.title || ""} ${ch.summary || ""} ${ch.content || ""}`.toLowerCase())
        .join(" ");

    if (!tokens.every((t) => combinedAll.includes(t))) continue;

    let score = 0;
    for (const t of tokens) {
      if (titleL.includes(t)) score += 12;
      if (tagsL.includes(t)) score += 10;
      if (sumL.includes(t)) score += 7;
      if (subjL.includes(t)) score += 6;
    }

    let bestCh: any = null;
    let bestChScore = -1;
    for (const ch of chapters) {
      const cTitle = String(ch.title || "").toLowerCase();
      const cSum = String(ch.summary || "").toLowerCase();
      const cBody = String(ch.content || "").toLowerCase();
      let cs = 0;
      for (const t of tokens) {
        if (cTitle.includes(t)) cs += 6;
        if (cSum.includes(t)) cs += 4;
        if (cBody.includes(t)) cs += 2;
      }
      if (cs > bestChScore) {
        bestChScore = cs;
        bestCh = ch;
      }
    }
    if (bestChScore > 0) score += bestChScore;

    const snippetSource =
      bestCh && bestChScore > 0
        ? (bestCh.summary && tokens.some((t) => String(bestCh.summary).toLowerCase().includes(t))
            ? bestCh.summary
            : bestCh.content)
        : b.summary || (chapters[0]?.content || "");

    scored.push({
      id: b.id,
      title: b.title,
      subject: b.subject,
      summary: b.summary,
      tags: b.tags,
      author_name: b.author_name,
      linked_card_slug: b.linked_card_slug,
      views_count: Number(b.views_count || 0),
      chapter_count: chapters.length,
      updated_at: Number(b.updated_at),
      match_snippet: makeSnippet(snippetSource, tokens),
      match_chapter_id: bestCh && bestChScore > 0 ? bestCh.id : null,
      match_chapter_title: bestCh && bestChScore > 0 ? bestCh.title : null,
      _score: score,
    });
  }

  if (tokens.length) {
    scored.sort((a, b) => b._score - a._score || b.updated_at - a.updated_at);
  }

  return c.json({
    items: scored.map(({ _score, ...rest }) => rest),
    subjects,
    total: scored.length,
  });
});

// Kitobni to'liq boblari bilan o'qish

// Yengil WebP kitob muqovasini R2 dan uzatish (1 hafta kesh)
libraryPublic.get("/cover/:id", async (c) => {
  const b: any = await first(
    c.env.DB,
    "SELECT cover_key FROM library_books WHERE id=?",
    c.req.param("id"),
  );
  if (!b?.cover_key) fail("Muqova topilmadi", 404);
  const obj = await c.env.FILES.get(String(b.cover_key));
  if (!obj) fail("Muqova fayli topilmadi", 404);
  c.header("Content-Type", obj.httpMetadata?.contentType || "image/webp");
  c.header("Cache-Control", "public, max-age=604800");
  return c.body(obj.body as ReadableStream, 200);
});

// Pullik kitob uchun P2P buyurtma yaratish (unikal so'm qo'shimchasi bilan)
libraryPublic.post("/:id/buy", async (c) => {
  const principal = await authenticate(c);
  await rate(c, "book-buy", 30, 60, principal.userId);
  const book: any = await first(
    c.env.DB,
    "SELECT id, title, price_uzs FROM library_books WHERE id=? AND published=1 AND moderation_status='approved'",
    c.req.param("id"),
  );
  if (!book) fail("Kitob topilmadi", 404);
  const price = Number(book.price_uzs || 0);
  if (price <= 0) fail("Bu kitob bepul, sotib olish shart emas", 400);

  const d = await body(
    c,
    z.object({
      buyer_name: z.string().trim().min(2).max(120),
      buyer_phone: z.string().trim().max(40).optional().default(""),
      promo_code: z.string().trim().max(40).optional().default(""),
    }).strict(),
  );

  const ts = now();
  let finalPrice = price;
  let promoApplied = "";
  const rawPromo = String(d.promo_code || "").trim().toUpperCase();
  if (rawPromo) {
    const pr: any = await first(
      c.env.DB,
      "SELECT * FROM content_promo_codes WHERE UPPER(code)=? AND status='active' LIMIT 1",
      rawPromo,
    );
    if (!pr) fail("Promokod topilmadi yoki faol emas", 400);
    if (pr.expires_at > 0 && Number(pr.expires_at) < ts) fail("Promokod muddati tugagan", 400);
    if (Number(pr.used_count) >= Number(pr.max_uses)) fail("Promokod limiti tugagan", 400);
    if (pr.target_type === "test") fail("Bu promokod faqat testlar uchun", 400);
    if (pr.target_id && pr.target_id !== book.id) fail("Bu promokod boshqa kitob uchun belgilangan", 400);
    if (Number(pr.discount_percent) >= 100) {
      finalPrice = 0;
    } else if (Number(pr.discount_percent) > 0) {
      finalPrice = Math.max(0, Math.round((price * (100 - Number(pr.discount_percent))) / 100));
    } else if (Number(pr.discount_uzs) > 0) {
      finalPrice = Math.max(0, price - Number(pr.discount_uzs));
    }
    promoApplied = String(pr.code);
    await stmt(c.env.DB, "UPDATE content_promo_codes SET used_count=used_count+1 WHERE id=?", pr.id).run();
  }

  if (finalPrice <= 0) {
    const oid = id();
    const unlockToken = id() + id();
    await stmt(
      c.env.DB,
      `INSERT INTO library_book_orders(id, book_id, user_id, buyer_name, buyer_phone, amount, unique_amount, status, unlock_token, tx_note, created_at, expires_at, paid_at)
       VALUES(?,?,?,?,?,0,0,'paid',?,?,?, ?, ?)`,
      oid,
      book.id,
      principal.userId,
      d.buyer_name,
      d.buyer_phone,
      unlockToken,
      "Promokod: " + promoApplied,
      ts,
      ts,
      ts,
    ).run();
    return c.json({
      order_id: oid,
      book_id: book.id,
      book_title: book.title,
      paid: true,
      free_unlock: true,
      promo_code: promoApplied,
      unlock_token: unlockToken,
      amount: 0,
      unique_amount: 0,
    }, 201);
  }

  let uniqueAmount = finalPrice + 101 + Math.floor(Math.random() * 880);
  for (let i = 0; i < 8; i++) {
    const clash1 = await first(c.env.DB, "SELECT id FROM billing_orders WHERE status='pending' AND unique_amount=? AND expires_at>=?", uniqueAmount, ts);
    const clash2 = await first(c.env.DB, "SELECT id FROM library_book_orders WHERE status='pending' AND unique_amount=? AND expires_at>=?", uniqueAmount, ts);
    if (!clash1 && !clash2) break;
    uniqueAmount = finalPrice + 101 + Math.floor(Math.random() * 880);
  }

  const oid = id();
  const unlockToken = id() + id();
  const expiresAt = ts + 30 * 60;
  await stmt(
    c.env.DB,
    `INSERT INTO library_book_orders(id, book_id, user_id, buyer_name, buyer_phone, amount, unique_amount, status, unlock_token, tx_note, created_at, expires_at)
     VALUES(?,?,?,?,?,?,?,'pending',?,'',?,?)`,
    oid,
    book.id,
    principal.userId,
    d.buyer_name,
    d.buyer_phone,
    price,
    uniqueAmount,
    unlockToken,
    ts,
    expiresAt,
  ).run();

  const cfgRow: any = await first(c.env.DB, "SELECT value_json FROM system_settings WHERE key='billing_card'");
  let card = { card_number: "", card_holder: "", bank_name: "" };
  try {
    if (cfgRow?.value_json) card = { ...card, ...JSON.parse(cfgRow.value_json) };
  } catch {}

  return c.json({
    order_id: oid,
    book_id: book.id,
    book_title: book.title,
    amount: finalPrice,
    original_amount: price,
    promo_code: promoApplied,
    unique_amount: uniqueAmount,
    unlock_token: unlockToken,
    expires_at: expiresAt,
    card_number: card.card_number,
    card_holder: card.card_holder,
    bank_name: card.bank_name,
  }, 201);
});

// Buyurtma holatini tekshirish (avto-ochilish uchun)
libraryPublic.get("/order/:orderId/status", async (c) => {
  const o: any = await first(
    c.env.DB,
    "SELECT id, book_id, status, unlock_token, paid_at FROM library_book_orders WHERE id=?",
    c.req.param("orderId"),
  );
  if (!o) fail("Buyurtma topilmadi", 404);
  return c.json({
    order_id: o.id,
    book_id: o.book_id,
    status: o.status,
    paid: o.status === "paid",
    unlock_token: o.status === "paid" ? o.unlock_token : "",
  });
});

libraryPublic.get("/:id", async (c) => {
  const book = await first(
    c.env.DB,
    `SELECT b.* FROM library_books b
     JOIN tenants t ON t.id=b.tenant_id
     WHERE b.id=? AND b.published=1 AND b.moderation_status='approved' AND t.status='active'`,
    c.req.param("id"),
  );
  if (!book) fail("Kitob topilmadi", 404);

  await stmt(
    c.env.DB,
    "UPDATE library_books SET views_count=views_count+1 WHERE id=?",
    book.id,
  ).run();

  const chapters = await rows(
    c.env.DB,
    "SELECT id, position, title, summary, content, updated_at FROM library_chapters WHERE book_id=? ORDER BY position ASC, created_at ASC",
    book.id,
  );
  const related = await rows(
    c.env.DB,
    `SELECT id, title, subject, summary, views_count FROM library_books
     WHERE published=1 AND moderation_status='approved' AND subject=? AND id!=?
     ORDER BY views_count DESC, updated_at DESC LIMIT 4`,
    book.subject,
    book.id,
  );

  let principal: any = null;
  try {
    principal = await authenticate(c);
  } catch {}
  const priceUzs = Number(book.price_uzs || 0);
  if (!principal) {
    return c.json({
      book: {
        ...book,
        price_uzs: priceUzs,
        auth_required: true,
        unlocked: false,
        views_count: Number(book.views_count || 0) + 1,
        published: !!book.published,
      },
      chapters: chapters.map((ch: any) => ({
        id: ch.id,
        position: ch.position,
        title: ch.title,
        summary: ch.summary || "",
        content: "",
        updated_at: ch.updated_at,
        locked: true,
      })),
      related,
    });
  }

  let unlocked = priceUzs <= 0;
  let unlockedVia = priceUzs <= 0 ? "free" : "";
  if (!unlocked) {
    if (principal.scope === "owner") {
      unlocked = true;
      unlockedVia = "subscription";
    } else if (principal.tenantId) {
      const plan = await getEffectivePlan(c.env.DB, principal.tenantId);
      if (plan.id !== "free") {
        unlocked = true;
        unlockedVia = "subscription";
      }
    }
  }
  if (!unlocked) {
    const tok = String(c.req.query("token") || "").trim();
    const paidOrd = await first(
      c.env.DB,
      `SELECT id FROM library_book_orders
       WHERE book_id=? AND status='paid' AND (user_id=? OR (? != '' AND unlock_token=?))
       LIMIT 1`,
      book.id,
      principal.userId,
      tok,
      tok,
    );
    if (paidOrd) {
      unlocked = true;
      unlockedVia = "purchase";
    }
  }
  const safeChapters = chapters.map((ch: any, idx: number) => {
    if (unlocked || idx === 0) return { ...ch, locked: false };
    return {
      id: ch.id,
      position: ch.position,
      title: ch.title,
      summary: ch.summary || "",
      content: "",
      updated_at: ch.updated_at,
      locked: true,
    };
  });
  return c.json({
    book: {
      ...book,
      price_uzs: priceUzs,
      auth_required: false,
      unlocked,
      unlocked_via: unlockedVia,
      views_count: Number(book.views_count || 0) + 1,
      published: !!book.published,
    },
    chapters: safeChapters,
    related,
  });
});

// --- O'QITUVCHI KUTUBXONA BOSHQARUVI (/api/v2/teacher/library) ---
libraryTeacher.get("/", async (c) => {
  const tid = c.get("principal").tenantId!;
  const items = await rows(
    c.env.DB,
    `SELECT b.*, (SELECT COUNT(*) FROM library_chapters ch WHERE ch.book_id=b.id) chapter_count
     FROM library_books b
     WHERE b.tenant_id=?
     ORDER BY b.updated_at DESC`,
    tid,
  );
  return c.json({
    items: items.map((b) => ({
      ...b,
      published: !!b.published,
      chapter_count: Number(b.chapter_count || 0),
      views_count: Number(b.views_count || 0),
    })),
  });
});

libraryTeacher.post("/", async (c) => {
  const p = c.get("principal");
  const tid = p.tenantId!;
  const d = await body(c, bookSchema);
  const bid = id();
  const t = now();
  const userRow = await first(c.env.DB, "SELECT name FROM users WHERE id=?", p.userId);
  const author = d.author_name || String(userRow?.name || "");
  await stmt(
    c.env.DB,
    "INSERT INTO library_books(id,tenant_id,title,subject,summary,tags,author_name,linked_card_slug,published,moderation_status,views_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)",
    bid,
    tid,
    d.title,
    d.subject,
    d.summary,
    d.tags,
    author,
    d.linked_card_slug,
    d.published ? 1 : 0,
    p.scope === "owner" ? "approved" : d.published ? "pending" : "draft",
    t,
    t,
  ).run();
  return c.json({ id: bid }, 201);
});

libraryTeacher.get("/:id", async (c) => {
  const tid = c.get("principal").tenantId!;
  const book = await first(
    c.env.DB,
    "SELECT * FROM library_books WHERE tenant_id=? AND id=?",
    tid,
    c.req.param("id"),
  );
  if (!book) fail("Kitob topilmadi", 404);
  const chapters = await rows(
    c.env.DB,
    "SELECT * FROM library_chapters WHERE tenant_id=? AND book_id=? ORDER BY position ASC, created_at ASC",
    tid,
    book.id,
  );
  return c.json({ book: { ...book, published: !!book.published }, chapters });
});

libraryTeacher.put("/:id", async (c) => {
  const tid = c.get("principal").tenantId!;
  const bid = c.req.param("id");
  const exists = await first(
    c.env.DB,
    "SELECT id FROM library_books WHERE tenant_id=? AND id=?",
    tid,
    bid,
  );
  if (!exists) fail("Kitob topilmadi", 404);
  const d = await body(c, bookSchema);
  const p = c.get("principal");
  const cur = await first(c.env.DB, "SELECT moderation_status FROM library_books WHERE tenant_id=? AND id=?", tid, bid);
  const nextMod = p.scope === "owner"
    ? "approved"
    : !d.published
      ? "draft"
      : cur?.moderation_status === "approved"
        ? "approved"
        : "pending";
  await stmt(
    c.env.DB,
    "UPDATE library_books SET title=?,subject=?,summary=?,tags=?,author_name=?,linked_card_slug=?,published=?,moderation_status=?,updated_at=? WHERE tenant_id=? AND id=?",
    d.title,
    d.subject,
    d.summary,
    d.tags,
    d.author_name,
    d.linked_card_slug,
    d.published ? 1 : 0,
    nextMod,
    now(),
    tid,
    bid,
  ).run();
  return c.json({ ok: true });
});

libraryTeacher.delete("/:id", async (c) => {
  const tid = c.get("principal").tenantId!;
  const bid = c.req.param("id");
  const cur = await first(c.env.DB, "SELECT pdf_key FROM library_books WHERE tenant_id=? AND id=?", tid, bid);
  if (cur?.pdf_key && String(cur.pdf_key).startsWith(`libpdf/${tid}/`)) {
    try { await c.env.FILES.delete(cur.pdf_key); } catch {}
  }
  await c.env.DB.batch([
    stmt(c.env.DB, "DELETE FROM library_chapters WHERE tenant_id=? AND book_id=?", tid, bid),
    stmt(c.env.DB, "DELETE FROM library_books WHERE tenant_id=? AND id=?", tid, bid),
  ]);
  return c.json({ ok: true });
});

libraryTeacher.post("/:id/chapters", async (c) => {
  const tid = c.get("principal").tenantId!;
  const bid = c.req.param("id");
  const exists = await first(
    c.env.DB,
    "SELECT id FROM library_books WHERE tenant_id=? AND id=?",
    tid,
    bid,
  );
  if (!exists) fail("Kitob topilmadi", 404);
  const d = await body(c, chapterSchema);
  const maxPos = await first(
    c.env.DB,
    "SELECT COALESCE(MAX(position), 0) m FROM library_chapters WHERE book_id=?",
    bid,
  );
  const pos = d.position ?? Number(maxPos?.m || 0) + 1;
  const cid = id();
  const t = now();
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      "INSERT INTO library_chapters(id,tenant_id,book_id,position,title,summary,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      cid,
      tid,
      bid,
      pos,
      d.title,
      d.summary,
      d.content,
      t,
      t,
    ),
    stmt(c.env.DB, "UPDATE library_books SET updated_at=? WHERE id=?", t, bid),
  ]);
  return c.json({ id: cid }, 201);
});

libraryTeacher.put("/:id/chapters/:cid", async (c) => {
  const tid = c.get("principal").tenantId!;
  const bid = c.req.param("id");
  const cid = c.req.param("cid");
  const d = await body(c, chapterSchema);
  const t = now();
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE library_chapters SET title=?,summary=?,content=?,position=COALESCE(?,position),updated_at=? WHERE tenant_id=? AND book_id=? AND id=?",
      d.title,
      d.summary,
      d.content,
      d.position ?? null,
      t,
      tid,
      bid,
      cid,
    ),
    stmt(c.env.DB, "UPDATE library_books SET updated_at=? WHERE tenant_id=? AND id=?", t, tid, bid),
  ]);
  return c.json({ ok: true });
});

libraryTeacher.delete("/:id/chapters/:cid", async (c) => {
  const tid = c.get("principal").tenantId!;
  const bid = c.req.param("id");
  const cid = c.req.param("cid");
  await c.env.DB.batch([
    stmt(c.env.DB, "DELETE FROM library_chapters WHERE tenant_id=? AND book_id=? AND id=?", tid, bid, cid),
    stmt(c.env.DB, "UPDATE library_books SET updated_at=? WHERE tenant_id=? AND id=?", now(), tid, bid),
  ]);
  return c.json({ ok: true });
});


libraryTeacher.post("/copy/:bookId", async (c) => {
  const tid = c.get("principal").tenantId!;
  const srcId = c.req.param("bookId");
  const book = await first(
    c.env.DB,
    "SELECT * FROM library_books WHERE id=? AND published=1 AND moderation_status='approved'",
    srcId,
  );
  if (!book) fail("Kitob topilmadi", 404);

  const chapters = await rows(
    c.env.DB,
    "SELECT position, title, summary, content FROM library_chapters WHERE book_id=? ORDER BY position ASC",
    srcId,
  );

  const newBookId = id();
  const ts = now();
  const batches = [
    stmt(
      c.env.DB,
      "INSERT INTO library_books(id,tenant_id,title,subject,summary,tags,author_name,linked_card_slug,published,moderation_status,views_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,'pending',0,?,?)",
      newBookId,
      tid,
      (String(book.title) + " (nusxa)").slice(0, 160),
      book.subject,
      book.summary || "",
      book.tags || "",
      book.author_name || "",
      "",
      ts,
      ts,
    ),
  ];

  for (const ch of chapters) {
    batches.push(
      stmt(
        c.env.DB,
        "INSERT INTO library_chapters(id,tenant_id,book_id,position,title,summary,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        id(),
        tid,
        newBookId,
        ch.position,
        ch.title,
        ch.summary || "",
        ch.content,
        ts,
        ts,
      ),
    );
  }

  for (let i = 0; i < batches.length; i += 50) {
    await c.env.DB.batch(batches.slice(i, i + 50));
  }

  return c.json({ ok: true, id: newBookId, chapters: chapters.length }, 201);
});


const importDocxSchema = z.object({
  title: z.string().trim().min(2).max(160),
  subject: z.string().trim().min(2).max(80),
  summary: z.string().trim().max(1000).optional().default(""),
  tags: z.string().trim().max(240).optional().default(""),
  author_name: z.string().trim().max(120).optional().default(""),
  linked_card_slug: z.string().trim().max(80).optional().default(""),
  published: z.boolean().optional().default(true),
  chapters: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        summary: z.string().trim().max(500).optional().default(""),
        content: z.string().trim().min(1).max(60000),
      }),
    )
    .min(1)
    .max(80),
});

libraryTeacher.post("/import-docx", async (c) => {
  const tid = c.get("principal").tenantId!;
  const d = await body(c, importDocxSchema);
  const bid = id();
  const ts = now();
  const modStatus = d.published ? "pending" : "pending";
  const batches = [
    stmt(
      c.env.DB,
      "INSERT INTO library_books(id,tenant_id,title,subject,summary,tags,author_name,linked_card_slug,published,moderation_status,views_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,0,?,?)",
      bid,
      tid,
      d.title,
      d.subject,
      d.summary,
      d.tags,
      d.author_name,
      d.linked_card_slug,
      d.published ? 1 : 0,
      modStatus,
      ts,
      ts,
    ),
  ];
  d.chapters.forEach((ch, idx) => {
    batches.push(
      stmt(
        c.env.DB,
        "INSERT INTO library_chapters(id,tenant_id,book_id,position,title,summary,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        id(),
        tid,
        bid,
        idx + 1,
        ch.title,
        ch.summary || "",
        ch.content,
        ts,
        ts,
      ),
    );
  });
  for (let i = 0; i < batches.length; i += 50) {
    await c.env.DB.batch(batches.slice(i, i + 50));
  }
  return c.json({ ok: true, id: bid, chapters: d.chapters.length }, 201);
});

libraryTeacher.post("/import-pdf", async (c) => {
  const tid = c.get("principal").tenantId!;
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") fail("PDF fayl tanlanmadi", 400);
  const f = file as File;
  const maxBytes = 15 * 1024 * 1024; // 15 MB
  if (f.size <= 0) fail("Bo‘sh PDF fayl yuklab bo‘lmaydi", 400);
  if (f.size > maxBytes) fail("PDF fayl hajmi 15 MB dan oshmasligi kerak", 413);
  if (!/\.pdf$/i.test(f.name || "") && f.type !== "application/pdf") {
    fail("Faqat .pdf formatdagi fayllarni yuklash mumkin", 400);
  }

  const title = String(form?.get("title") || f.name.replace(/\.pdf$/i, "")).trim().slice(0, 160);
  const subject = String(form?.get("subject") || "Umumiy").trim().slice(0, 80);
  const summary = String(form?.get("summary") || "").trim().slice(0, 1000);
  const tags = String(form?.get("tags") || "").trim().slice(0, 240);
  const authorName = String(form?.get("author_name") || "").trim().slice(0, 120);
  const linkedSlug = String(form?.get("linked_card_slug") || "").trim().slice(0, 80);
  const published = String(form?.get("published") || "true") !== "false";

  if (title.length < 2) fail("Kitob nomini kiriting", 400);

  const bid = id();
  const key = `libpdf/${tid}/${bid}.pdf`;
  await c.env.FILES.put(key, await f.arrayBuffer(), {
    httpMetadata: {
      contentType: "application/pdf",
      contentDisposition: "inline",
    },
  });

  const ts = now();
  await stmt(
    c.env.DB,
    "INSERT INTO library_books(id,tenant_id,title,subject,summary,tags,author_name,linked_card_slug,published,moderation_status,pdf_key,pdf_name,pdf_size,views_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?,?,0,?,?)",
    bid,
    tid,
    title,
    subject,
    summary,
    tags,
    authorName,
    linkedSlug,
    published ? 1 : 0,
    key,
    (f.name || "kitob.pdf").slice(0, 180),
    f.size,
    ts,
    ts,
  ).run();

  return c.json({ ok: true, id: bid, pdf_key: key }, 201);
});


libraryTeacher.post("/:id/cover", async (c) => {
  const tid = c.get("principal").tenantId!;
  const bid = c.req.param("id");
  const existing = await first(c.env.DB, "SELECT id FROM library_books WHERE id=? AND tenant_id=?", bid, tid);
  if (!existing) fail("Kitob topilmadi", 404);
  const fd = await c.req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) fail("Rasm fayli tanlanmadi", 400);
  if (file.size > 350 * 1024) fail("Muqova hajmi 350 KB dan oshmasligi kerak", 400);
  const key = `library/covers/${bid}.webp`;
  await c.env.FILES.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "image/webp" },
  });
  await stmt(c.env.DB, "UPDATE library_books SET cover_key=?, updated_at=? WHERE id=?", key, now(), bid).run();
  return c.json({ ok: true, cover_key: key });
});
