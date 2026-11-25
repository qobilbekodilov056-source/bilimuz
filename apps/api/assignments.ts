import { Hono } from "hono";
import { notifyParentNewAssignment, notifyParentHomeworkGraded } from "./tgbot";
import { z } from "zod";
import type { AppEnv } from "./types";
import { body, fail, first, id, now, rate, rows, stmt } from "./core";

export const assignmentsTeacher = new Hono<AppEnv>();
export const assignmentsPublic = new Hono<AppEnv>();

const assignmentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(4000).optional().default(""),
  group_id: z.string().max(80).nullable().optional().default(null),
  kind: z.enum(["text", "link", "image", "file", "test"]).default("text"),
  linked_card_slug: z.string().trim().max(80).optional().default(""),
  max_score: z.coerce.number().int().min(1).max(1000).default(100),
  due_at: z.number().int().nullable().optional().default(null),
  status: z.enum(["active", "closed", "archived"]).optional().default("active"),
});

const gradeSchema = z.object({
  score: z.coerce.number().int().min(0).max(1000).nullable(),
  feedback: z.string().trim().max(1500).optional().default(""),
  status: z.enum(["graded", "returned"]).default("graded"),
});

const submitSchema = z.object({
  answer_text: z.string().trim().max(10000).optional().default(""),
  answer_link: z.string().trim().max(500).optional().default(""),
  file_key: z.string().trim().max(240).optional().default(""),
  file_name: z.string().trim().max(200).optional().default(""),
  file_size: z.coerce.number().int().min(0).max(6 * 1024 * 1024).optional().default(0),
});

// --- O'QITUVCHI API (/api/v2/teacher/assignments) ---

assignmentsTeacher.get("/", async (c) => {
  const tid = c.get("principal").tenantId!;
  const items = await rows(
    c.env.DB,
    `SELECT a.*,
      g.name group_name,
      (SELECT COUNT(*) FROM students s WHERE s.tenant_id=a.tenant_id AND s.status='active' AND (a.group_id IS NULL OR s.group_id=a.group_id)) student_count,
      (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id=a.id) submitted_count,
      (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id=a.id AND sub.status='graded') graded_count
     FROM assignments a
     LEFT JOIN groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
     WHERE a.tenant_id=? AND a.status != 'archived'
     ORDER BY a.created_at DESC
     LIMIT 100`,
    tid,
  );
  const groups = await rows(
    c.env.DB,
    "SELECT id, name FROM groups WHERE tenant_id=? ORDER BY name",
    tid,
  );
  const cards = await rows(
    c.env.DB,
    "SELECT id, title, slug FROM cards WHERE tenant_id=? AND status='active' ORDER BY created_at DESC LIMIT 80",
    tid,
  );
  return c.json({ items, groups, cards });
});

