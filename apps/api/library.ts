import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "./types";
import { body, fail, first, id, now, rows, stmt } from "./core";

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

  return c.json({
    book: {
      ...book,
      views_count: Number(book.views_count || 0) + 1,
      published: !!book.published,
    },
    chapters,
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
