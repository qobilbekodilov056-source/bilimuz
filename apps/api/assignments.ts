import { Hono } from "hono";
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
  const a = await first(c.env.DB, "SELECT max_score FROM assignments WHERE tenant_id=? AND id=?", tid, aid);
  if (!a) fail("Vazifa topilmadi", 404);
  const sub = await first(
    c.env.DB,
    "SELECT id FROM assignment_submissions WHERE tenant_id=? AND assignment_id=? AND id=?",
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
  await rate(c, "student-hw", 60, 60);
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
  await rate(c, "student-lb", 60, 60);
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
      };
    })
    .sort((a: any, b: any) => b.xp - a.xp || (b.avg_test || 0) - (a.avg_test || 0) || a.name.localeCompare(b.name))
    .map((row: any, idx: number) => ({ ...row, rank: idx + 1 }));

  const me = ranked.find((r: any) => r.is_me) || null;
  return c.json({
    group_name: st.group_name || "Umumiy",
    my_rank: me?.rank || null,
    total_students: ranked.length,
    top10: ranked.slice(0, 10),
    me,
  });
});
