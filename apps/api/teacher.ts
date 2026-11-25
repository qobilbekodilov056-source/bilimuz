import { Hono } from "hono";
import { z } from "zod";
import {
  cardSchema,
  groupSchema,
  questionSchema,
  studentSchema,
  type CardSettings,
  levels,
} from "../../packages/shared/schema";
import type { AppEnv, Ctx, Row } from "./types";
import {
  body,
  fail,
  first,
  id,
  json,
  likePattern,
  now,
  paging,
  passwordHash,
  rate,
  rows,
  scoped,
  settings,
  stmt,
  token,
} from "./core";
import { authenticate, csrf } from "./auth";
import { billingTeacher, getEffectivePlan } from "./billing";
import { notifyParentAttendance } from "./tgbot";
import { insertQuestion, questionRecord, questionView } from "./questions";
import { toCsv } from "./spreadsheet";
import { libraryTeacher } from "./library";
import { assignmentsTeacher } from "./assignments";
import { finalizeExpired, analytics, csvExport, xlsxExport } from "./exam";
import { imports, purgeTenantImportFiles } from "./imports";
export const teacher = new Hono<AppEnv>();
teacher.use("*", async (c, next) => {
  const p = await authenticate(c);
  if (p.scope !== "teacher") fail("Teacher workspace talab qilinadi", 403);
  if (!["GET", "HEAD"].includes(c.req.method)) {
    await csrf(c);
    if (p.membershipRole !== "tenant_owner")
      fail("Workspace egasi ruxsati kerak", 403);
  }
  await rate(c, "teacher", 240, 60, p.userId);
  await next();
});
teacher.route("/library", libraryTeacher);
teacher.route("/assignments", assignmentsTeacher);
teacher.get("/overview", async (c) => {
  const tid = c.get("principal").tenantId!;
  await finalizeExpired(c.env, tid);
  const stats = await first(
    c.env.DB,
    `SELECT (SELECT COUNT(*) FROM questions WHERE tenant_id=? AND archived=0) questions,
 (SELECT COUNT(*) FROM cards WHERE tenant_id=?) cards,(SELECT COUNT(*) FROM cards WHERE tenant_id=? AND status='active') active_cards,
 (SELECT COUNT(*) FROM students WHERE tenant_id=?) students,(SELECT COUNT(*) FROM groups WHERE tenant_id=?) groups,
 (SELECT COUNT(*) FROM attempts WHERE tenant_id=?) attempts,(SELECT COUNT(*) FROM attempts WHERE tenant_id=? AND status='submitted') completed,
 (SELECT COALESCE(ROUND(AVG(percentage),1),0) FROM attempts WHERE tenant_id=? AND status='submitted') average`,
    ...Array(8).fill(tid),
  );
  const recent = await rows(
    c.env.DB,
    "SELECT a.id,a.student_name,a.percentage,a.status,a.started_at,c.title card_title FROM attempts a JOIN cards c ON c.id=a.card_id AND c.tenant_id=a.tenant_id WHERE a.tenant_id=? ORDER BY a.started_at DESC LIMIT 8",
    tid,
  );
  const trend = await rows(
    c.env.DB,
    "SELECT date(started_at,'unixepoch') day,COUNT(*) count,ROUND(AVG(percentage),1) average FROM attempts WHERE tenant_id=? AND status='submitted' AND started_at>? GROUP BY day ORDER BY day",
    tid,
    now() - 30 * 86400,
  );
  return c.json({ stats, recent, trend });
});
teacher.get("/questions", async (c) => {
  const tid = c.get("principal").tenantId!,
    { limit, offset } = paging(c);
  const clauses = ["tenant_id=?", "archived=0"],
    args: unknown[] = [tid];
  for (const key of ["category", "level", "topic"])
    if (c.req.query(key)) {
      clauses.push(`${key}=?`);
      args.push(c.req.query(key));
    }
  if (c.req.query("q")) {
    clauses.push("(title LIKE ? OR topic LIKE ?)");
    args.push(likePattern(c.req.query("q")!), likePattern(c.req.query("q")!));
  }
  const where = clauses.join(" AND ");
  const items = await rows(
    c.env.DB,
    `SELECT * FROM questions WHERE ${where} ORDER BY created_at DESC,id LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset,
  );
  const total = await first(
    c.env.DB,
    `SELECT COUNT(*) count FROM questions WHERE ${where}`,
    ...args,
  );
  const categories = await rows(
    c.env.DB,
    "SELECT DISTINCT category FROM questions WHERE tenant_id=? AND archived=0 ORDER BY category",
    tid,
  );
  return c.json({
    items: items.map(questionView),
    total: total!.count,
    categories: categories.map((x) => x.category),
  });
});
teacher.post("/uploads/image", async (c) => {
  const tid = c.get("principal").tenantId!;
  await rate(c, "upload-image", 30, 300, c.get("principal").userId);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) fail("Rasm fayli tanlanmagan", 422);
  const allowed: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = allowed[file.type];
  if (!ext) fail("Faqat PNG, JPG, WebP yoki GIF rasm yuklash mumkin", 422);
  if (file.size > 3 * 1024 * 1024) fail("Rasm hajmi 3 MB dan oshmasligi kerak", 413);
  const buf = await file.arrayBuffer();
  const key = `qimg/${tid}/${id()}.${ext}`;
  await c.env.FILES.put(key, buf, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return c.json({ url: "/api/v2/media/" + key, key }, 201);
});
teacher.get("/questions/packs", async (c) => {
  const tid = c.get("principal").tenantId!;
  const statsRows = await rows(
    c.env.DB,
    "SELECT category, level, COUNT(*) count FROM questions WHERE tenant_id=? AND archived=0 GROUP BY category, level ORDER BY category",
    tid,
  );
  const topicRows = await rows(
    c.env.DB,
    "SELECT DISTINCT category, topic FROM questions WHERE tenant_id=? AND archived=0 AND topic != '' ORDER BY topic",
    tid,
  );
  const byCat = new Map<string, { category: string; total: number; easy: number; medium: number; hard: number; expert: number; topics: string[] }>();
  const all = { total: 0, easy: 0, medium: 0, hard: 0, expert: 0, topics: [] as string[] };
  for (const r of statsRows) {
    const cat = String(r.category || "");
    if (!byCat.has(cat))
      byCat.set(cat, { category: cat, total: 0, easy: 0, medium: 0, hard: 0, expert: 0, topics: [] });
    const entry = byCat.get(cat)!;
    const n = Number(r.count || 0);
    entry.total += n;
    all.total += n;
    if (r.level === "easy" || r.level === "medium" || r.level === "hard" || r.level === "expert") {
      (entry as any)[r.level] += n;
      (all as any)[r.level] += n;
    }
  }
  const allTopics = new Set<string>();
  for (const r of topicRows) {
    const cat = String(r.category || ""), topic = String(r.topic || "");
    if (topic) {
      allTopics.add(topic);
      byCat.get(cat)?.topics.push(topic);
    }
  }
  all.topics = Array.from(allTopics);
  return c.json({ packs: Array.from(byCat.values()), all });
});
teacher.post("/questions/bulk", async (c) => {
  const tid = c.get("principal").tenantId!;
  const d = await body(
    c,
    z.object({
      ids: z.array(z.string().max(80)).min(1).max(150),
      action: z.enum(["archive", "category", "submit_store"]),
      category: z.string().trim().max(100).optional(),
      attribution: z.string().max(120).optional().default(""),
    }),
  );
  const uniq = Array.from(new Set(d.ids));
  const found = await rows(
    c.env.DB,
    "SELECT * FROM questions WHERE tenant_id=? AND archived=0 AND id IN (SELECT value FROM json_each(?))",
    tid,
    json(uniq),
  );
  if (!found.length) fail("Tanlangan savollar topilmadi", 404);
  const t = now();
  if (d.action === "archive") {
    await stmt(
      c.env.DB,
      "UPDATE questions SET archived=1,updated_at=? WHERE tenant_id=? AND id IN (SELECT value FROM json_each(?))",
      t,
      tid,
      json(found.map((q) => q.id)),
    ).run();
    return c.json({ ok: true, count: found.length });
  }
  if (d.action === "category") {
    if (!d.category || d.category.length < 2) fail("Yangi pack nomini kiriting", 422);
    await c.env.DB.batch(
      found.map((q) => {
        const parsed = JSON.parse(q.content_json);
        parsed.category = d.category;
        return stmt(
          c.env.DB,
          "UPDATE questions SET category=?,content_json=?,updated_at=? WHERE tenant_id=? AND id=?",
          d.category,
          json(parsed),
          t,
          tid,
          q.id,
        );
      }),
    );
    return c.json({ ok: true, count: found.length });
  }
  let submitted = 0;
  for (const q of found) {
    const res = await stmt(
      c.env.DB,
      "INSERT OR IGNORE INTO store_submissions(id,tenant_id,question_id,source_version,content_json,fingerprint,consent_at,license,attribution) VALUES(?,?,?,?,?,?,?,?,?)",
      id(),
      tid,
      q.id,
      q.content_version,
      q.content_json,
      q.fingerprint,
      t,
      "CC-BY-4.0",
      d.attribution || "",
    ).run();
    if (res.meta?.changes) submitted++;
  }
  return c.json({ ok: true, submitted, skipped: found.length - submitted });
});
teacher.get("/questions/:id", async (c) =>
  c.json({
    question: questionView(await scoped(c, "questions", c.req.param("id"))),
  }),
);
teacher.post("/questions", async (c) => {
  const tid = c.get("principal").tenantId!;
  const plan = await getEffectivePlan(c.env.DB, tid);
  const qCnt = await first(c.env.DB, "SELECT COUNT(*) n FROM questions WHERE tenant_id=?", tid);
  if (Number(qCnt?.n || 0) >= plan.max_questions) {
    fail(`Savollar limiti to‘ldi (${qCnt?.n}/${plan.max_questions} — ${plan.name}). Ko‘proq savol qo‘shish uchun «Tarifim» bo‘limidan Ustoz Pro ga o‘ting.`, 403);
  }
  return c.json({ id: await insertQuestion(c, await body(c, questionSchema)) }, 201);
});
teacher.put("/questions/:id", async (c) => {
  const old = await scoped(c, "questions", c.req.param("id"));
  const q = await body(c, questionSchema),
    { content, fingerprint } = await questionRecord(q);
  const version = old.content_version + 1;
  const tid = c.get("principal").tenantId!;
  if (c.req.header("if-match") !== String(old.content_version))
    fail("Savol o‘zgargan. Yangilang va qayta saqlang.", 409);
  const r = await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE questions SET title=?,category=?,topic=?,level=?,kind=?,content_json=?,fingerprint=?,content_version=?,updated_at=? WHERE tenant_id=? AND id=? AND content_version=? RETURNING id",
      content.title,
      content.category,
      content.topic,
      content.level,
      content.kind,
      json(content),
      fingerprint,
      version,
      now(),
      tid,
      old.id,
      old.content_version,
    ),
    stmt(
      c.env.DB,
      "INSERT INTO question_versions(id,tenant_id,question_id,version,content_json,created_at) SELECT ?,tenant_id,id,content_version,content_json,? FROM questions WHERE tenant_id=? AND id=? AND content_version=? AND fingerprint=?",
      id(),
      now(),
      tid,
      old.id,
      version,
      fingerprint,
    ),
  ]);
  if (!r[0].results.length) fail("Savol o‘zgargan", 409);
  return c.json({ id: old.id, content_version: version });
});
teacher.delete("/questions/:id", async (c) => {
  await scoped(c, "questions", c.req.param("id"));
  await stmt(
    c.env.DB,
    "UPDATE questions SET archived=1 WHERE tenant_id=? AND id=?",
    c.get("principal").tenantId,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
teacher.route("/imports", imports);
teacher.get("/groups", async (c) => {
  const { limit, offset } = paging(c);
  return c.json({
    items: await rows(
      c.env.DB,
      "SELECT g.*,(SELECT COUNT(*) FROM students s WHERE s.tenant_id=g.tenant_id AND s.group_id=g.id) student_count FROM groups g WHERE g.tenant_id=? ORDER BY g.created_at DESC LIMIT ? OFFSET ?",
      c.get("principal").tenantId,
      limit,
      offset,
    ),
  });
});
teacher.get("/groups/:id", async (c) =>
  c.json({ group: await scoped(c, "groups", c.req.param("id")) }),
);
teacher.post("/groups", async (c) => {
  const d = await body(c, groupSchema),
    gid = id(),
    tid = c.get("principal").tenantId!;
  const plan = await getEffectivePlan(c.env.DB, tid);
  const gCnt = await first(c.env.DB, "SELECT COUNT(*) n FROM groups WHERE tenant_id=?", tid);
  if (Number(gCnt?.n || 0) >= plan.max_groups) {
    fail(`Guruhlar limiti to‘ldi (${gCnt?.n}/${plan.max_groups} — ${plan.name}). Ko‘proq guruh ochish uchun «Tarifim» bo‘limidan Ustoz Pro ga o‘ting.`, 403);
  }
  await stmt(
    c.env.DB,
    "INSERT INTO groups VALUES(?,?,?,?,?,?)",
    gid,
    c.get("principal").tenantId,
    d.name,
    d.name.normalize("NFKC").toLowerCase(),
    d.description,
    now(),
  ).run();
  return c.json({ id: gid }, 201);
});
teacher.put("/groups/:id", async (c) => {
  await scoped(c, "groups", c.req.param("id"));
  const d = await body(c, groupSchema);
  await stmt(
    c.env.DB,
    "UPDATE groups SET name=?,normalized_name=?,description=? WHERE tenant_id=? AND id=?",
    d.name,
    d.name.normalize("NFKC").toLowerCase(),
    d.description,
    c.get("principal").tenantId,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
teacher.delete("/groups/:id", async (c) => {
  await scoped(c, "groups", c.req.param("id"));
  await stmt(
    c.env.DB,
    "DELETE FROM groups WHERE tenant_id=? AND id=?",
    c.get("principal").tenantId,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
teacher.get("/students", async (c) => {
  const { limit, offset } = paging(c);
  return c.json({
    items: await rows(
      c.env.DB,
      "SELECT s.*,g.name group_name FROM students s LEFT JOIN groups g ON g.tenant_id=s.tenant_id AND g.id=s.group_id WHERE s.tenant_id=? ORDER BY s.created_at DESC LIMIT ? OFFSET ?",
      c.get("principal").tenantId,
      limit,
      offset,
    ),
  });
});
teacher.get("/students/:id", async (c) =>
  c.json({ student: await scoped(c, "students", c.req.param("id")) }),
);
async function generateStudentCode(db: D1Database): Promise<string> {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
  for (let i = 0; i < 20; i++) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    const l = letters[buf[0] % letters.length];
    const num = 10000 + (buf[1] % 90000);
    const code = `${l}${num}`;
    const exists = await first(db, "SELECT 1 ok FROM students WHERE UPPER(student_code)=?", code);
    if (!exists) return code;
  }
  return "S" + String(Date.now()).slice(-5);
}
teacher.post("/students/upgrade-codes", async (c) => {
  const tid = c.get("principal").tenantId!;
  const list = await rows(
    c.env.DB,
    "SELECT id, student_code FROM students WHERE tenant_id=?",
    tid,
  );
  let updated = 0;
  for (const s of list) {
    if (!/^[A-Z]\d{5}$/.test(String(s.student_code || ""))) {
      const code = await generateStudentCode(c.env.DB);
      await stmt(
        c.env.DB,
        "UPDATE students SET student_code=? WHERE tenant_id=? AND id=?",
        code,
        tid,
        s.id,
      ).run();
      updated++;
    }
  }
  return c.json({ ok: true, updated });
});
teacher.post("/students", async (c) => {
  const d = await body(c, studentSchema);
  if (d.group_id) await scoped(c, "groups", d.group_id);
  const tid = c.get("principal").tenantId!;
  const plan = await getEffectivePlan(c.env.DB, tid);
  const sCnt = await first(c.env.DB, "SELECT COUNT(*) n FROM students WHERE tenant_id=? AND status='active'", tid);
  if (Number(sCnt?.n || 0) >= plan.max_students) {
    fail(`O‘quvchilar limiti to‘ldi (${sCnt?.n}/${plan.max_students} — ${plan.name}). Ko‘proq o‘quvchi qo‘shish uchun «Tarifim» bo‘limidan Ustoz Pro ga o‘ting.`, 403);
  }
  const n = await first(
    c.env.DB,
    "SELECT (SELECT COUNT(*) FROM students WHERE tenant_id=?) n,json_extract(quotas_json,'$.students') quota FROM tenants WHERE id=?",
    tid,
    tid,
  );
  if (n!.n >= n!.quota) fail("O‘quvchilar limiti tugagan", 429);
  const sid = id();
  const code = await generateStudentCode(c.env.DB);
  await stmt(
    c.env.DB,
    "INSERT INTO students(id,tenant_id,group_id,student_code,name,note,created_at) VALUES(?,?,?,?,?,?,?)",
    sid,
    tid,
    d.group_id,
    code,
    d.name,
    d.note || "",
    now(),
  ).run();
  return c.json({ id: sid, student_code: code }, 201);
});
teacher.put("/students/:id", async (c) => {
  await scoped(c, "students", c.req.param("id"));
  const d = await body(c, studentSchema);
  if (d.group_id) await scoped(c, "groups", d.group_id);
  await stmt(
    c.env.DB,
    "UPDATE students SET group_id=?,student_code=?,name=?,note=? WHERE tenant_id=? AND id=?",
    d.group_id,
    d.student_code,
    d.name,
    d.note || "",
    c.get("principal").tenantId,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
teacher.delete("/students/:id", async (c) => {
  await scoped(c, "students", c.req.param("id"));
  await stmt(
    c.env.DB,
    "UPDATE students SET status='archived' WHERE tenant_id=? AND id=?",
    c.get("principal").tenantId,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
async function generateCardCode(db: D1Database): Promise<string> {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ";
  for (let i = 0; i < 12; i++) {
    const buf = new Uint32Array(3);
    crypto.getRandomValues(buf);
    const l1 = letters[buf[0] % letters.length];
    const l2 = letters[buf[1] % letters.length];
    const num = 10000 + (buf[2] % 90000);
    const code = `${l1}${l2}-${num}`;
    const exists = await first(db, "SELECT 1 ok FROM cards WHERE slug=?", code);
    if (!exists) return code;
  }
  return "TL-" + token(8);
}
export function cardView(r: Row) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    status: r.status,
    published_version: r.published_version,
    has_pin: !!r.pin_hash,
    market_status: r.market_status || "none",
    market_solves: Number(r.market_solves || 0),
    market_score_sum: Number(r.market_score_sum || 0),
    ...JSON.parse(r.settings_json),
  };
}
async function validateRefs(c: Ctx, d: CardSettings) {
  if (d.group_id) await scoped(c, "groups", d.group_id);
  if (d.mode === "manual") {
    const found = await rows(
      c.env.DB,
      "SELECT id FROM questions WHERE tenant_id=? AND archived=0 AND id IN (SELECT value FROM json_each(?))",
      c.get("principal").tenantId,
      json(d.selected_ids),
    );
    if (found.length !== d.selected_ids.length)
      fail("Tanlangan savollar topilmadi", 404);
  }
}
teacher.get("/cards", async (c) => {
  const { limit, offset } = paging(c);
  return c.json({
    items: (
      await rows(
        c.env.DB,
        "SELECT * FROM cards WHERE tenant_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        c.get("principal").tenantId,
        limit,
        offset,
      )
    ).map(cardView),
  });
});
teacher.get("/cards/:id", async (c) =>
  c.json({ card: cardView(await scoped(c, "cards", c.req.param("id"))) }),
);
teacher.post("/cards", async (c) => {
  const d = await body(c, cardSchema);
  await validateRefs(c, d);
  if (d.access_mode === "pin" && d.pin.length < 4)
    fail("PIN kamida 4 belgi bo‘lsin");
  const cid = id(),
    pin = d.access_mode === "pin" ? await passwordHash(d.pin) : null;
  d.pin = "";
  await stmt(
    c.env.DB,
    "INSERT INTO cards(id,tenant_id,slug,title,settings_json,pin_hash,group_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    cid,
    c.get("principal").tenantId,
    await generateCardCode(c.env.DB),
    d.title,
    json(d),
    pin,
    d.group_id,
    now(),
    now(),
  ).run();
  return c.json({ id: cid }, 201);
});
teacher.put("/cards/:id", async (c) => {
  const r = await scoped(c, "cards", c.req.param("id"));
  if (r.published_version)
    fail("E’lon qilingan kartani o‘zgartirish uchun nusxa yarating", 409);
  const d = await body(c, cardSchema);
  await validateRefs(c, d);
  if (d.access_mode === "pin" && !r.pin_hash && d.pin.length < 4)
    fail("PIN kerak");
  const pin =
    d.access_mode === "pin"
      ? d.pin
        ? await passwordHash(d.pin)
        : r.pin_hash
      : null;
  d.pin = "";
  await stmt(
    c.env.DB,
    "UPDATE cards SET title=?,settings_json=?,pin_hash=?,group_id=?,updated_at=? WHERE tenant_id=? AND id=? AND published_version=0",
    d.title,
    json(d),
    pin,
    d.group_id,
    now(),
    c.get("principal").tenantId,
    r.id,
  ).run();
  return c.json({ ok: true });
});
export function portions(s: CardSettings) {
  const exact = levels.map((level) => ({
    level,
    n: (s.question_count * s.mix[level]) / 100,
  }));
  const result = Object.fromEntries(
    exact.map((x) => [x.level, Math.floor(x.n)]),
  ) as Record<string, number>;
  let extra =
    s.question_count - Object.values(result).reduce((a, b) => a + b, 0);
  for (const p of [...exact].sort((a, b) => (b.n % 1) - (a.n % 1)))
    if (extra-- > 0) result[p.level]++;
  return result;
}
teacher.post("/cards/:id/status", async (c) => {
  const r = await scoped(c, "cards", c.req.param("id"));
  const d = await body(
    c,
    z
      .object({ status: z.enum(["draft", "active", "closed", "archived"]) })
      .strict(),
  );
  const tid = c.get("principal").tenantId!;
  if (d.status === "active" && !r.published_version) {
    const s = JSON.parse(r.settings_json) as CardSettings;
    await validateRefs(c, s);
    const candidates = await rows(
      c.env.DB,
      `SELECT q.id,q.level,v.id version_id FROM questions q JOIN question_versions v ON v.tenant_id=q.tenant_id AND v.question_id=q.id AND v.version=q.content_version WHERE q.tenant_id=? AND q.archived=0 AND (?='' OR q.category=?) AND (?='' OR q.topic=?) AND (?='auto' OR q.id IN (SELECT value FROM json_each(?))) ORDER BY q.created_at LIMIT 5001`,
      tid,
      s.category,
      s.category,
      s.topic,
      s.topic,
      s.mode,
      json(s.selected_ids),
    );
    if (candidates.length > 5000)
      fail("Karta uchun fan/mavzuni aniqlashtiring; 5000 dan ortiq savol bor");
    if (s.mode === "manual" && candidates.length !== s.question_count)
      fail("Savollar soni mos kelmadi");
    if (s.mode === "auto")
      for (const [level, n] of Object.entries(portions(s)))
        if (candidates.filter((q) => q.level === level).length < n)
          fail(`${level} darajasidagi savollar yetarli emas`);
    const ordered =
      s.mode === "manual"
        ? s.selected_ids.map((qid) => candidates.find((x) => x.id === qid)!)
        : candidates;
    await c.env.DB.batch([
      stmt(
        c.env.DB,
        "INSERT INTO card_releases VALUES(?,?,?,?,?)",
        tid,
        r.id,
        1,
        r.settings_json,
        now(),
      ),
      stmt(
        c.env.DB,
        "INSERT INTO card_questions SELECT ?,?,1,json_extract(value,'$.version_id'),CAST(key AS INTEGER)+1 FROM json_each(?)",
        tid,
        r.id,
        json(ordered.map((x) => ({ version_id: x.version_id }))),
      ),
      stmt(
        c.env.DB,
        "UPDATE cards SET published_version=1,status='active',updated_at=? WHERE tenant_id=? AND id=? AND published_version=0",
        now(),
        tid,
        r.id,
      ),
    ]);
  } else {
    if (d.status === "draft" && r.published_version)
      fail("E’lon qilingan kartani draftga qaytarib bo‘lmaydi", 409);
    await stmt(
      c.env.DB,
      "UPDATE cards SET status=?,updated_at=? WHERE tenant_id=? AND id=?",
      d.status,
      now(),
      tid,
      r.id,
    ).run();
  }
  return c.json({ ok: true });
});
teacher.post("/cards/:id/duplicate", async (c) => {
  const r = await scoped(c, "cards", c.req.param("id")),
    cid = id();
  const s = JSON.parse(r.settings_json);
  s.title = (s.title + " (nusxa)").slice(0, 130);
  await stmt(
    c.env.DB,
    "INSERT INTO cards(id,tenant_id,slug,title,settings_json,pin_hash,group_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
    cid,
    c.get("principal").tenantId,
    await generateCardCode(c.env.DB),
    s.title,
    json(s),
    r.pin_hash,
    r.group_id,
    now(),
    now(),
  ).run();
  return c.json({ id: cid }, 201);
});
teacher.post("/cards/:id/market", async (c) => {
  const tid = c.get("principal").tenantId!;
  const card = await scoped(c, "cards", c.req.param("id"));
  const d = await body(c, z.object({ action: z.enum(["submit", "remove"]) }));
  if (d.action === "remove") {
    await stmt(
      c.env.DB,
      "UPDATE cards SET market_status='none', updated_at=? WHERE tenant_id=? AND id=?",
      now(),
      tid,
      card.id,
    ).run();
    return c.json({ ok: true, market_status: "none" });
  }
  const s = JSON.parse(card.settings_json || "{}");
  if (card.status !== "active" || !card.published_version)
    fail("Avval test kartasini faollashtiring", 422);
  if (s.access_mode !== "open" || card.group_id)
    fail("Faqat ochiq (PIN-kodsiz va guruhga bog‘lanmagan) kartalarni marketga chiqarish mumkin", 422);
  await stmt(
    c.env.DB,
    "UPDATE cards SET market_status='pending', updated_at=? WHERE tenant_id=? AND id=?",
    now(),
    tid,
    card.id,
  ).run();
  return c.json({ ok: true, market_status: "pending" });
});
teacher.get("/cards/:id/comments", async (c) => {
  const card = await scoped(c, "cards", c.req.param("id"));
  const items = await rows(
    c.env.DB,
    "SELECT id, author_name, rating, comment, score_percent, created_at FROM card_comments WHERE tenant_id=? AND card_id=? ORDER BY created_at DESC LIMIT 200",
    card.tenant_id,
    card.id,
  );
  return c.json({ items });
});
teacher.delete("/cards/:id/comments/:cid", async (c) => {
  const card = await scoped(c, "cards", c.req.param("id"));
  await stmt(
    c.env.DB,
    "DELETE FROM card_comments WHERE tenant_id=? AND card_id=? AND id=?",
    card.tenant_id,
    card.id,
    c.req.param("cid"),
  ).run();
  return c.json({ ok: true });
});
teacher.delete("/cards/:id", async (c) => {
  const tid = c.get("principal").tenantId!;
  const card = await scoped(c, "cards", c.req.param("id"));
  const s = JSON.parse(card.settings_json || "{}");
  const passPercent = Number(s.pass_percent ?? 70);
  const category = String(s.category || "");
  const submitted = await rows(
    c.env.DB,
    "SELECT * FROM attempts WHERE tenant_id=? AND card_id=? AND status='submitted' ORDER BY submitted_at DESC",
    tid,
    card.id,
  );
  const archivedAt = now();
  const stmts = [
    ...submitted.map((a) => {
      const submittedAt = Number(a.submitted_at || archivedAt);
      const startedAt = Number(a.started_at || submittedAt);
      return stmt(
        c.env.DB,
        "INSERT INTO archived_results(id,tenant_id,card_title,card_slug,card_category,pass_percent,student_name,score,max_score,percentage,passed,correct_count,incorrect_count,unanswered_count,started_at,submitted_at,duration_seconds,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id(),
        tid,
        card.title,
        card.slug,
        category,
        passPercent,
        a.student_name,
        a.score,
        a.max_score,
        a.percentage,
        Number(a.percentage) >= passPercent ? 1 : 0,
        a.correct_count,
        a.incorrect_count,
        a.unanswered_count,
        startedAt,
        submittedAt,
        Math.max(0, submittedAt - startedAt),
        archivedAt,
      );
    }),
    stmt(c.env.DB, "DELETE FROM attempts WHERE tenant_id=? AND card_id=?", tid, card.id),
    stmt(c.env.DB, "DELETE FROM card_questions WHERE tenant_id=? AND card_id=?", tid, card.id),
    stmt(c.env.DB, "DELETE FROM card_releases WHERE tenant_id=? AND card_id=?", tid, card.id),
    stmt(c.env.DB, "DELETE FROM cards WHERE tenant_id=? AND id=?", tid, card.id),
  ];
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, archived_results: submitted.length });
});
teacher.get("/archived-results", async (c) => {
  const tid = c.get("principal").tenantId!,
    { limit, offset } = paging(c);
  const clauses = ["tenant_id=?"],
    args: unknown[] = [tid];
  if (c.req.query("q")) {
    const p = likePattern(c.req.query("q")!);
    clauses.push("(card_title LIKE ? OR student_name LIKE ? OR card_slug LIKE ?)");
    args.push(p, p, p);
  }
  const where = clauses.join(" AND ");
  const items = await rows(
    c.env.DB,
    `SELECT * FROM archived_results WHERE ${where} ORDER BY submitted_at DESC, archived_at DESC LIMIT ? OFFSET ?`,
    ...args,
    limit,
    offset,
  );
  const total = await first(
    c.env.DB,
    `SELECT COUNT(*) count FROM archived_results WHERE ${where}`,
    ...args,
  );
  return c.json({ items, total: total?.count || 0 });
});
teacher.get("/archived-results/export.csv", async (c) => {
  const tid = c.get("principal").tenantId!;
  const items = await rows(
    c.env.DB,
    "SELECT * FROM archived_results WHERE tenant_id=? ORDER BY submitted_at DESC LIMIT 5000",
    tid,
  );
  const data = [
    ["Test nomi", "Test kodi", "Fan / kategoriya", "O'quvchi", "Ball", "Maks. ball", "Foiz (%)", "Holat", "To'g'ri", "Xato", "Javobsiz", "Davomiyligi (sek)", "Topshirilgan sana", "Arxivlangan sana"],
    ...items.map((r) => [
      r.card_title,
      r.card_slug,
      r.card_category,
      r.student_name,
      r.score,
      r.max_score,
      r.percentage,
      r.passed ? "O'tdi" : "O'tmadi",
      r.correct_count,
      r.incorrect_count,
      r.unanswered_count,
      r.duration_seconds,
      new Date(Number(r.submitted_at) * 1000).toISOString(),
      new Date(Number(r.archived_at) * 1000).toISOString(),
    ]),
  ];
  return new Response(toCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="arxivlangan_natijalar.csv"',
    },
  });
});
function todayUz(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function getMonthDates(month: string, days: number[]): string[] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return [];
  const y = Number(m[1]), mo = Number(m[2]);
  const daySet = new Set(days);
  const out: string[] = [];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    const wd = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay(); // 1=Mon..7=Sun
    if (daySet.has(wd)) {
      out.push(`${m[1]}-${m[2]}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

async function buildJournal(db: D1Database, tid: string, groupId: string, month: string) {
  const groups = await rows(
    db,
    "SELECT id, name, description FROM groups WHERE tenant_id=? ORDER BY name",
    tid,
  );
  const gid = groupId || groups[0]?.id || "";
  if (!gid) {
    return {
      groups: [],
      group_id: "",
      month,
      today: todayUz(),
      schedule_days: [1, 3, 5],
      lesson_dates: getMonthDates(month, [1, 3, 5]),
      month_tests: [],
      students: [],
      summary: {
        student_count: 0,
        avg_attendance: 0,
        avg_knowledge: 0,
        tests_taken: 0,
        tests_passed: 0,
        at_risk_count: 0,
      },
    };
  }
  const sched = await first(
    db,
    "SELECT days_json FROM group_schedules WHERE tenant_id=? AND group_id=?",
    tid,
    gid,
  );
  const scheduleDays: number[] = sched ? JSON.parse(sched.days_json) : [1, 3, 5];
  const lessonDates = getMonthDates(month, scheduleDays);

  const studs = await rows(
    db,
    "SELECT id, name, student_code, COALESCE(note,'') note FROM students WHERE tenant_id=? AND group_id=? AND status='active' ORDER BY name",
    tid,
    gid,
  );
  const attRows = await rows(
    db,
    "SELECT student_id, lesson_date, status FROM attendance_records WHERE tenant_id=? AND group_id=? AND lesson_date LIKE ?",
    tid,
    gid,
    month + "-%",
  );
  const attMap = new Map<string, Record<string, string>>();
  for (const r of attRows) {
    if (!attMap.has(r.student_id)) attMap.set(r.student_id, {});
    attMap.get(r.student_id)![r.lesson_date] = r.status;
  }

  const [yy, mm] = month.split("-").map(Number);
  const startTs = Math.floor(Date.UTC(yy, mm - 1, 1) / 1000);
  const endTs = Math.floor(Date.UTC(yy, mm, 1) / 1000);

  const attemptRows = await rows(
    db,
    `SELECT a.card_id, a.student_id, a.student_name, a.percentage, a.score, a.max_score, a.submitted_at, c.title card_title, c.slug card_slug, c.settings_json
     FROM attempts a
     JOIN cards c ON c.id=a.card_id AND c.tenant_id=a.tenant_id
     WHERE a.tenant_id=? AND a.status='submitted' AND a.submitted_at>=? AND a.submitted_at<?
     ORDER BY a.submitted_at DESC`,
    tid,
    startTs,
    endTs,
  );
  const archivedRows = await rows(
    db,
    `SELECT card_title, card_slug, student_name, percentage, score, max_score, passed, submitted_at
     FROM archived_results
     WHERE tenant_id=? AND submitted_at>=? AND submitted_at<?
     ORDER BY submitted_at DESC`,
    tid,
    startTs,
    endTs,
  );

  const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const monthTestMap = new Map<string, { key: string; title: string; slug: string; last_at: number }>();

  let sumAtt = 0,
    attStudents = 0,
    sumKnow = 0,
    knowStudents = 0,
    totalTaken = 0,
    totalPassed = 0,
    atRisk = 0;

  const students = studs.map((s) => {
    const attendance = attMap.get(s.id) || {};
    let present = 0,
      late = 0,
      absent = 0,
      excused = 0;
    for (const d of lessonDates) {
      const st = attendance[d];
      if (st === "present") present++;
      else if (st === "late") late++;
      else if (st === "absent") absent++;
      else if (st === "excused") excused++;
    }
    const marked = present + late + absent + excused;
    const attPct = marked ? Math.round(((present + late) / marked) * 1000) / 10 : null;
    if (attPct !== null) {
      sumAtt += attPct;
      attStudents++;
    }

    const sn = normName(s.name);
    const tests: {
      key: string;
      title: string;
      slug: string;
      score: number;
      max_score: number;
      percentage: number;
      passed: boolean;
      submitted_at: number;
    }[] = [];

    for (const a of attemptRows) {
      if (a.student_id === s.id || (!a.student_id && normName(a.student_name) === sn)) {
        const cfg = JSON.parse(a.settings_json || "{}");
        const passPct = Number(cfg.pass_percent ?? 70);
        const pct = Number(a.percentage || 0);
        const key = String(a.card_slug || a.card_id || a.card_title);
        const subAt = Number(a.submitted_at);
        tests.push({
          key,
          title: a.card_title,
          slug: a.card_slug || "",
          score: Number(a.score || 0),
          max_score: Number(a.max_score || 0),
          percentage: pct,
          passed: pct >= passPct,
          submitted_at: subAt,
        });
        const prev = monthTestMap.get(key);
        if (!prev || subAt > prev.last_at) {
          monthTestMap.set(key, { key, title: a.card_title, slug: a.card_slug || "", last_at: subAt });
        }
      }
    }
    for (const a of archivedRows) {
      if (normName(a.student_name) === sn) {
        const key = String(a.card_slug || a.card_title);
        const subAt = Number(a.submitted_at);
        tests.push({
          key,
          title: a.card_title,
          slug: a.card_slug || "",
          score: Number(a.score || 0),
          max_score: Number(a.max_score || 0),
          percentage: Number(a.percentage || 0),
          passed: !!a.passed,
          submitted_at: subAt,
        });
        const prev = monthTestMap.get(key);
        if (!prev || subAt > prev.last_at) {
          monthTestMap.set(key, { key, title: a.card_title, slug: a.card_slug || "", last_at: subAt });
        }
      }
    }

    // Har bir test bo'yicha eng yaxshi natija
    const testScores: Record<string, { percentage: number; passed: boolean; score: number; max_score: number; submitted_at: number; attempts: number }> = {};
    for (const t of tests) {
      const cur = testScores[t.key];
      if (!cur) {
        testScores[t.key] = {
          percentage: t.percentage,
          passed: t.passed,
          score: t.score,
          max_score: t.max_score,
          submitted_at: t.submitted_at,
          attempts: 1,
        };
      } else {
        cur.attempts += 1;
        if (t.percentage > cur.percentage) {
          cur.percentage = t.percentage;
          cur.passed = t.passed;
          cur.score = t.score;
          cur.max_score = t.max_score;
          cur.submitted_at = t.submitted_at;
        }
      }
    }

    const taken = tests.length;
    const passed = tests.filter((t) => t.passed).length;
    const avgPct = taken
      ? Math.round((tests.reduce((acc, t) => acc + t.percentage, 0) / taken) * 10) / 10
      : null;
    totalTaken += taken;
    totalPassed += passed;
    if (avgPct !== null) {
      sumKnow += avgPct;
      knowStudents++;
    }
    const isRisk = (avgPct !== null && avgPct < 60) || (attPct !== null && attPct < 70);
    if (isRisk) atRisk++;

    return {
      id: s.id,
      name: s.name,
      student_code: s.student_code,
      note: s.note || "",
      attendance,
      present_count: present,
      late_count: late,
      absent_count: absent,
      excused_count: excused,
      marked_lessons: marked,
      attendance_percent: attPct,
      tests_taken: taken,
      tests_passed: passed,
      avg_percent: avgPct,
      test_scores: testScores,
      all_tests: tests.slice(0, 20),
    };
  });

  const monthTests = Array.from(monthTestMap.values())
    .sort((a, b) => a.last_at - b.last_at)
    .slice(-8);

  return {
    groups,
    group_id: gid,
    month,
    today: todayUz(),
    schedule_days: scheduleDays,
    lesson_dates: lessonDates,
    month_tests: monthTests,
    students,
    summary: {
      student_count: students.length,
      avg_attendance: attStudents ? Math.round((sumAtt / attStudents) * 10) / 10 : 0,
      avg_knowledge: knowStudents ? Math.round((sumKnow / knowStudents) * 10) / 10 : 0,
      tests_taken: totalTaken,
      tests_passed: totalPassed,
      at_risk_count: atRisk,
    },
  };
}

teacher.get("/journal", async (c) => {
  const tid = c.get("principal").tenantId!;
  const nowDate = new Date();
  const defMonth = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(c.req.query("month") || "") ? c.req.query("month")! : defMonth;
  const groupId = c.req.query("group_id") || "";
  return c.json(await buildJournal(c.env.DB, tid, groupId, month));
});

teacher.put("/journal/schedule", async (c) => {
  const tid = c.get("principal").tenantId!;
  const d = await body(
    c,
    z.object({
      group_id: z.string().min(1).max(80),
      days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    }),
  );
  await scoped(c, "groups", d.group_id);
  const uniq = Array.from(new Set(d.days)).sort((a, b) => a - b);
  await stmt(
    c.env.DB,
    "INSERT INTO group_schedules(tenant_id,group_id,days_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(tenant_id,group_id) DO UPDATE SET days_json=excluded.days_json,updated_at=excluded.updated_at",
    tid,
    d.group_id,
    json(uniq),
    now(),
  ).run();
  return c.json({ ok: true, days: uniq });
});

teacher.put("/journal/attendance", async (c) => {
  const tid = c.get("principal").tenantId!;
  const d = await body(
    c,
    z.object({
      group_id: z.string().min(1).max(80),
      records: z
        .array(
          z.object({
            student_id: z.string().min(1).max(80),
            lesson_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            status: z.enum(["present", "absent", "late", "excused", ""]),
          }),
        )
        .min(1)
        .max(200),
    }),
  );
  await scoped(c, "groups", d.group_id);
  const today = todayUz();
  for (const r of d.records) {
    if (r.lesson_date < today) {
      fail("O‘tgan kunlar davomatini o‘zgartirib bo‘lmaydi (qulflangan)", 403);
    }
    if (r.lesson_date > today) {
      fail("Kelajakdagi kunlarga oldindan davomat belgilab bo‘lmaydi", 403);
    }
  }
  const t = now();
  const stmts = d.records.map((r) =>
    r.status === ""
      ? stmt(
          c.env.DB,
          "DELETE FROM attendance_records WHERE tenant_id=? AND group_id=? AND student_id=? AND lesson_date=?",
          tid,
          d.group_id,
          r.student_id,
          r.lesson_date,
        )
      : stmt(
          c.env.DB,
          "INSERT INTO attendance_records(tenant_id,group_id,student_id,lesson_date,status,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(tenant_id,group_id,student_id,lesson_date) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at",
          tid,
          d.group_id,
          r.student_id,
          r.lesson_date,
          r.status,
          t,
        ),
  );
  await c.env.DB.batch(stmts);
  notifyParentAttendance(c, tid, d.records);
  return c.json({ ok: true, count: d.records.length });
});

teacher.get("/journal/export.csv", async (c) => {
  const tid = c.get("principal").tenantId!;
  const nowDate = new Date();
  const defMonth = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = /^\d{4}-\d{2}$/.test(c.req.query("month") || "") ? c.req.query("month")! : defMonth;
  const groupId = c.req.query("group_id") || "";
  const j = await buildJournal(c.env.DB, tid, groupId, month);
  const sym: Record<string, string> = { present: "+", late: "K", absent: "-", excused: "S" };
  const header = ["O'quvchi", "Kod", "Tavsif / Sinf", ...j.lesson_dates, "Keldi", "Kechikdi", "Kelmadi", "Sababli", "Davomat (%)", "Testlar", "O'tgan", "Oylik bilim (%)"];
  const data = [
    header,
    ...j.students.map((s: any) => [
      s.name,
      s.student_code,
      s.note || "",
      ...j.lesson_dates.map((d: string) => sym[s.attendance[d]] || ""),
      s.present_count,
      s.late_count,
      s.absent_count,
      s.excused_count,
      s.attendance_percent ?? "",
      s.tests_taken,
      s.tests_passed,
      s.avg_percent ?? "",
    ]),
  ];
  return new Response(toCsv(data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jurnal_${month}.csv"`,
    },
  });
});

teacher.get("/cards/:id/analytics", async (c) => {
  const r = await scoped(c, "cards", c.req.param("id"));
  await finalizeExpired(c.env, r.tenant_id, r.id);
  return c.json(await analytics(c, r.id));
});
teacher.get("/cards/:id/export", async (c) => {
  await scoped(c, "cards", c.req.param("id"));
  await rate(c, "export", 10, 3600, c.get("principal").userId);
  const data = await analytics(c, c.req.param("id"), true);
  if (c.req.query("format") === "xlsx") return xlsxExport(c, data.attempts);
  return csvExport(c, data.attempts);
});
teacher.get("/attempts/:id", async (c) => {
  const a = await scoped(c, "attempts", c.req.param("id"));
  const details = await rows(
    c.env.DB,
    "SELECT aq.position,v.content_json,aa.selected_json,aa.active_time_ms,aa.is_correct,aa.earned_points FROM attempt_questions aq JOIN question_versions v ON v.tenant_id=aq.tenant_id AND v.id=aq.question_version_id JOIN attempt_answers aa ON aa.tenant_id=aq.tenant_id AND aa.attempt_id=aq.attempt_id AND aa.position=aq.position WHERE aq.tenant_id=? AND aq.attempt_id=? ORDER BY aq.position",
    a.tenant_id,
    a.id,
  );
  return c.json({
    attempt: a,
    questions: details.map((x) => ({
      ...x,
      content: JSON.parse(x.content_json),
      content_json: undefined,
    })),
  });
});
teacher.post("/questions/:id/submit-store", async (c) => {
  const q = await scoped(c, "questions", c.req.param("id"));
  const d = await body(
    c,
    z
      .object({
        consent: z.literal(true),
        original: z.literal(true),
        license: z.literal("CC-BY-4.0"),
        attribution: z.string().max(120).default(""),
      })
      .strict(),
  );
  const sid = id();
  await stmt(
    c.env.DB,
    "INSERT INTO store_submissions(id,tenant_id,question_id,source_version,content_json,fingerprint,consent_at,license,attribution) VALUES(?,?,?,?,?,?,?,?,?)",
    sid,
    q.tenant_id,
    q.id,
    q.content_version,
    q.content_json,
    q.fingerprint,
    now(),
    d.license,
    d.attribution,
  ).run();
  return c.json({ id: sid, status: "pending" }, 201);
});
teacher.get("/submissions", async (c) =>
  c.json({
    items: await rows(
      c.env.DB,
      "SELECT id,question_id,moderation_status,reason,consent_at FROM store_submissions WHERE tenant_id=? ORDER BY consent_at DESC LIMIT 100",
      c.get("principal").tenantId,
    ),
  }),
);
teacher.post("/store/copy-bulk", async (c) => {
  if (!(await settings(c.env)).store_enabled)
    fail("Savollar do‘koni vaqtincha yopiq", 503);
  const d = await body(
    c,
    z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict(),
  );
  let copied = 0;
  let skipped = 0;
  for (const sid of d.ids) {
    const r = await first(
      c.env.DB,
      "SELECT public_content_json FROM store_items WHERE id=? AND status='approved'",
      sid,
    );
    if (!r) {
      skipped++;
      continue;
    }
    try {
      const content = JSON.parse(r.public_content_json);
      const q = questionSchema.parse(content.question);
      await insertQuestion(c, q, {
        store_item_id: sid,
        license: content.license,
        attribution: content.attribution,
        source_version: content.source_version,
      });
      copied++;
    } catch {
      skipped++;
    }
  }
  return c.json({ ok: true, copied, skipped }, 201);
});

teacher.post("/market-cards/:slug/copy", async (c) => {
  const tid = c.get("principal").tenantId!;
  const slug = c.req.param("slug");
  const card = await first(
    c.env.DB,
    "SELECT * FROM cards WHERE slug=? AND market_status='approved' AND status='active' AND published_version>0",
    slug,
  );
  if (!card) fail("Market test kartasi topilmadi", 404);

  const qRows = await rows(
    c.env.DB,
    `SELECT v.content_json, q.fingerprint
     FROM card_questions cq
     JOIN question_versions v ON v.tenant_id=cq.tenant_id AND v.id=cq.question_version_id
     LEFT JOIN questions q ON q.tenant_id=v.tenant_id AND q.id=v.question_id
     WHERE cq.tenant_id=? AND cq.card_id=? AND cq.card_version=?
     ORDER BY cq.position ASC`,
    card.tenant_id,
    card.id,
    card.published_version,
  );
  if (!qRows.length) fail("Ushbu test kartasida savollar topilmadi", 422);

  const copiedIds: string[] = [];
  let newlyAdded = 0;
  for (const row of qRows) {
    const q = questionSchema.parse(JSON.parse(row.content_json));
    if (row.fingerprint) {
      const existing = await first(
        c.env.DB,
        "SELECT id FROM questions WHERE tenant_id=? AND fingerprint=? AND archived=0",
        tid,
        row.fingerprint,
      );
      if (existing) {
        copiedIds.push(existing.id);
        continue;
      }
    }
    try {
      const newQid = await insertQuestion(c, q, {
        market_card_slug: card.slug,
      });
      copiedIds.push(newQid);
      newlyAdded++;
    } catch {
      // Fallback: find by title in current tenant if fingerprint collided
      const existing = await first(
        c.env.DB,
        "SELECT id FROM questions WHERE tenant_id=? AND title=? AND archived=0 LIMIT 1",
        tid,
        q.title,
      );
      if (existing) copiedIds.push(existing.id);
    }
  }
  if (!copiedIds.length) fail("Savollarni nusxalab bo‘lmadi", 422);

  const orig = JSON.parse(card.settings_json || "{}");
  const newSettings = {
    ...orig,
    title: (String(orig.title || card.title) + " (Market)").slice(0, 130),
    mode: "manual",
    selected_ids: copiedIds,
    question_count: copiedIds.length,
    access_mode: "open",
  };
  const newCid = id();
  const newSlug = await generateCardCode(c.env.DB);
  const ts = now();
  await stmt(
    c.env.DB,
    "INSERT INTO cards(id,tenant_id,slug,title,settings_json,pin_hash,group_id,created_at,updated_at) VALUES(?,?,?,?,?,NULL,NULL,?,?)",
    newCid,
    tid,
    newSlug,
    newSettings.title,
    json(newSettings),
    ts,
    ts,
  ).run();

  return c.json(
    {
      ok: true,
      id: newCid,
      slug: newSlug,
      questions_total: copiedIds.length,
      questions_added: newlyAdded,
    },
    201,
  );
});

teacher.post("/store/:id/copy", async (c) => {
  if (!(await settings(c.env)).store_enabled)
    fail("Savollar do‘koni vaqtincha yopiq", 503);
  const r = await first(
    c.env.DB,
    "SELECT public_content_json FROM store_items WHERE id=? AND status='approved'",
    c.req.param("id"),
  );
  if (!r) fail("Savol topilmadi", 404);
  const content = JSON.parse(r.public_content_json);
  const q = questionSchema.parse(content.question);
  return c.json(
    {
      id: await insertQuestion(c, q, {
        store_item_id: c.req.param("id"),
        license: content.license,
        attribution: content.attribution,
        source_version: content.source_version,
      }),
    },
    201,
  );
});
teacher.post("/store/:id/report", async (c) => {
  const d = await body(
    c,
    z.object({ reason: z.string().trim().min(10).max(2000) }).strict(),
  );
  if (
    !(await first(
      c.env.DB,
      "SELECT id FROM store_items WHERE id=? AND status='approved'",
      c.req.param("id"),
    ))
  )
    fail("Savol topilmadi", 404);
  await stmt(
    c.env.DB,
    "INSERT INTO store_reports(id,item_id,reporter_user_id,reason,created_at) VALUES(?,?,?,?,?)",
    id(),
    c.req.param("id"),
    c.get("principal").userId,
    d.reason,
    now(),
  ).run();
  return c.json({ ok: true });
});
teacher.get("/support", async (c) =>
  c.json({
    contacts: await settings(c.env),
    items: await rows(
      c.env.DB,
      "SELECT * FROM support_tickets WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100",
      c.get("principal").tenantId,
    ),
  }),
);
teacher.post("/support", async (c) => {
  const d = await body(
    c,
    z
      .object({
        subject: z.string().trim().min(3).max(160),
        message: z.string().trim().min(10).max(4000),
      })
      .strict(),
  );
  await rate(c, "support", 5, 3600, c.get("principal").userId);
  await stmt(
    c.env.DB,
    "INSERT INTO support_tickets(id,tenant_id,user_id,subject,message,created_at) VALUES(?,?,?,?,?,?)",
    id(),
    c.get("principal").tenantId,
    c.get("principal").userId,
    d.subject,
    d.message,
    now(),
  ).run();
  return c.json({ ok: true }, 201);
});
teacher.put("/settings", async (c) => {
  const d = await body(
    c,
    z
      .object({
        display_name: z.string().trim().min(3).max(120),
        workspace_name: z.string().trim().min(3).max(160),
        workplace: z.string().max(160).default(""),
      })
      .strict(),
  );
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE users SET display_name=?,workplace=? WHERE id=?",
      d.display_name,
      d.workplace,
      c.get("principal").userId,
    ),
    stmt(
      c.env.DB,
      "UPDATE tenants SET name=? WHERE id=? AND owner_user_id=?",
      d.workspace_name,
      c.get("principal").tenantId,
      c.get("principal").userId,
    ),
  ]);
  return c.json({ ok: true });
});
teacher.get("/account/export", async (c) => {
  await rate(c, "account-export", 2, 3600, c.get("principal").userId);
  const tid = c.get("principal").tenantId;
  const tables = [
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
    "support_tickets",
  ] as const;
  const out: Record<string, Row[]> = {};
  for (const table of tables) {
    out[table] = await rows(
      c.env.DB,
      `SELECT * FROM ${table} WHERE tenant_id=? LIMIT 10001`,
      tid,
    );
    if (out[table].length > 10000)
      fail("Katta eksport uchun Supportga murojaat qiling", 413);
    out[table] = out[table].map(
      ({ token_hash: _t, start_key_hash: _k, pin_hash: _p, ...r }) => r,
    );
  }
  c.header(
    "Content-Disposition",
    'attachment; filename="testlab-private-export.json"',
  );
  return c.json({ exported_at: now(), data: out });
});
teacher.delete("/account", async (c) => {
  await body(
    c,
    z.object({ confirmation: z.literal("HISOBIMNI O‘CHIRISH") }).strict(),
  );
  const p = c.get("principal");
  await purgeTenantImportFiles(c.env, p.tenantId!);
  const submissions = await rows(
    c.env.DB,
    "SELECT id FROM store_submissions WHERE tenant_id=?",
    p.tenantId,
  );
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      "UPDATE store_items SET status='revoked' WHERE submission_id IN (SELECT value FROM json_each(?))",
      json(submissions.map((s) => s.id)),
    ),
    stmt(
      c.env.DB,
      "DELETE FROM store_reports WHERE item_id IN (SELECT id FROM store_items WHERE submission_id IN (SELECT id FROM store_submissions WHERE tenant_id=?))",
      p.tenantId,
    ),
    stmt(
      c.env.DB,
      "DELETE FROM store_items WHERE submission_id IN (SELECT id FROM store_submissions WHERE tenant_id=?)",
      p.tenantId,
    ),
    stmt(
      c.env.DB,
      "DELETE FROM store_submissions WHERE tenant_id=?",
      p.tenantId,
    ),
    stmt(c.env.DB, "DELETE FROM attempts WHERE tenant_id=?", p.tenantId),
    stmt(c.env.DB, "DELETE FROM card_questions WHERE tenant_id=?", p.tenantId),
    stmt(c.env.DB, "DELETE FROM card_releases WHERE tenant_id=?", p.tenantId),
    stmt(c.env.DB, "DELETE FROM cards WHERE tenant_id=?", p.tenantId),
    stmt(c.env.DB, "DELETE FROM students WHERE tenant_id=?", p.tenantId),
    stmt(c.env.DB, "DELETE FROM tenants WHERE id=?", p.tenantId),
    stmt(
      c.env.DB,
      "UPDATE users SET status='deleted',email=NULL,password_hash=NULL,display_name='O‘chirilgan',telegram_sub=NULL,phone_e164=NULL,workplace='' WHERE id=?",
      p.userId,
    ),
    stmt(c.env.DB, "DELETE FROM sessions WHERE user_id=?", p.userId),
  ]);
  return c.json({ ok: true, backup_retention_days: 7 });
});

teacher.route("/billing", billingTeacher);