assignmentsTeacher.post("/", async (c) => {
  const tid = c.get("principal").tenantId!;
  const d = await body(c, assignmentSchema);
  if (d.group_id) {
    const g = await first(c.env.DB, "SELECT id FROM groups WHERE tenant_id=? AND id=?", tid, d.group_id);
    if (!g) fail("Guruh topilmadi", 404);
  }
  const aid = id();
  const ts = now();
  await stmt(
    c.env.DB,
    `INSERT INTO assignments(id,tenant_id,group_id,title,description,kind,linked_card_slug,max_score,due_at,status,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    aid,
    tid,
    d.group_id || null,
    d.title,
    d.description,
    d.kind,
    d.linked_card_slug,
    d.max_score,
    d.due_at ?? null,
    d.status,
    ts,
    ts,
  ).run();
  notifyParentNewAssignment(c, tid, d.group_id || null, d.title, d.due_at || null);
  return c.json({ id: aid }, 201);
});

assignmentsTeacher.put("/:id", async (c) => {
  const tid = c.get("principal").tenantId!;
  const aid = c.req.param("id");
  const cur = await first(c.env.DB, "SELECT id FROM assignments WHERE tenant_id=? AND id=?", tid, aid);
  if (!cur) fail("Vazifa topilmadi", 404);
  const d = await body(c, assignmentSchema);
  if (d.group_id) {
    const g = await first(c.env.DB, "SELECT id FROM groups WHERE tenant_id=? AND id=?", tid, d.group_id);
    if (!g) fail("Guruh topilmadi", 404);
  }
  await stmt(
    c.env.DB,
    `UPDATE assignments SET group_id=?,title=?,description=?,kind=?,linked_card_slug=?,max_score=?,due_at=?,status=?,updated_at=?
     WHERE tenant_id=? AND id=?`,
    d.group_id || null,
    d.title,
    d.description,
    d.kind,
    d.linked_card_slug,
    d.max_score,
    d.due_at ?? null,
    d.status,
    now(),
    tid,
    aid,
  ).run();
  return c.json({ ok: true });
});

assignmentsTeacher.delete("/:id", async (c) => {
  const tid = c.get("principal").tenantId!;
  const aid = c.req.param("id");
  const cur = await first(c.env.DB, "SELECT id FROM assignments WHERE tenant_id=? AND id=?", tid, aid);
  if (!cur) fail("Vazifa topilmadi", 404);
  const files = await rows(
    c.env.DB,
    "SELECT file_key FROM assignment_submissions WHERE tenant_id=? AND assignment_id=? AND file_key != ''",
    tid,
    aid,
  );
  for (const f of files) {
    if (f.file_key && String(f.file_key).startsWith(`hw/${tid}/`)) {
      try { await c.env.FILES.delete(f.file_key); } catch {}
    }
  }
  await stmt(c.env.DB, "DELETE FROM assignments WHERE tenant_id=? AND id=?", tid, aid).run();
  return c.json({ ok: true });
});

assignmentsTeacher.get("/:id/submissions", async (c) => {
  const tid = c.get("principal").tenantId!;
  const aid = c.req.param("id");
  const a = await first(
    c.env.DB,
    `SELECT a.*, g.name group_name
     FROM assignments a
     LEFT JOIN groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
     WHERE a.tenant_id=? AND a.id=?`,
    tid,
    aid,
  );
  if (!a) fail("Vazifa topilmadi", 404);

  const studs = await rows(
    c.env.DB,
    `SELECT id, name, student_code, COALESCE(note,'') note
     FROM students
     WHERE tenant_id=? AND status='active' AND (? IS NULL OR group_id=?)
     ORDER BY name`,
    tid,
    a.group_id,
    a.group_id,
  );
  const subs = await rows(
    c.env.DB,
    "SELECT * FROM assignment_submissions WHERE tenant_id=? AND assignment_id=?",
    tid,
    aid,
  );
  const subMap = new Map<string, any>();
  for (const s of subs) subMap.set(s.student_id, s);

  const testScores = new Map<string, any>();
  if (a.kind === "test" && a.linked_card_slug) {
    const att = await rows(
      c.env.DB,
      `SELECT at.student_id, MAX(at.percentage) best_pct, MAX(at.submitted_at) last_at
       FROM attempts at
       JOIN cards cd ON cd.id=at.card_id AND cd.tenant_id=at.tenant_id
       WHERE at.tenant_id=? AND cd.slug=? AND at.status='submitted' AND at.student_id IS NOT NULL
       GROUP BY at.student_id`,
      tid,
      a.linked_card_slug,
    );
    for (const r of att) testScores.set(r.student_id, r);
  }

  const list = studs.map((st: any) => ({
    student: st,
    submission: subMap.get(st.id) || null,
    test_attempt: testScores.get(st.id) || null,
  }));

  return c.json({ assignment: a, items: list });
});

assignmentsTeacher.put("/:id/submissions/:subId/grade", async (c) => {
  const tid = c.get("principal").tenantId!;
  const aid = c.req.param("id");
  const subId = c.req.param("subId");
  const a = await first(c.env.DB, "SELECT title, max_score FROM assignments WHERE tenant_id=? AND id=?", tid, aid);
  if (!a) fail("Vazifa topilmadi", 404);
  const sub = await first(
    c.env.DB,
    "SELECT id, student_id FROM assignment_submissions WHERE tenant_id=? AND assignment_id=? AND id=?",
    tid,
    aid,
    subId,
  );
  if (!sub) fail("Topshiriq topilmadi", 404);
  const d = await body(c, gradeSchema);
  if (d.score !== null && d.score > a.max_score) {
    fail(`Ball maksimal balldan (${a.max_score}) oshmasligi kerak`, 400);
  }
  await stmt(
    c.env.DB,
    `UPDATE assignment_submissions SET score=?, feedback=?, status=?, graded_at=?
     WHERE tenant_id=? AND id=?`,
    d.score,
    d.feedback,
    d.status,
    now(),
    tid,
    subId,
  ).run();
  notifyParentHomeworkGraded(c, tid, sub.student_id, a.title || "Vazifa", d.score, Number(a.max_score || 100), d.feedback || "");
  return c.json({ ok: true });
});

assignmentsTeacher.post("/cleanup-files", async (c) => {
  const tid = c.get("principal").tenantId!;
  const cutoff = now() - 90 * 86400;
  const old = await rows(
    c.env.DB,
    `SELECT id, file_key FROM assignment_submissions
     WHERE tenant_id=? AND status='graded' AND file_key != '' AND COALESCE(graded_at, submitted_at) < ?
     LIMIT 200`,
    tid,
    cutoff,
  );
  let cleaned = 0;
  for (const r of old) {
    if (String(r.file_key).startsWith(`hw/${tid}/`)) {
      try { await c.env.FILES.delete(r.file_key); } catch {}
    }
    await stmt(
      c.env.DB,
      "UPDATE assignment_submissions SET file_key='', file_name='', file_size=0 WHERE tenant_id=? AND id=?",
      tid,
      r.id,
    ).run();
    cleaned++;
  }
  return c.json({ ok: true, cleaned });
});

// --- O'QUVCHI API (/api/v2/public/assignments) ---

async function findStudentByCode(db: D1Database, rawCode: string) {
  const code = rawCode.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!code || code === "__EMPTY__") return null;
  return first(
    db,
    `SELECT s.id, s.tenant_id, s.group_id, s.name, s.student_code, COALESCE(s.note,'') note, g.name group_name
     FROM students s
     LEFT JOIN groups g ON g.tenant_id=s.tenant_id AND g.id=s.group_id
     WHERE UPPER(REPLACE(s.student_code, '-', ''))=? AND s.status='active'
     LIMIT 1`,
    code,
  );
}

assignmentsPublic.get("/student/:code", async (c) => {
  const rawCode = c.req.param("code") || "";
  if (rawCode === "__empty__") return c.json({ student: null, items: [], summary: null });
  await rate(c, "student-hw", 240, 60);
  const st = await findStudentByCode(c.env.DB, rawCode);
  if (!st) fail("Bunday o‘quvchi kodi topilmadi. O‘qituvchingizdan aniq kodingizni so‘rang.", 404);

  const list = await rows(
    c.env.DB,
    `SELECT a.*, g.name group_name
     FROM assignments a
     LEFT JOIN groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
     WHERE a.tenant_id=? AND a.status != 'archived' AND (a.group_id IS NULL OR a.group_id=?)
     ORDER BY CASE WHEN a.status='active' THEN 0 ELSE 1 END, COALESCE(a.due_at, 9999999999) ASC, a.created_at DESC
     LIMIT 100`,
    st.tenant_id,
    st.group_id,
  );

  const subs = await rows(
    c.env.DB,
    "SELECT * FROM assignment_submissions WHERE tenant_id=? AND student_id=?",
    st.tenant_id,
    st.id,
  );
  const subMap = new Map<string, any>();
  for (const s of subs) subMap.set(s.assignment_id, s);

  const testSlugs = list.filter((a: any) => a.kind === "test" && a.linked_card_slug).map((a: any) => a.linked_card_slug);
  const testMap = new Map<string, any>();
  if (testSlugs.length) {
    const att = await rows(
      c.env.DB,
      `SELECT cd.slug, MAX(at.percentage) best_pct, MAX(at.submitted_at) last_at
       FROM attempts at
       JOIN cards cd ON cd.id=at.card_id AND cd.tenant_id=at.tenant_id
       WHERE at.tenant_id=? AND at.student_id=? AND at.status='submitted'
       GROUP BY cd.slug`,
      st.tenant_id,
      st.id,
    );
    for (const r of att) testMap.set(r.slug, r);
  }

  let submittedCount = 0;
  let gradedCount = 0;
  let sumPct = 0;
  let pctCount = 0;

  const items = list.map((a: any) => {
    const sub = subMap.get(a.id) || null;
    const tAtt = a.linked_card_slug ? testMap.get(a.linked_card_slug) || null : null;
    if (sub || tAtt) submittedCount++;
    if (sub && sub.status === "graded" && sub.score !== null) {
      gradedCount++;
      sumPct += (sub.score / Math.max(1, a.max_score)) * 100;
      pctCount++;
    } else if (!sub && tAtt) {
      gradedCount++;
      sumPct += Number(tAtt.best_pct || 0);
      pctCount++;
    }
    return { ...a, submission: sub, test_attempt: tAtt };
  });

  return c.json({
    student: {
      id: st.id,
      name: st.name,
      student_code: st.student_code,
      note: st.note,
      group_name: st.group_name || "Umumiy",
    },
    summary: {
      total: items.length,
      submitted: submittedCount,
      graded: gradedCount,
      pending: Math.max(0, items.length - submittedCount),
      avg_percent: pctCount ? Math.round(sumPct / pctCount) : null,
    },
    items,
  });
});

assignmentsPublic.post("/student/:code/upload", async (c) => {
  await rate(c, "hw-upload", 20, 600);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") fail("Fayl tanlanmadi", 400);

  const f = file as File;
  const maxBytes = 5 * 1024 * 1024; // 5 MB
  if (f.size <= 0) fail("Bo‘sh fayl yuklab bo‘lmaydi", 400);
  if (f.size > maxBytes) fail("Fayl hajmi 5 MB dan oshmasligi kerak", 413);

  const extMatch = /\.([a-zA-Z0-9]{2,6})$/.exec(f.name || "");
  const ext = (extMatch ? extMatch[1] : "").toLowerCase();
  const allowed: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    txt: "text/plain; charset=utf-8",
  };
  if (!allowed[ext]) {
    fail("Ruxsat etilgan formatlar: JPG, PNG, WebP, PDF, DOCX, XLSX, PPTX, ZIP, TXT", 400);
  }

  const key = `hw/${st.tenant_id}/${id()}.${ext}`;
  await c.env.FILES.put(key, await f.arrayBuffer(), {
    httpMetadata: { contentType: allowed[ext] },
  });

  return c.json({
    file_key: key,
    file_name: (f.name || `fayl.${ext}`).slice(0, 180),
    file_size: f.size,
    url: "/api/v2/media/" + key,
  });
});

assignmentsPublic.post("/student/:code/:assignmentId/submit", async (c) => {
  await rate(c, "hw-submit", 30, 600);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const aid = c.req.param("assignmentId");
  const a = await first(
    c.env.DB,
    "SELECT * FROM assignments WHERE tenant_id=? AND id=? AND (group_id IS NULL OR group_id=?)",
    st.tenant_id,
    aid,
    st.group_id,
  );
  if (!a) fail("Vazifa topilmadi", 404);
  if (a.status !== "active") fail("Ushbu vazifa yopilgan — topshirib bo‘lmaydi", 403);

  const d = await body(c, submitSchema);
  if (a.kind === "text" && !d.answer_text) fail("Javob matnini kiriting", 400);
  if (a.kind === "link" && !/^https?:\/\//i.test(d.answer_link)) fail("To‘g‘ri havola kiriting (https://...)", 400);
  if ((a.kind === "image" || a.kind === "file") && !d.file_key) fail("Avval fayl yoki rasm yuklang", 400);
  if (d.file_key && !d.file_key.startsWith(`hw/${st.tenant_id}/`)) fail("Noto‘g‘ri fayl manzili", 400);

  const ts = now();
  const subId = id();
  await stmt(
    c.env.DB,
    `INSERT INTO assignment_submissions(id,tenant_id,assignment_id,student_id,answer_text,answer_link,file_key,file_name,file_size,status,submitted_at)
     VALUES(?,?,?,?,?,?,?,?,?,'submitted',?)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET
       answer_text=excluded.answer_text,
       answer_link=excluded.answer_link,
       file_key=CASE WHEN excluded.file_key != '' THEN excluded.file_key ELSE assignment_submissions.file_key END,
       file_name=CASE WHEN excluded.file_name != '' THEN excluded.file_name ELSE assignment_submissions.file_name END,
       file_size=CASE WHEN excluded.file_size > 0 THEN excluded.file_size ELSE assignment_submissions.file_size END,
       status='submitted',
       submitted_at=excluded.submitted_at`,
    subId,
    st.tenant_id,
    aid,
    st.id,
    d.answer_text,
    d.answer_link,
    d.file_key,
    d.file_name,
    d.file_size,
    ts,
  ).run();

  return c.json({ ok: true });
});


assignmentsPublic.get("/leaderboard/:code", async (c) => {
  const rawCode = c.req.param("code") || "";
  if (rawCode === "__empty__") return c.json({ group_name: "", my_rank: null, total_students: 0, top10: [], me: null });
  await rate(c, "student-lb", 240, 60);
  const st = await findStudentByCode(c.env.DB, rawCode);
  if (!st) fail("O‘quvchi kodi topilmadi", 404);

  const peers = await rows(
    c.env.DB,
    `SELECT id, name, COALESCE(note,'') note
     FROM students
     WHERE tenant_id=? AND status='active' AND (? IS NULL OR group_id=?)
     LIMIT 120`,
    st.tenant_id,
    st.group_id,
    st.group_id,
  );

  const peerIds = peers.map((p: any) => p.id);
  if (!peerIds.length) {
    return c.json({ group_name: st.group_name || "Umumiy", my_rank: 1, total_students: 0, top10: [], me: null });
  }

  const attStats = await rows(
    c.env.DB,
    `SELECT student_id,
      COUNT(*) total_days,
      SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) good_days
     FROM attendance_records
     WHERE tenant_id=?
     GROUP BY student_id`,
    st.tenant_id,
  );
  const attMap = new Map<string, { total: number; good: number }>();
  for (const r of attStats) {
    attMap.set(r.student_id, { total: Number(r.total_days || 0), good: Number(r.good_days || 0) });
  }

  const testStats = await rows(
    c.env.DB,
    `SELECT student_id,
      COUNT(*) tests_taken,
      ROUND(AVG(percentage), 1) avg_pct
     FROM attempts
     WHERE tenant_id=? AND status='submitted' AND student_id IS NOT NULL
     GROUP BY student_id`,
    st.tenant_id,
  );
  const testMap = new Map<string, { taken: number; avg: number }>();
  for (const r of testStats) {
    testMap.set(r.student_id, { taken: Number(r.tests_taken || 0), avg: Number(r.avg_pct || 0) });
  }

  const hwStats = await rows(
    c.env.DB,
    `SELECT student_id, COUNT(*) hw_done
     FROM assignment_submissions
     WHERE tenant_id=?
     GROUP BY student_id`,
    st.tenant_id,
  );
  const hwMap = new Map<string, number>();
  for (const r of hwStats) {
    hwMap.set(r.student_id, Number(r.hw_done || 0));
  }

  const cosMap = new Map<string, { banner: string; frame: string; avatar: string; title: string }>();
  try {
    const cosRows = await rows(
      c.env.DB,
      `SELECT sc.student_id, sc.equipped_banner, sc.equipped_frame, sc.equipped_avatar, sc.equipped_title
       FROM student_cosmetics sc
       JOIN students s ON s.id = sc.student_id
       WHERE s.tenant_id=?`,
      st.tenant_id,
    );
    for (const r of cosRows) {
      cosMap.set(r.student_id, {
        banner: r.equipped_banner || "default_navy",
        frame: r.equipped_frame || "none",
        avatar: r.equipped_avatar || "initials",
        title: r.equipped_title || "",
      });
    }
  } catch {}

  const ranked = peers
    .map((p: any) => {
      const a = attMap.get(p.id) || { total: 0, good: 0 };
      const t = testMap.get(p.id) || { taken: 0, avg: 0 };
      const hw = hwMap.get(p.id) || 0;
      const attPct = a.total ? Math.round((a.good / a.total) * 100) : 0;
      const xp = Math.round(t.avg * 5 + attPct * 2 + hw * 30 + t.taken * 10);
      return {
        id: p.id,
        name: p.name,
        note: p.note,
        is_me: p.id === st.id,
        avg_test: t.taken ? t.avg : null,
        tests_taken: t.taken,
        att_pct: a.total ? attPct : null,
        hw_done: hw,
        xp,
        cosmetics: cosMap.get(p.id) || { banner: "default_navy", frame: "none", avatar: "initials", title: "" },
      };
    })
    .sort((a: any, b: any) => b.xp - a.xp || (b.avg_test || 0) - (a.avg_test || 0) || a.name.localeCompare(b.name))
    .map((row: any, idx: number) => ({ ...row, rank: idx + 1 }));

  const me = ranked.find((r: any) => r.is_me) || null;
  const custom_items = await loadCustomShopItems(c.env.DB);
  return c.json({
    custom_items,
    group_name: st.group_name || "Umumiy",
    my_rank: me?.rank || null,
    total_students: ranked.length,
    top10: ranked.slice(0, 10),
    me,
  });
});


const SHOP_ITEMS: Record<string, { slot: "banner" | "frame" | "avatar" | "title"; price: number }> = {
  default_navy: { slot: "banner", price: 0 },
  cyber_neon: { slot: "banner", price: 120 },
  emerald_matrix: { slot: "banner", price: 150 },
  solar_flare: { slot: "banner", price: 220 },
  cosmic_aurora: { slot: "banner", price: 300 },
  royal_gold: { slot: "banner", price: 450 },
  none: { slot: "frame", price: 0 },
  emerald_glow: { slot: "frame", price: 80 },
  cyber_cyan: { slot: "frame", price: 140 },
  fire_ring: { slot: "frame", price: 200 },
  galaxy_spin: { slot: "frame", price: 320 },
  gold_crown: { slot: "frame", price: 500 },
  initials: { slot: "avatar", price: 0 },
  coder: { slot: "avatar", price: 60 },
  astronaut: { slot: "avatar", price: 90 },
  ninja: { slot: "avatar", price: 120 },
  robot: { slot: "avatar", price: 150 },
  lion: { slot: "avatar", price: 180 },
  wizard: { slot: "avatar", price: 220 },
  dragon: { slot: "avatar", price: 300 },
  crown: { slot: "avatar", price: 400 },
  "": { slot: "title", price: 0 },
  kod_ustasi: { slot: "title", price: 100 },
  snayper: { slot: "title", price: 140 },
  olimpiadachi: { slot: "title", price: 220 },
  kiber_qahramon: { slot: "title", price: 280 },
  afsona: { slot: "title", price: 450 },
};

const WEEKLY_REWARDS = [5, 5, 8, 10, 12, 15, 30];

function uzTodayDate(): string {
  // Uzbekistan UTC+5
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function uzYesterdayDate(): string {
  const d = new Date(Date.now() + 5 * 3600 * 1000 - 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

function uzTodayStartSec(): number {
  const today = uzTodayDate();
  return Math.floor(new Date(today + "T00:00:00+05:00").getTime() / 1000);
}

function seedHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function loadCustomShopItems(db: any) {
  try {
    return await rows(
      db,
      "SELECT id, slot, name, description, price, rarity, image_url, title_text FROM shop_items_custom WHERE active=1 ORDER BY created_at DESC LIMIT 200",
    );
  } catch {
    return [];
  }
}

async function resolveShopItem(db: any, itemId: string): Promise<{ slot: "banner" | "frame" | "avatar" | "title"; price: number } | null> {
  if (SHOP_ITEMS[itemId]) return SHOP_ITEMS[itemId];
  try {
    const r = await first(
      db,
      "SELECT slot, price FROM shop_items_custom WHERE id=? AND active=1",
      itemId,
    );
    if (r) return { slot: r.slot, price: Number(r.price || 0) };
  } catch {}
  return null;
}

async function computeEarnedCoins(db: any, st: any) {
  const att = await first(
    db,
    `SELECT COUNT(*) total_days,
            SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) good_days
     FROM attendance_records WHERE tenant_id=? AND student_id=?`,
    st.tenant_id,
    st.id,
  );
  const attemptRows = await rows(
    db,
    `SELECT a.percentage, c.settings_json
     FROM attempts a LEFT JOIN cards c ON c.id = a.card_id
     WHERE a.tenant_id=? AND a.student_id=? AND a.status='submitted'`,
    st.tenant_id,
    st.id,
  );
  let testCoinsSum = 0;
  let pctSum = 0;
  for (const ar of attemptRows) {
    const pct = Number(ar.percentage || 0);
    pctSum += pct;
    let cfg: any = {};
    try { cfg = JSON.parse(ar.settings_json || "{}"); } catch {}
    const passed = pct >= Number(cfg.pass_percent ?? 70);
    const custom = Number(cfg.reward_coins || 0);
    if (passed && custom > 0) {
      testCoinsSum += custom;
    } else {
      const base = pct >= 100 ? 40 : pct >= 90 ? 30 : pct >= 70 ? 20 : 10;
      const mult = Number(cfg.mix?.hard || 0) >= 50 ? 1.5 : Number(cfg.mix?.medium || 0) >= 50 ? 1.25 : 1;
      testCoinsSum += Math.round(base * mult);
    }
  }
  const tst = {
    tests_taken: attemptRows.length,
    avg_pct: attemptRows.length ? Math.round((pctSum / attemptRows.length) * 10) / 10 : 0,
    test_coins: testCoinsSum,
  };
  const hw = await first(
    db,
    `SELECT COUNT(*) hw_done,
            SUM(CASE WHEN s.status='graded' AND a.max_score > 0 AND (s.score * 100.0 / a.max_score) >= 80 THEN 35 ELSE 20 END) hw_coins
     FROM assignment_submissions s
     LEFT JOIN assignments a ON a.id = s.assignment_id
     WHERE s.tenant_id=? AND s.student_id=?`,
    st.tenant_id,
    st.id,
  );
  const totalDays = Number(att?.total_days || 0);
  const goodDays = Number(att?.good_days || 0);
  const attPct = totalDays ? Math.round((goodDays / totalDays) * 100) : 0;
  const taken = Number(tst?.tests_taken || 0);
  const avg = Number(tst?.avg_pct || 0);
  const hwDone = Number(hw?.hw_done || 0);
  const xp = Math.round(avg * 5 + attPct * 2 + hwDone * 30 + taken * 10);
  // Strictly merit-based: 0 coins if student hasn't completed tests or homework!
  const testCoins = Number(tst?.test_coins || 0);
  const hwCoins = Number(hw?.hw_coins || 0);
  const baseEarned = testCoins + hwCoins;
  return { xp, baseEarned };
}

async function getCosmeticsRow(db: any, studentId: string) {
  try {
    const r = await first(
      db,
      "SELECT * FROM student_cosmetics WHERE student_id=?",
      studentId,
    );
    if (r) {
      let owned: string[] = [];
      let dq: { date?: string; claimed?: string[]; practice_done_date?: string; book_done_date?: string; game_done_date?: string } = {};
      try { owned = JSON.parse(r.owned_json || "[]"); } catch {}
      try { dq = JSON.parse(r.daily_quests_json || "{}"); } catch {}
      return {
        equipped: {
          banner: r.equipped_banner || "default_navy",
          frame: r.equipped_frame || "none",
          avatar: r.equipped_avatar || "initials",
          title: r.equipped_title || "",
        },
        owned,
        spent_coins: Number(r.spent_coins || 0),
        bonus_coins: Number(r.bonus_coins || 0),
        streak_days: Number(r.streak_days || 0),
        last_checkin_date: String(r.last_checkin_date || ""),
        daily_quests: dq,
      };
    }
  } catch {}
  return {
    equipped: { banner: "default_navy", frame: "none", avatar: "initials", title: "" },
    owned: [] as string[],
    spent_coins: 0,
    bonus_coins: 0,
    streak_days: 0,
    last_checkin_date: "",
    daily_quests: {} as { date?: string; claimed?: string[]; practice_done_date?: string; book_done_date?: string; game_done_date?: string },
  };
}

// Build 3 personalized daily random quests based on student's teacher/group direction + global DB
async function buildDailyQuests(db: any, st: any, cos: any) {
  const today = uzTodayDate();
  const todayStart = uzTodayStartSec();
  const claimed: string[] = cos.daily_quests?.date === today ? (cos.daily_quests?.claimed || []) : [];
  const seed = seedHash(`${st.id}:${today}`);

  // Detect student's primary subject/direction from group name, teacher's question categories, and cards
  const groupHint = String(st.group_name || "").toLowerCase();
  let topCat = "";
  try {
    const catRow = await first(
      db,
      `SELECT category, COUNT(*) cnt FROM questions WHERE tenant_id=? AND category != '' GROUP BY category ORDER BY cnt DESC LIMIT 1`,
      st.tenant_id,
    );
    topCat = String(catRow?.category || "");
  } catch {}

  // Check if student completed a test today
  let testsToday = 0;
  try {
    const tRow = await first(
      db,
      `SELECT COUNT(*) cnt FROM attempts WHERE tenant_id=? AND student_id=? AND status='submitted' AND submitted_at>=?`,
      st.tenant_id,
      st.id,
      todayStart,
    );
    testsToday = Number(tRow?.cnt || 0);
  } catch {}

  // Pick a relevant active test card (teacher's active cards first, else public practice)
  let pickedCard: any = null;
  try {
    const teacherCards = await rows(
      db,
      `SELECT slug, title, category FROM cards WHERE tenant_id=? AND status='active' ORDER BY created_at DESC LIMIT 12`,
      st.tenant_id,
    );
    if (teacherCards.length) {
      pickedCard = teacherCards[seed % teacherCards.length];
    }
  } catch {}

  // Pick a relevant library book matching teacher/group direction or random approved book
  let pickedBook: any = null;
  try {
    const books = await rows(
      db,
      `SELECT id, title, subject FROM library_books WHERE status='approved' OR tenant_id=? ORDER BY created_at DESC LIMIT 20`,
      st.tenant_id,
    );
    if (books.length) {
      const matched = books.filter((b: any) => {
        const sub = String(b.subject || b.title || "").toLowerCase();
        return (
          (topCat && sub.includes(topCat.toLowerCase().slice(0, 4))) ||
          (groupHint.includes("it") && (sub.includes("kompyuter") || sub.includes("excel") || sub.includes("kiber") || sub.includes("it")))
        );
      });
      const pool = matched.length ? matched : books;
      pickedBook = pool[(seed >>> 3) % pool.length];
    }
  } catch {}

  // Pick a game from games hub (if any published)
  let pickedGame: any = null;
  try {
    const games = await rows(
      db,
      `SELECT id, title FROM games WHERE status='published' ORDER BY sort_order ASC, created_at DESC LIMIT 12`,
    );
    if (games.length) {
      pickedGame = games[(seed >>> 5) % games.length];
    }
  } catch {}

  const subjectLabel = topCat || st.group_name || "Yo‘nalishingiz";
  const quests = [
    {
      id: "q_test",
      icon: "🎯",
      title: pickedCard
        ? `«${pickedCard.title}» testini yeching`
        : `${subjectLabel} bo‘yicha kamida 5 ta test yeching`,
      desc: pickedCard
        ? "O‘qituvchingiz bazasidan bugungi tanlangan test"
        : "Ochiq mashq testlaridan yo‘nalishingizga mos savollar",
      reward: 25,
      link: pickedCard ? `/t/${encodeURIComponent(pickedCard.slug)}` : "/practice",
      link_label: "Testga o‘tish",
      auto_done: testsToday > 0 || cos.daily_quests?.practice_done_date === today,
      claimed: claimed.includes("q_test"),
    },
    {
      id: "q_book",
      icon: "📖",
      title: pickedBook
        ? `«${pickedBook.title}» kitobidan 1 bob o‘qing`
        : "Kutubxonadan 1 ta foydali bob o‘qing",
      desc: "Yo‘nalishingizga mos raqamli kutubxona topshirig‘i",
      reward: 10,
      link: pickedBook ? `/library/${encodeURIComponent(pickedBook.id)}` : "/library",
      link_label: "Kitobni ochish",
      auto_done: cos.daily_quests?.book_done_date === today,
      claimed: claimed.includes("q_book"),
    },
    {
      id: "q_game",
      icon: "🎮",
      title: pickedGame
        ? `«${pickedGame.title}» o‘yinida 1 raund o‘ynang`
        : "O‘yinlar markazida bilim bellashuvini sinab ko‘ring",
      desc: "Tezkor fikrlash va xotirani mustahkamlash uchun o‘yin topshirig‘i",
      reward: 15,
      link: pickedGame ? `/games/${encodeURIComponent(pickedGame.id)}` : "/games",
      link_label: "O‘yinga kirish",
      auto_done: cos.daily_quests?.game_done_date === today,
      claimed: claimed.includes("q_game"),
    },
  ];

  return { today, subject_label: subjectLabel, quests };
}

assignmentsPublic.get("/shop/:code", async (c) => {
  const rawCode = c.req.param("code") || "";
  if (rawCode === "__empty__") {
    return c.json({
      xp: 0,
      earned_coins: 0,
      spent_coins: 0,
      balance: 0,
      equipped: { banner: "default_navy", frame: "none", avatar: "initials", title: "" },
      owned: [],
      streak_days: 0,
      checked_in_today: false,
      next_reward: WEEKLY_REWARDS[0],
      daily_quests: [],
      subject_label: "",
    });
  }
  await rate(c, "student-shop", 240, 60);
  const st = await findStudentByCode(c.env.DB, rawCode);
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const { xp, baseEarned } = await computeEarnedCoins(c.env.DB, st);
  const cos = await getCosmeticsRow(c.env.DB, st.id);
  const today = uzTodayDate();
  const yesterday = uzYesterdayDate();
  const checkedInToday = cos.last_checkin_date === today;
  const effectiveStreak =
    checkedInToday || cos.last_checkin_date === yesterday ? cos.streak_days : 0;
  const nextDayIdx = checkedInToday ? (effectiveStreak - 1) % 7 : effectiveStreak % 7;
  const earnedTotal = baseEarned + cos.bonus_coins;
  const dq = await buildDailyQuests(c.env.DB, st, cos);
  const custom_items = await loadCustomShopItems(c.env.DB);

  return c.json({
    custom_items,
    xp,
    earned_coins: earnedTotal,
    spent_coins: cos.spent_coins,
    balance: Math.max(0, earnedTotal - cos.spent_coins),
    equipped: cos.equipped,
    owned: cos.owned,
    streak_days: effectiveStreak,
    checked_in_today: checkedInToday,
    next_reward: WEEKLY_REWARDS[nextDayIdx],
    daily_quests: dq.quests,
    subject_label: dq.subject_label,
  });
});

assignmentsPublic.post("/shop/:code/checkin", async (c) => {
  await rate(c, "student-checkin", 120, 60);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const cos = await getCosmeticsRow(c.env.DB, st.id);
  const today = uzTodayDate();
  const yesterday = uzYesterdayDate();
  if (cos.last_checkin_date === today) {
    fail("Bugungi kunlik sovg‘ani allaqachon olgansiz", 400);
  }
  const nextStreak = cos.last_checkin_date === yesterday ? cos.streak_days + 1 : 1;
  const dayIdx = (nextStreak - 1) % 7;
  const reward = WEEKLY_REWARDS[dayIdx];
  const nextBonus = cos.bonus_coins + reward;

  await stmt(
    c.env.DB,
    `INSERT INTO student_cosmetics
      (student_id, equipped_banner, equipped_frame, equipped_avatar, equipped_title, owned_json, spent_coins, bonus_coins, streak_days, last_checkin_date, daily_quests_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
      bonus_coins=excluded.bonus_coins,
      streak_days=excluded.streak_days,
      last_checkin_date=excluded.last_checkin_date,
      updated_at=excluded.updated_at`,
    st.id,
    cos.equipped.banner,
    cos.equipped.frame,
    cos.equipped.avatar,
    cos.equipped.title,
    JSON.stringify(cos.owned),
    cos.spent_coins,
    nextBonus,
    nextStreak,
    today,
    JSON.stringify(cos.daily_quests || {}),
    now(),
  ).run();

  return c.json({ ok: true, reward, streak_days: nextStreak });
});

assignmentsPublic.post("/shop/:code/quest-visit", async (c) => {
  await rate(c, "student-quest", 180, 60);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const d = await body(c, z.object({ quest_id: z.enum(["q_book", "q_game"]) }).strict());
  const cos = await getCosmeticsRow(c.env.DB, st.id);
  const today = uzTodayDate();
  const nextDq: any = { ...(cos.daily_quests || {}) };
  if (d.quest_id === "q_book") nextDq.book_done_date = today;
  if (d.quest_id === "q_game") nextDq.game_done_date = today;
  await stmt(
    c.env.DB,
    `INSERT INTO student_cosmetics
      (student_id, equipped_banner, equipped_frame, equipped_avatar, equipped_title, owned_json, spent_coins, bonus_coins, streak_days, last_checkin_date, daily_quests_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET daily_quests_json=excluded.daily_quests_json, updated_at=excluded.updated_at`,
    st.id,
    cos.equipped.banner,
    cos.equipped.frame,
    cos.equipped.avatar,
    cos.equipped.title,
    JSON.stringify(cos.owned),
    cos.spent_coins,
    cos.bonus_coins,
    cos.streak_days,
    cos.last_checkin_date,
    JSON.stringify(nextDq),
    now(),
  ).run();
  return c.json({ ok: true });
});

assignmentsPublic.post("/shop/:code/quest-claim", async (c) => {
  await rate(c, "student-quest", 120, 60);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const d = await body(c, z.object({ quest_id: z.enum(["q_test", "q_book", "q_game"]) }).strict());
  const cos = await getCosmeticsRow(c.env.DB, st.id);
  const today = uzTodayDate();
  const prevClaimed: string[] = cos.daily_quests?.date === today ? (cos.daily_quests?.claimed || []) : [];
  if (prevClaimed.includes(d.quest_id)) {
    fail("Bu quest mukofotini bugun allaqachon olgansiz", 400);
  }
  if (d.quest_id === "q_test") {
    const tRow = await first(
      c.env.DB,
      `SELECT COUNT(*) cnt FROM attempts WHERE tenant_id=? AND student_id=? AND status='submitted' AND submitted_at>=?`,
      st.tenant_id,
      st.id,
      uzTodayStartSec(),
    );
    const practicedToday = cos.daily_quests?.practice_done_date === today;
    if (!Number(tRow?.cnt || 0) && !practicedToday) {
      fail("Avval bugun kamida 1 ta test yechib yakunlang!", 400);
    }
  }
  if (d.quest_id === "q_book" && cos.daily_quests?.book_done_date !== today) {
    fail("Avval «Kitobni ochish ↗» orqali kitobga kirib o‘qing!", 400);
  }
  if (d.quest_id === "q_game" && cos.daily_quests?.game_done_date !== today) {
    fail("Avval «O‘yinga kirish ↗» orqali o‘yinga kirib o‘ynang!", 400);
  }
  const rewardsMap: Record<string, number> = { q_test: 25, q_book: 10, q_game: 15 };
  const reward = rewardsMap[d.quest_id] || 30;
  const nextDq = { date: today, claimed: [...prevClaimed, d.quest_id] };
  const nextBonus = cos.bonus_coins + reward;

  await stmt(
    c.env.DB,
    `INSERT INTO student_cosmetics
      (student_id, equipped_banner, equipped_frame, equipped_avatar, equipped_title, owned_json, spent_coins, bonus_coins, streak_days, last_checkin_date, daily_quests_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
      bonus_coins=excluded.bonus_coins,
      daily_quests_json=excluded.daily_quests_json,
      updated_at=excluded.updated_at`,
    st.id,
    cos.equipped.banner,
    cos.equipped.frame,
    cos.equipped.avatar,
    cos.equipped.title,
    JSON.stringify(cos.owned),
    cos.spent_coins,
    nextBonus,
    cos.streak_days,
    cos.last_checkin_date,
    JSON.stringify(nextDq),
    now(),
  ).run();

  return c.json({ ok: true, reward, quest_id: d.quest_id });
});

assignmentsPublic.post("/shop/:code/buy", async (c) => {
  await rate(c, "student-shop-buy", 120, 60);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const d = await body(c, z.object({ item_id: z.string().max(64) }).strict());
  const item = await resolveShopItem(c.env.DB, d.item_id);
  if (!item) fail("Do‘konda bunday buyum topilmadi", 404);

  const { xp, baseEarned } = await computeEarnedCoins(c.env.DB, st);
  const cos = await getCosmeticsRow(c.env.DB, st.id);
  const earnedTotal = baseEarned + cos.bonus_coins;
  const alreadyOwned = item.price === 0 || cos.owned.includes(d.item_id);
  const balance = Math.max(0, earnedTotal - cos.spent_coins);

  if (!alreadyOwned && balance < item.price) {
    fail(`Bilim Coin yetarli emas (kerak: ${item.price}, sizda: ${balance})`, 400);
  }

  const nextOwned = alreadyOwned ? cos.owned : [...cos.owned, d.item_id];
  const nextSpent = alreadyOwned ? cos.spent_coins : cos.spent_coins + item.price;
  const nextEq = { ...cos.equipped, [item.slot]: d.item_id };

  await stmt(
    c.env.DB,
    `INSERT INTO student_cosmetics
      (student_id, equipped_banner, equipped_frame, equipped_avatar, equipped_title, owned_json, spent_coins, bonus_coins, streak_days, last_checkin_date, daily_quests_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
      equipped_banner=excluded.equipped_banner,
      equipped_frame=excluded.equipped_frame,
      equipped_avatar=excluded.equipped_avatar,
      equipped_title=excluded.equipped_title,
      owned_json=excluded.owned_json,
      spent_coins=excluded.spent_coins,
      updated_at=excluded.updated_at`,
    st.id,
    nextEq.banner,
    nextEq.frame,
    nextEq.avatar,
    nextEq.title,
    JSON.stringify(nextOwned),
    nextSpent,
    cos.bonus_coins,
    cos.streak_days,
    cos.last_checkin_date,
    JSON.stringify(cos.daily_quests || {}),
    now(),
  ).run();

  return c.json({
    ok: true,
    xp,
    earned_coins: earnedTotal,
    spent_coins: nextSpent,
    balance: Math.max(0, earnedTotal - nextSpent),
    equipped: nextEq,
    owned: nextOwned,
  });
});

assignmentsPublic.post("/shop/:code/equip", async (c) => {
  await rate(c, "student-shop-equip", 120, 60);
  const st = await findStudentByCode(c.env.DB, c.req.param("code") || "");
  if (!st) fail("O‘quvchi kodi topilmadi", 404);
  const d = await body(
    c,
    z.object({
      slot: z.enum(["banner", "frame", "avatar", "title"]),
      item_id: z.string().max(64),
    }).strict(),
  );
  const item = await resolveShopItem(c.env.DB, d.item_id);
  if (!item || item.slot !== d.slot) fail("Buyum noto‘g‘ri tanlandi", 400);

  const { xp, baseEarned } = await computeEarnedCoins(c.env.DB, st);
  const cos = await getCosmeticsRow(c.env.DB, st.id);
  const earnedTotal = baseEarned + cos.bonus_coins;
  if (item.price > 0 && !cos.owned.includes(d.item_id)) {
    fail("Avval ushbu buyumni sotib oling", 403);
  }
  const nextEq = { ...cos.equipped, [d.slot]: d.item_id };

  await stmt(
    c.env.DB,
    `INSERT INTO student_cosmetics
      (student_id, equipped_banner, equipped_frame, equipped_avatar, equipped_title, owned_json, spent_coins, bonus_coins, streak_days, last_checkin_date, daily_quests_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET
      equipped_banner=excluded.equipped_banner,
      equipped_frame=excluded.equipped_frame,
      equipped_avatar=excluded.equipped_avatar,
      equipped_title=excluded.equipped_title,
      updated_at=excluded.updated_at`,
    st.id,
    nextEq.banner,
    nextEq.frame,
    nextEq.avatar,
    nextEq.title,
    JSON.stringify(cos.owned),
    cos.spent_coins,
    cos.bonus_coins,
    cos.streak_days,
    cos.last_checkin_date,
    JSON.stringify(cos.daily_quests || {}),
    now(),
  ).run();

  return c.json({
    ok: true,
    xp,
    earned_coins: earnedTotal,
    spent_coins: cos.spent_coins,
    balance: Math.max(0, earnedTotal - cos.spent_coins),
    equipped: nextEq,
    owned: cos.owned,
  });
});
