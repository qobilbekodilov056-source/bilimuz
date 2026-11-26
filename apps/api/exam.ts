function calcAttemptCoins(pct: number, passed: boolean, s: any): number {
  const custom = Number(s?.reward_coins || 0);
  if (passed && custom > 0) return custom;
  const base = pct >= 100 ? 40 : pct >= 90 ? 30 : pct >= 70 ? 20 : 10;
  const mult = Number(s?.mix?.hard || 0) >= 50 ? 1.5 : Number(s?.mix?.medium || 0) >= 50 ? 1.25 : 1;
  return Math.round(base * mult);
}
import { Hono } from "hono";
import { notifyParentExamResult } from "./tgbot";
import { z } from "zod";
import {
  answerSchema,
  type CardSettings,
  type Question,
} from "../../packages/shared/schema";
import type { AppEnv, Bindings, Ctx, Row } from "./types";
import {
  body,
  digest,
  fail,
  first,
  id,
  json,
  now,
  paging,
  passwordVerify,
  rate,
  rows,
  scoped,
  stmt,
} from "./core";
import { portions } from "./teacher";
import { csvSafe, makeXlsx, toCsv } from "./spreadsheet";

function shuffle<T>(array: T[]): T[] {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    let n: number;
    const range = Math.floor(0x100000000 / (i + 1)) * (i + 1);
    do {
      n = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (n >= range);
    const j = n % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function publicCard(r: Row) {
  const s = JSON.parse(r.settings_json);
  return {
    slug: r.slug,
    title: r.title,
    description: s.description,
    reward: s.reward || "",
    reward_coins: Number(s.reward_coins || 0),
    price_uzs: Number(r.price_uzs || 0),
    category: s.category,
    question_count: s.question_count,
    duration_minutes: s.duration_minutes,
    pass_percent: s.pass_percent,
    access_mode: s.access_mode,
    roster_required: !!r.group_id,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    status: r.status,
    show_results: s.show_results,
    show_leaderboard: s.show_leaderboard,
    anti_cheat: s.anti_cheat || "monitor",
    max_violations: Number(s.max_violations ?? 3),
    require_fullscreen: !!s.require_fullscreen,
  };
}
async function getPublicCard(c: Ctx) {
  const raw = (c.req.param("slug") || "").trim();
  const m = /^([A-Za-z]{2})[\s-]?(\d{5})$/.exec(raw);
  const slug = m ? `${m[1].toUpperCase()}-${m[2]}` : raw;
  const r = await first(
    c.env.DB,
    "SELECT c.* FROM cards c JOIN tenants t ON t.id=c.tenant_id WHERE c.slug=? AND c.status IN ('active','closed') AND t.status='active'",
    slug,
  );
  if (!r) fail("Test topilmadi", 404);
  return r;
}
async function requireAttempt(c: Ctx) {
  const raw = c.req.header("x-attempt-token") || "";
  if (raw.length < 43 || raw.length > 128) fail("Test sessiyasi kerak", 401);
  const a = await first(
    c.env.DB,
    "SELECT a.*,r.settings_json FROM attempts a JOIN card_releases r ON r.tenant_id=a.tenant_id AND r.card_id=a.card_id AND r.version=a.card_version JOIN tenants t ON t.id=a.tenant_id WHERE a.id=? AND a.token_hash=? AND t.status='active'",
    c.req.param("id"),
    await digest(raw + ":attempt"),
  );
  if (!a) fail("Test sessiyasi yaroqsiz", 401);
  return a;
}
const joinedQuestions = (db: D1Database, tid: string, aid: string) =>
  rows(
    db,
    `SELECT aq.position,aq.question_version_id,aq.option_order_json,v.content_json,aa.selected_json,aa.revision,aa.active_time_ms,aa.is_correct,aa.earned_points
 FROM attempt_questions aq JOIN question_versions v ON v.tenant_id=aq.tenant_id AND v.id=aq.question_version_id
 JOIN attempt_answers aa ON aa.tenant_id=aq.tenant_id AND aa.attempt_id=aq.attempt_id AND aa.position=aq.position
 WHERE aq.tenant_id=? AND aq.attempt_id=? ORDER BY aq.position`,
    tid,
    aid,
  );
export async function finalize(env: Bindings, tid: string, aid: string) {
  const tick = now();
  const same = `json_array_length(selected_json)>0 AND json_array_length(selected_json)=json_array_length(json_extract(v.content_json,'$.correct')) AND NOT EXISTS(SELECT 1 FROM json_each(selected_json) ans WHERE ans.value NOT IN (SELECT value FROM json_each(json_extract(v.content_json,'$.correct'))))`;
  await env.DB.batch([
    stmt(
      env.DB,
      `UPDATE attempt_answers SET is_correct=(SELECT CASE WHEN ${same} THEN 1 ELSE 0 END FROM attempt_questions aq JOIN question_versions v ON v.tenant_id=aq.tenant_id AND v.id=aq.question_version_id WHERE aq.tenant_id=attempt_answers.tenant_id AND aq.attempt_id=attempt_answers.attempt_id AND aq.position=attempt_answers.position),
  earned_points=(SELECT CASE WHEN ${same} THEN CAST(json_extract(v.content_json,'$.points') AS REAL) ELSE 0 END FROM attempt_questions aq JOIN question_versions v ON v.tenant_id=aq.tenant_id AND v.id=aq.question_version_id WHERE aq.tenant_id=attempt_answers.tenant_id AND aq.attempt_id=attempt_answers.attempt_id AND aq.position=attempt_answers.position)
  WHERE tenant_id=? AND attempt_id=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.tenant_id=? AND a.id=? AND a.status='active')`,
      tid,
      aid,
      tid,
      aid,
    ),
    stmt(
      env.DB,
      `UPDATE attempts SET status='submitted',submitted_at=MIN(?,expires_at),
  score=(SELECT COALESCE(SUM(earned_points),0) FROM attempt_answers WHERE tenant_id=? AND attempt_id=?),
  max_score=(SELECT SUM(CAST(json_extract(v.content_json,'$.points') AS REAL)) FROM attempt_questions aq JOIN question_versions v ON v.tenant_id=aq.tenant_id AND v.id=aq.question_version_id WHERE aq.tenant_id=? AND aq.attempt_id=?),
  correct_count=(SELECT COALESCE(SUM(is_correct),0) FROM attempt_answers WHERE tenant_id=? AND attempt_id=?),
  incorrect_count=(SELECT COUNT(*) FROM attempt_answers WHERE tenant_id=? AND attempt_id=? AND json_array_length(selected_json)>0 AND is_correct=0),
  unanswered_count=(SELECT COUNT(*) FROM attempt_answers WHERE tenant_id=? AND attempt_id=? AND json_array_length(selected_json)=0)
  WHERE tenant_id=? AND id=? AND status='active'`,
      tick,
      tid,
      aid,
      tid,
      aid,
      tid,
      aid,
      tid,
      aid,
      tid,
      aid,
      tid,
      aid,
    ),
    stmt(
      env.DB,
      "UPDATE attempts SET percentage=CASE WHEN max_score>0 THEN ROUND(score*100.0/max_score,2) ELSE 0 END WHERE tenant_id=? AND id=? AND status='submitted'",
      tid,
      aid,
    ),
  ]);
  return first(
    env.DB,
    "SELECT * FROM attempts WHERE tenant_id=? AND id=?",
    tid,
    aid,
  );
}
export async function finalizeExpired(
  env: Bindings,
  tid?: string,
  cid?: string,
) {
  const clauses = ["status='active'", "expires_at<=?"],
    args: unknown[] = [now()];
  if (tid) {
    clauses.push("tenant_id=?");
    args.push(tid);
  }
  if (cid) {
    clauses.push("card_id=?");
    args.push(cid);
  }
  const expired = await rows(
    env.DB,
    `SELECT tenant_id,id FROM attempts WHERE ${clauses.join(" AND ")} ORDER BY expires_at LIMIT 8`,
    ...args,
  );
  for (const a of expired) await finalize(env, a.tenant_id, a.id);
  return expired.length;
}
async function maybeFinalize(c: Ctx, a: Row) {
  if (a.status === "active" && now() >= a.expires_at) {
    const updated = await finalize(c.env, a.tenant_id, a.id);
    return { ...a, ...updated };
  }
  return a;
}
export const exam = new Hono<AppEnv>();
exam.get("/cards/:slug", async (c) =>
  c.json({ card: publicCard(await getPublicCard(c)), server_time: now() }),
);
exam.post("/cards/:slug/attempts", async (c) => {
  await rate(c, "exam-start", 300, 60);
  const d = await body(
    c,
    z
      .object({
        name: z.string().trim().max(120).default(""),
        student_code: z.string().trim().max(64).default(""),
        pin: z.string().max(32).default(""),
        resume_key: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
      })
      .strict(),
  );
  const card = await getPublicCard(c);
  const s = JSON.parse(card.settings_json) as CardSettings;
  const startHash = await digest(d.resume_key + ":start");
  const previous = await first(
    c.env.DB,
    "SELECT id,card_id,started_at,expires_at FROM attempts WHERE start_key_hash=?",
    startHash,
  );
  if (previous) {
    if (previous.card_id !== card.id)
      fail("Sessiya boshqa kartaga tegishli", 409);
    return c.json(
      {
        attempt_id: previous.id,
        started_at: previous.started_at,
        expires_at: previous.expires_at,
        replayed: true,
      },
      200,
    );
  }
  if (card.status !== "active") fail("Test hozir faol emas", 403);
  const tick = now();
  if (s.starts_at && tick < s.starts_at) fail("Test hali boshlanmagan", 403);
  if (s.ends_at && tick >= s.ends_at) fail("Test muddati tugagan", 403);
  if (s.access_mode === "pin" && !(await passwordVerify(d.pin, card.pin_hash)))
    fail("PIN noto‘g‘ri", 403);
  let student: Row | null = null;
  const cleanCode = d.student_code.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (cleanCode)
    student = await first(
      c.env.DB,
      "SELECT id,name,group_id FROM students WHERE tenant_id=? AND (UPPER(REPLACE(REPLACE(student_code,'-',''),' ',''))=? OR UPPER(student_code)=?) AND status='active'",
      card.tenant_id,
      cleanCode,
      d.student_code.trim().toUpperCase(),
    );
  if (
    (cleanCode && !student) ||
    (card.group_id && (!student || student.group_id !== card.group_id))
  )
    fail("O‘quvchi kodi yoki guruh mos kelmadi", 403);
  if (!student && d.name.trim().length < 2)
    fail("Ism va familiyangizni kiriting", 422);
  const name = student?.name || d.name.replace(/\s+/g, " ");
  const identity = await digest(
    student
      ? "student:" + student.id
      : "guest:" + name.normalize("NFKC").toLowerCase(),
  );
  await rate(c, "exam-identity", 10, 60, card.id + identity);
  const candidates = await rows(
    c.env.DB,
    "SELECT cq.position,v.id version_id,json_extract(v.content_json,'$.level') level FROM card_questions cq JOIN question_versions v ON v.tenant_id=cq.tenant_id AND v.id=cq.question_version_id WHERE cq.tenant_id=? AND cq.card_id=? AND cq.card_version=? ORDER BY cq.position",
    card.tenant_id,
    card.id,
    card.published_version,
  );
  let chosen: Row[] = [];
  if (s.mode === "manual") chosen = candidates;
  else
    for (const [level, n] of Object.entries(portions(s))) {
      const pool = candidates.filter((x) => x.level === level);
      if (pool.length < n) fail("Karta savollari yetarli emas", 409);
      chosen.push(...shuffle(pool).slice(0, n));
    }
  if (s.random_order) chosen = shuffle(chosen);
  if (chosen.length !== s.question_count)
    fail("Karta versiyasi to‘liq emas", 409);
  const contents = await rows(
    c.env.DB,
    "SELECT id,content_json FROM question_versions WHERE tenant_id=? AND id IN (SELECT value FROM json_each(?))",
    card.tenant_id,
    json(chosen.map((r) => r.version_id)),
  );
  const byId = new Map(contents.map((r) => [r.id, r.content_json]));
  const data = chosen.map((r, i) => {
    const q = JSON.parse(byId.get(r.version_id)!) as Question;
    const order = q.options.map((x) => x.id);
    return {
      position: i + 1,
      version: r.version_id,
      order: s.shuffle_options ? shuffle(order) : order,
    };
  });
  const aid = id(),
    expires = Math.min(
      tick + s.duration_minutes * 60,
      s.ends_at || Number.MAX_SAFE_INTEGER,
    );
  try {
    await c.env.DB.batch([
      stmt(
        c.env.DB,
        "INSERT INTO attempts(id,tenant_id,card_id,card_version,student_id,student_name,identity_hash,token_hash,start_key_hash,started_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        aid,
        card.tenant_id,
        card.id,
        card.published_version,
        student?.id || null,
        name,
        identity,
        await digest(d.resume_key + ":attempt"),
        startHash,
        tick,
        expires,
      ),
      stmt(
        c.env.DB,
        "INSERT INTO attempt_questions SELECT ?,?,json_extract(value,'$.position'),json_extract(value,'$.version'),json_extract(value,'$.order') FROM json_each(?)",
        card.tenant_id,
        aid,
        json(data),
      ),
      stmt(
        c.env.DB,
        "INSERT INTO attempt_answers(tenant_id,attempt_id,position) SELECT tenant_id,attempt_id,position FROM attempt_questions WHERE tenant_id=? AND attempt_id=?",
        card.tenant_id,
        aid,
      ),
    ]);
  } catch (error) {
    const existing = await first(
      c.env.DB,
      "SELECT id,started_at,expires_at FROM attempts WHERE start_key_hash=? AND tenant_id=? AND card_id=?",
      startHash,
      card.tenant_id,
      card.id,
    );
    if (existing)
      return c.json({
        attempt_id: existing.id,
        started_at: existing.started_at,
        expires_at: existing.expires_at,
        replayed: true,
      });
    throw error;
  }
  return c.json(
    { attempt_id: aid, started_at: tick, expires_at: expires },
    201,
  );
});
exam.get("/attempts/:id", async (c) => {
  const a = await maybeFinalize(c, await requireAttempt(c));
  const card = await first(
    c.env.DB,
    "SELECT * FROM cards WHERE tenant_id=? AND id=?",
    a.tenant_id,
    a.card_id,
  );
  const questions = await joinedQuestions(c.env.DB, a.tenant_id, a.id);
  return c.json({
    attempt: {
      id: a.id,
      student_name: a.student_name,
      status: a.status,
      started_at: a.started_at,
      expires_at: a.expires_at,
      submitted_at: a.submitted_at,
      violations_count: Number(a.violations_count || 0),
      away_seconds: Number(a.away_seconds || 0),
      auto_submitted: !!a.auto_submitted,
      multi_screen: !!a.multi_screen,
    },
    card: publicCard({ ...card!, settings_json: a.settings_json }),
    server_time: now(),
    questions: questions.map((r) => {
      const {
        correct: _correct,
        explanation: _explanation,
        ...q
      } = JSON.parse(r.content_json) as Question;
      const order = JSON.parse(r.option_order_json) as string[];
      return {
        ...q,
        options: order.map((optionId) =>
          q.options.find((o) => o.id === optionId)!,
        ),
        position: r.position,
        answer: JSON.parse(r.selected_json),
        revision: r.revision,
        active_time_ms: r.active_time_ms,
      };
    }),
  });
});
exam.put("/attempts/:id/answers", async (c) => {
  const a = await maybeFinalize(c, await requireAttempt(c));
  if (a.status !== "active") fail("Test yakunlangan", 409);
  await rate(c, "answers", 90, 60, a.id);
  const d = await body(c, answerSchema);
  if (new Set(d.answers.map((x) => x.position)).size !== d.answers.length)
    fail("Javob pozitsiyasi takrorlangan");
  const qs = await joinedQuestions(c.env.DB, a.tenant_id, a.id);
  for (const x of d.answers) {
    const r = qs.find((q) => q.position === x.position);
    if (!r) fail("Savol topilmadi", 404);
    const q = JSON.parse(r.content_json) as Question;
    if (
      new Set(x.selected).size !== x.selected.length ||
      x.selected.some((v) => !q.options.some((o) => o.id === v)) ||
      (q.kind !== "multiple" && x.selected.length > 1)
    )
      fail("Javob variantlari noto‘g‘ri");
    x.selected.sort();
    x.active_time_ms = Math.min(
      x.active_time_ms,
      Math.max(0, now() - a.started_at) * 1000,
    );
  }
  const r = await c.env.DB.batch([
    stmt(
      c.env.DB,
      `UPDATE attempt_answers SET
  selected_json=(SELECT json_extract(value,'$.selected') FROM json_each(?) WHERE json_extract(value,'$.position')=attempt_answers.position),
  active_time_ms=MAX(active_time_ms,(SELECT json_extract(value,'$.active_time_ms') FROM json_each(?) WHERE json_extract(value,'$.position')=attempt_answers.position)),
  revision=(SELECT json_extract(value,'$.revision') FROM json_each(?) WHERE json_extract(value,'$.position')=attempt_answers.position),saved_at=?
  WHERE tenant_id=? AND attempt_id=? AND EXISTS(SELECT 1 FROM attempts a WHERE a.tenant_id=? AND a.id=? AND a.status='active' AND a.expires_at>?)
  AND EXISTS(SELECT 1 FROM json_each(?) WHERE json_extract(value,'$.position')=attempt_answers.position AND json_extract(value,'$.revision')>=attempt_answers.revision)`,
      json(d.answers),
      json(d.answers),
      json(d.answers),
      now(),
      a.tenant_id,
      a.id,
      a.tenant_id,
      a.id,
      now(),
      json(d.answers),
    ),
    stmt(
      c.env.DB,
      "SELECT status,expires_at FROM attempts WHERE tenant_id=? AND id=?",
      a.tenant_id,
      a.id,
    ),
    stmt(
      c.env.DB,
      "SELECT position,revision,selected_json FROM attempt_answers WHERE tenant_id=? AND attempt_id=? ORDER BY position",
      a.tenant_id,
      a.id,
    ),
  ]);
  const state = r[1].results[0] as Row;
  if (state.status !== "active" || state.expires_at <= now()) {
    await finalize(c.env, a.tenant_id, a.id);
    fail("Test vaqti tugagan", 409);
  }
  return c.json({ ok: true, revisions: r[2].results, server_time: now() });
});
exam.post("/attempts/:id/violation", async (c) => {
  const a = await requireAttempt(c);
  if (a.status !== "active") return c.json({ ok: true, ignored: true });
  await rate(c, "violation", 120, 60, a.id);
  const d = await body(
    c,
    z.object({
      type: z.enum([
        "tab_switch",
        "window_blur",
        "mouse_leave",
        "fullscreen_exit",
        "copy_attempt",
        "devtools",
        "split_screen",
        "multi_screen_info",
      ]),
      away_seconds: z.number().int().min(0).max(3600).default(0),
      multi_screen: z.boolean().default(false),
    }),
  );
  const log: any[] = (() => {
    try {
      return JSON.parse(a.violation_log_json || "[]");
    } catch {
      return [];
    }
  })();
  const isCountable = d.type !== "multi_screen_info";
  if (isCountable) {
    log.push({ type: d.type, at: now(), away: d.away_seconds });
  }
  const trimmed = log.slice(-50);
  const inc = isCountable ? 1 : 0;
  const nextCount = Number(a.violations_count || 0) + inc;
  const nextAway = Number(a.away_seconds || 0) + d.away_seconds;
  const nextMulti = a.multi_screen || d.multi_screen ? 1 : 0;
  await stmt(
    c.env.DB,
    "UPDATE attempts SET violations_count=?, away_seconds=?, multi_screen=?, violation_log_json=? WHERE tenant_id=? AND id=? AND status='active'",
    nextCount,
    nextAway,
    nextMulti,
    json(trimmed),
    a.tenant_id,
    a.id,
  ).run();
  return c.json({ ok: true, violations_count: nextCount, away_seconds: nextAway });
});
exam.post("/attempts/:id/finish", async (c) => {
  const a = await requireAttempt(c);
  await rate(c, "finish", 20, 60, a.id);
  let autoSubmitted = false;
  try {
    const raw = await c.req.json();
    autoSubmitted = !!raw?.auto_submitted;
  } catch {}
  if (autoSubmitted && a.status === "active") {
    await stmt(
      c.env.DB,
      "UPDATE attempts SET auto_submitted=1 WHERE tenant_id=? AND id=? AND status='active'",
      a.tenant_id,
      a.id,
    ).run();
  }
  const wasActive = a.status === "active";
  const result = await finalize(c.env, a.tenant_id, a.id);
  if (wasActive && result?.status === "submitted") {
    const cs = JSON.parse(a.settings_json || "{}");
    notifyParentExamResult(c, a.tenant_id, a.student_id, {
      cardTitle: cs.title || "Onlayn test",
      percentage: Number(result.percentage || 0),
      score: Number(result.score || 0),
      maxScore: Number(result.max_score || 0),
      passed: Number(result.percentage || 0) >= Number(cs.pass_percent ?? 70),
    });
    await stmt(
      c.env.DB,
      "UPDATE cards SET market_solves=COALESCE(market_solves,0)+1, market_score_sum=COALESCE(market_score_sum,0)+? WHERE tenant_id=? AND id=?",
      Number(result.percentage || 0),
      a.tenant_id,
      a.id ? a.card_id : a.card_id,
    ).run();
  }
  return c.json({ ok: true, status: result!.status });
});
async function bestAttempts(
  db: D1Database,
  tid: string,
  cid: string,
  limit = 100,
) {
  return rows(
    db,
    `SELECT id,student_name,identity_hash,percentage,submitted_at-started_at duration_seconds,submitted_at FROM (SELECT a.*,ROW_NUMBER() OVER(PARTITION BY identity_hash ORDER BY percentage DESC,submitted_at-started_at ASC,submitted_at ASC,id ASC) best FROM attempts a WHERE tenant_id=? AND card_id=? AND status='submitted') WHERE best=1 ORDER BY percentage DESC,duration_seconds ASC,submitted_at ASC,id ASC LIMIT ?`,
    tid,
    cid,
    limit,
  );
}
exam.get("/attempts/:id/result", async (c) => {
  const a = await maybeFinalize(c, await requireAttempt(c));
  if (a.status !== "submitted") fail("Test hali tugamagan", 409);
  const s = JSON.parse(a.settings_json) as CardSettings;
  if (!s.show_results)
    return c.json({
      hidden: true,
      message: "Natijani o‘qituvchingiz e’lon qiladi.",
    });
  const qs = await joinedQuestions(c.env.DB, a.tenant_id, a.id);
  const durations = qs
    .map((r) => r.active_time_ms / 1000)
    .sort((a, b) => a - b);
  const m = Math.floor(durations.length / 2);
  const leaderboard = s.show_leaderboard
    ? await bestAttempts(c.env.DB, a.tenant_id, a.card_id, 10000)
    : [];
  const rank =
    leaderboard.findIndex((r) => r.identity_hash === a.identity_hash) + 1;
  return c.json({
    result: {
      id: a.id,
      student_name: a.student_name,
      card_title: s.title || "",
      card_category: s.category || "",
      submitted_at: a.submitted_at,
      pass_percent: s.pass_percent,
      score: a.score,
      max_score: a.max_score,
      percentage: a.percentage,
      passed: a.percentage >= s.pass_percent,
      reward: s.reward || "",
      earned_coins: calcAttemptCoins(a.percentage, a.percentage >= s.pass_percent, s),
      correct_count: a.correct_count,
      incorrect_count: a.incorrect_count,
      unanswered_count: a.unanswered_count,
      duration_seconds: a.submitted_at - a.started_at,
      average_question_seconds:
        durations.reduce((v, n) => v + n, 0) / (durations.length || 1),
      median_question_seconds: durations.length
        ? durations.length % 2
          ? durations[m]
          : (durations[m - 1] + durations[m]) / 2
        : 0,
      telemetry_notice:
        "Savolga sarflangan vaqt taxminiy telemetriya hisoblanadi.",
      rank: s.show_leaderboard ? rank : null,
      anti_cheat: s.anti_cheat || "monitor",
      violations_count: Number(a.violations_count || 0),
      away_seconds: Number(a.away_seconds || 0),
      auto_submitted: !!a.auto_submitted,
      multi_screen: !!a.multi_screen,
      violation_log: (() => {
        try {
          return JSON.parse(a.violation_log_json || "[]");
        } catch {
          return [];
        }
      })(),
      participants: s.show_leaderboard ? leaderboard.length : null,
      questions: qs.map((r) => {
        const q = JSON.parse(r.content_json);
        return {
          position: r.position,
          title: q.title,
          active_time_ms: r.active_time_ms,
          is_correct: !!r.is_correct,
          answered: JSON.parse(r.selected_json).length > 0,
          ...(s.show_answers
            ? {
                correct: q.correct,
                options: q.options,
                answer: JSON.parse(r.selected_json),
                explanation: q.explanation,
                image_url: q.image_url || "",
                code: q.code || "",
              }
            : {}),
        };
      }),
    },
  });
});
exam.get("/cards/:slug/leaderboard", async (c) => {
  const card = await getPublicCard(c);
  const s = JSON.parse(card.settings_json);
  if (!s.show_leaderboard || !s.show_results) fail("Reyting yopiq", 403);
  const list = await bestAttempts(c.env.DB, card.tenant_id, card.id);
  const short = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? parts[0] +
          " " +
          parts
            .slice(1)
            .map((x) => x[0] + ".")
            .join("")
      : name[0] + "***";
  };
  return c.json({
    items: list.map((r, i) => ({
      rank: i + 1,
      name: short(r.student_name),
      percentage: r.percentage,
      duration_seconds: r.duration_seconds,
    })),
  });
});
export async function analytics(c: Ctx, cid: string, exportAll = false) {
  const card = await scoped(c, "cards", cid),
    tid = card.tenant_id;
  const { limit, offset } = paging(c);
  const s = JSON.parse(card.settings_json);
  const attempts = await rows(
    c.env.DB,
    `SELECT a.id,a.student_name,s.student_code,COALESCE(s.note,'') student_note,a.started_at,a.submitted_at,a.status,a.score,a.max_score,a.percentage,a.correct_count,a.incorrect_count,a.unanswered_count,COALESCE(a.violations_count,0) violations_count,COALESCE(a.away_seconds,0) away_seconds,COALESCE(a.auto_submitted,0) auto_submitted,COALESCE(a.multi_screen,0) multi_screen,COALESCE(a.submitted_at,MIN(?,a.expires_at))-a.started_at duration_seconds FROM attempts a LEFT JOIN students s ON s.tenant_id=a.tenant_id AND s.id=a.student_id WHERE a.tenant_id=? AND a.card_id=? ORDER BY a.started_at DESC,a.id LIMIT ? OFFSET ?`,
    now(),
    tid,
    cid,
    exportAll ? 10001 : limit,
    exportAll ? 0 : offset,
  );
  if (exportAll && attempts.length > 10000)
    fail("Bitta eksport 10000 urinishdan oshmasin", 413);
  const summary = await first(
    c.env.DB,
    "SELECT COUNT(*) attempts,SUM(status='submitted') completed,COALESCE(ROUND(AVG(CASE WHEN status='submitted' THEN percentage END),1),0) average,COALESCE(MAX(percentage),0) best,COALESCE(ROUND(AVG(CASE WHEN status='submitted' THEN CASE WHEN percentage>=? THEN 100.0 ELSE 0 END END),1),0) pass_rate FROM attempts WHERE tenant_id=? AND card_id=?",
    s.pass_percent,
    tid,
    cid,
  );
  const questions = await rows(
    c.env.DB,
    `SELECT aq.question_version_id,MAX(json_extract(v.content_json,'$.title')) title,MAX(json_extract(v.content_json,'$.level')) level,COUNT(*) total,ROUND(AVG(aa.is_correct)*100,1) correct_rate,ROUND(AVG(aa.active_time_ms)/1000,1) avg_seconds FROM attempt_questions aq JOIN question_versions v ON v.tenant_id=aq.tenant_id AND v.id=aq.question_version_id JOIN attempts a ON a.tenant_id=aq.tenant_id AND a.id=aq.attempt_id JOIN attempt_answers aa ON aa.tenant_id=aq.tenant_id AND aa.attempt_id=aq.attempt_id AND aa.position=aq.position WHERE a.tenant_id=? AND a.card_id=? AND a.status='submitted' GROUP BY aq.question_version_id ORDER BY correct_rate`,
    tid,
    cid,
  );
  return {
    card: { id: card.id, title: card.title, slug: card.slug },
    summary,
    attempts,
    questions,
    total: summary!.attempts,
  };
}
function exportRows(attempts: Row[]) {
  return [
    [
      "O‘quvchi",
      "Kodi",
      "Holat",
      "Natija %",
      "Ball",
      "Maksimal ball",
      "To‘g‘ri",
      "Xato",
      "Javobsiz",
      "Boshlanish UTC",
      "Yakun UTC",
      "Vaqt (sek)",
      "Qoidabuzarlik",
      "Tashqarida (sek)",
      "Avto-yakunlandi",
      "2-ekran",
    ],
    ...attempts.map((a) => [
      csvSafe(a.student_name),
      csvSafe(a.student_code),
      a.status,
      a.percentage,
      a.score,
      a.max_score,
      a.correct_count,
      a.incorrect_count,
      a.unanswered_count,
      new Date(a.started_at * 1000).toISOString(),
      a.submitted_at ? new Date(a.submitted_at * 1000).toISOString() : "",
      a.duration_seconds,
      a.violations_count ?? 0,
      a.away_seconds ?? 0,
      a.auto_submitted ? "Ha" : "Yo‘q",
      a.multi_screen ? "Ha" : "Yo‘q",
    ]),
  ];
}
// Stateless public practice (guest mode) — zero database writes

exam.get("/landing-stats", async (c) => {
  await rate(c, "landing-stats", 240, 60);
  c.header("Cache-Control", "public, max-age=300");
  const safeCount = async (sql: string) => {
    try {
      const r: any = await first(c.env.DB, sql);
      return Number(r?.cnt || 0);
    } catch {
      return 0;
    }
  };
  const [students, questions, attempts, marketSolves, books, teachers] = await Promise.all([
    safeCount("SELECT COUNT(*) cnt FROM students WHERE status='active'"),
    safeCount("SELECT COUNT(*) cnt FROM questions WHERE archived=0"),
    safeCount("SELECT COUNT(*) cnt FROM attempts WHERE status='submitted'"),
    safeCount("SELECT COALESCE(SUM(market_solves), 0) cnt FROM cards"),
    safeCount("SELECT COUNT(*) cnt FROM library_books WHERE published=1 AND moderation_status='approved'"),
    safeCount("SELECT COUNT(*) cnt FROM tenants WHERE status='active'"),
  ]);
  let hot_tests: any[] = [];
  try {
    hot_tests = await rows(
      c.env.DB,
      `SELECT slug, title, description, COALESCE(market_solves, 0) solves
       FROM cards
       WHERE status='active' AND group_id IS NULL AND settings_json LIKE '%"access_mode":"open"%'
       ORDER BY COALESCE(market_solves, 0) DESC, updated_at DESC
       LIMIT 4`,
    );
  } catch {}
  return c.json({
    students,
    questions,
    solves: attempts + marketSolves,
    books,
    teachers,
    hot_tests,
  });
});

exam.get("/practice", async (c) => {
  const list = await rows(
    c.env.DB,
    "SELECT c.* FROM cards c JOIN tenants t ON t.id=c.tenant_id WHERE c.status='active' AND c.group_id IS NULL AND c.published_version>0 AND t.status='active' ORDER BY c.updated_at DESC LIMIT 100",
  );
  const items = list
    .map((r) => publicCard(r))
    .filter((card) => card.access_mode === "open");
  return c.json({ items });
});


exam.post("/practice/:slug/buy", async (c) => {
  await rate(c, "practice-buy", 30, 60);
  const card = await getPublicCard(c);
  const s = JSON.parse(card.settings_json);
  if (card.status !== "active" || s.access_mode !== "open" || card.group_id)
    fail("Bu test ochiq sotuvda mavjud emas", 403);
  const price = Number(card.price_uzs || 0);
  if (price <= 0) fail("Bu test bepul, sotib olish shart emas", 400);

  const d = await body(
    c,
    z.object({
      buyer_name: z.string().trim().min(2).max(120),
      buyer_phone: z.string().trim().max(40).optional().default(""),
    }).strict(),
  );

  const ts = now();
  let uniqueAmount = price + 101 + Math.floor(Math.random() * 880);
  for (let i = 0; i < 8; i++) {
    const c1 = await first(c.env.DB, "SELECT id FROM billing_orders WHERE status='pending' AND unique_amount=? AND expires_at>=?", uniqueAmount, ts);
    const c2 = await first(c.env.DB, "SELECT id FROM library_book_orders WHERE status='pending' AND unique_amount=? AND expires_at>=?", uniqueAmount, ts);
    const c3 = await first(c.env.DB, "SELECT id FROM test_card_orders WHERE status='pending' AND unique_amount=? AND expires_at>=?", uniqueAmount, ts);
    if (!c1 && !c2 && !c3) break;
    uniqueAmount = price + 101 + Math.floor(Math.random() * 880);
  }

  const oid = id();
  const unlockToken = id() + id();
  const expiresAt = ts + 30 * 60;
  await stmt(
    c.env.DB,
    `INSERT INTO test_card_orders(id, card_id, card_slug, buyer_name, buyer_phone, amount, unique_amount, status, unlock_token, tx_note, created_at, expires_at)
     VALUES(?,?,?,?,?,?,?,'pending',?,'',?,?)`,
    oid,
    card.id,
    card.slug,
    d.buyer_name,
    d.buyer_phone,
    price,
    uniqueAmount,
    unlockToken,
    ts,
    expiresAt,
  ).run();

  const cfgRow: any = await first(c.env.DB, "SELECT value_json FROM system_settings WHERE key='billing_card'");
  let bankCard = { card_number: "", card_holder: "", bank_name: "" };
  try {
    if (cfgRow?.value_json) bankCard = { ...bankCard, ...JSON.parse(cfgRow.value_json) };
  } catch {}

  return c.json({
    order_id: oid,
    card_slug: card.slug,
    card_title: card.title,
    amount: price,
    unique_amount: uniqueAmount,
    unlock_token: unlockToken,
    expires_at: expiresAt,
    card_number: bankCard.card_number,
    card_holder: bankCard.card_holder,
    bank_name: bankCard.bank_name,
  }, 201);
});

exam.get("/practice/order/:orderId/status", async (c) => {
  const o: any = await first(
    c.env.DB,
    "SELECT id, card_slug, status, unlock_token FROM test_card_orders WHERE id=?",
    c.req.param("orderId"),
  );
  if (!o) fail("Buyurtma topilmadi", 404);
  return c.json({
    order_id: o.id,
    card_slug: o.card_slug,
    status: o.status,
    paid: o.status === "paid",
    unlock_token: o.status === "paid" ? o.unlock_token : "",
  });
});

exam.get("/practice/:slug", async (c) => {
  const card = await getPublicCard(c);
  const s = JSON.parse(card.settings_json);
  if (card.status !== "active" || s.access_mode !== "open" || card.group_id)
    fail("Bu test ochiq mashq rejimida mavjud emas", 403);
  const priceUzs = Number(card.price_uzs || 0);
  if (priceUzs > 0) {
    const tok = String(c.req.query("token") || "").trim();
    const paidOrd = tok
      ? await first(
          c.env.DB,
          "SELECT id FROM test_card_orders WHERE card_id=? AND unlock_token=? AND status='paid' LIMIT 1",
          card.id,
          tok,
        )
      : null;
    if (!paidOrd) {
      return c.json({
        card: { ...publicCard(card), locked: true, unlocked: false },
        questions: [],
      });
    }
  }
  const release = await first(
    c.env.DB,
    "SELECT version, settings_json FROM card_releases WHERE tenant_id=? AND card_id=? ORDER BY version DESC LIMIT 1",
    card.tenant_id,
    card.id,
  );
  if (!release) fail("Test tayyor emas", 404);
  const qRows = await rows(
    c.env.DB,
    "SELECT cq.position, qv.id version_id, qv.content_json FROM card_questions cq JOIN question_versions qv ON qv.tenant_id=cq.tenant_id AND qv.id=cq.question_version_id WHERE cq.tenant_id=? AND cq.card_id=? AND cq.card_version=? ORDER BY cq.position",
    card.tenant_id,
    card.id,
    release.version,
  );
  let items = qRows.map((r) => {
    const q = JSON.parse(r.content_json) as Question;
    const opts = s.shuffle_options ? shuffle(q.options) : q.options;
    return {
      version_id: r.version_id,
      title: q.title,
      kind: q.kind,
      points: q.points,
      code: q.code || "",
      image_url: q.image_url || "",
      options: opts,
    };
  });
  if (s.random_order) items = shuffle(items);
  items = items.slice(0, s.question_count);
  return c.json({
    card: publicCard(card),
    questions: items.map((q, idx) => ({ ...q, position: idx + 1 })),
  });
});

exam.post("/practice/:slug/grade", async (c) => {
  await rate(c, "practice-grade", 180, 60);
  const card = await getPublicCard(c);
  const s = JSON.parse(card.settings_json);
  if (card.status !== "active" || s.access_mode !== "open" || card.group_id)
    fail("Bu test ochiq mashq rejimida mavjud emas", 403);
  const d = await body(
    c,
    z.object({
      answers: z.record(z.string(), z.array(z.string().max(4)).max(8)),
      order: z.array(z.string().max(80)).min(1).max(150),
      duration_seconds: z.number().int().min(0).max(86400).default(0),
      student_code: z.string().max(64).optional().default(""),
    }),
  );
  const release = await first(
    c.env.DB,
    "SELECT version FROM card_releases WHERE tenant_id=? AND card_id=? ORDER BY version DESC LIMIT 1",
    card.tenant_id,
    card.id,
  );
  if (!release) fail("Test tayyor emas", 404);
  const qRows = await rows(
    c.env.DB,
    "SELECT qv.id version_id, qv.content_json FROM card_questions cq JOIN question_versions qv ON qv.tenant_id=cq.tenant_id AND qv.id=cq.question_version_id WHERE cq.tenant_id=? AND cq.card_id=? AND cq.card_version=?",
    card.tenant_id,
    card.id,
    release.version,
  );
  const byId = new Map<string, Question>();
  for (const r of qRows) byId.set(r.version_id, JSON.parse(r.content_json));
  let score = 0,
    maxScore = 0,
    correctCount = 0,
    incorrectCount = 0,
    unansweredCount = 0;
  const review: any[] = [];
  d.order.forEach((vid, i) => {
    const q = byId.get(vid);
    if (!q) return;
    const picked = Array.from(new Set(d.answers[vid] || [])).sort();
    const expected = [...q.correct].sort();
    const isCorrect =
      picked.length === expected.length &&
      picked.every((v, idx) => v === expected[idx]);
    maxScore += q.points;
    if (!picked.length) unansweredCount++;
    else if (isCorrect) {
      correctCount++;
      score += q.points;
    } else incorrectCount++;
    review.push({
      position: i + 1,
      title: q.title,
      code: q.code || "",
      image_url: q.image_url || "",
      is_correct: isCorrect,
      answered: picked.length > 0,
      correct: q.correct,
      options: q.options,
      answer: picked,
      explanation: q.explanation || "",
    });
  });
  const percentage = maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0;
  const pCode = String(d.student_code || "").trim().toUpperCase().replace(/[\s-]+/g, "");
  if (pCode) {
    try {
      const stu = await first(
        c.env.DB,
        "SELECT id FROM students WHERE UPPER(REPLACE(REPLACE(student_code,'-',''),' ',''))=? AND status='active' LIMIT 1",
        pCode,
      );
      if (stu?.id) {
        const uzToday = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
        const cr = await first(c.env.DB, "SELECT daily_quests_json FROM student_cosmetics WHERE student_id=?", stu.id);
        let dq: any = {};
        try { dq = JSON.parse(cr?.daily_quests_json || "{}"); } catch {}
        dq.practice_done_date = uzToday;
        await stmt(
          c.env.DB,
          `INSERT INTO student_cosmetics(student_id, daily_quests_json, updated_at) VALUES(?,?,?)
           ON CONFLICT(student_id) DO UPDATE SET daily_quests_json=excluded.daily_quests_json, updated_at=excluded.updated_at`,
          stu.id,
          JSON.stringify(dq),
          now(),
        ).run();
      }
    } catch {}
  }
  await stmt(
    c.env.DB,
    "UPDATE cards SET market_solves=COALESCE(market_solves,0)+1, market_score_sum=COALESCE(market_score_sum,0)+? WHERE tenant_id=? AND id=?",
    percentage,
    card.tenant_id,
    card.id,
  ).run();
  return c.json({
    result: {
      score,
      max_score: maxScore,
      percentage,
      passed: percentage >= s.pass_percent,
      reward: s.reward || "",
      earned_coins: calcAttemptCoins(percentage, percentage >= s.pass_percent, s),
      correct_count: correctCount,
      incorrect_count: incorrectCount,
      unanswered_count: unansweredCount,
      duration_seconds: d.duration_seconds,
      questions: review,
    },
  });
});

// Tasdiqlangan Market kartochkalari (ochiq ro'yxat + statistika)
exam.get("/market-cards", async (c) => {
  const list = await rows(
    c.env.DB,
    `SELECT c.*, t.name tenant_name,
      (SELECT COUNT(*) FROM card_comments cc WHERE cc.card_id=c.id) comments_count,
      (SELECT ROUND(AVG(rating),1) FROM card_comments cc WHERE cc.card_id=c.id) avg_rating
     FROM cards c
     JOIN tenants t ON t.id=c.tenant_id
     WHERE c.status='active' AND c.market_status='approved' AND c.published_version>0 AND t.status='active'
     ORDER BY c.market_solves DESC, c.updated_at DESC LIMIT 100`,
  );
  const items = list.map((r) => {
    const baseCard = publicCard(r);
    const solves = Number(r.market_solves || 0);
    const scoreSum = Number(r.market_score_sum || 0);
    return {
      ...baseCard,
      author_name: r.tenant_name || "O‘qituvchi",
      market_solves: solves,
      avg_score: solves > 0 ? Math.round((scoreSum / solves) * 10) / 10 : null,
      comments_count: Number(r.comments_count || 0),
      avg_rating: r.avg_rating !== null && r.avg_rating !== undefined ? Number(r.avg_rating) : null,
    };
  });
  return c.json({ items });
});

// Test kartochkasi fikrlari (comments)
exam.get("/cards/:slug/comments", async (c) => {
  const card = await getPublicCard(c);
  const items = await rows(
    c.env.DB,
    "SELECT id, author_name, rating, comment, score_percent, created_at FROM card_comments WHERE card_id=? ORDER BY created_at DESC LIMIT 100",
    card.id,
  );
  const stat = await first(
    c.env.DB,
    "SELECT COUNT(*) count, ROUND(AVG(rating),1) avg_rating FROM card_comments WHERE card_id=?",
    card.id,
  );
  return c.json({
    items,
    count: Number(stat?.count || 0),
    avg_rating: stat?.avg_rating ? Number(stat.avg_rating) : null,
    market_solves: Number(card.market_solves || 0),
  });
});

exam.post("/cards/:slug/comments", async (c) => {
  await rate(c, "card-comment", 5, 600);
  const card = await getPublicCard(c);
  const d = await body(
    c,
    z.object({
      author_name: z.string().trim().min(2).max(120),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(400).default(""),
      score_percent: z.number().min(0).max(100).nullable().optional(),
    }),
  );
  const cid = id();
  await stmt(
    c.env.DB,
    "INSERT INTO card_comments(id,tenant_id,card_id,author_name,rating,comment,score_percent,created_at) VALUES(?,?,?,?,?,?,?,?)",
    cid,
    card.tenant_id,
    card.id,
    d.author_name,
    d.rating,
    d.comment,
    d.score_percent ?? null,
    now(),
  ).run();
  return c.json({ ok: true, id: cid }, 201);
});

// Ota-ona va o'quvchi kabineti — kod orqali natija, davomat, yutuq/chegirmalar (sana filtri bilan)
exam.get("/parent/:code", async (c) => {
  const raw = decodeURIComponent(c.req.param("code") || "").trim();
  if (!raw || raw === "__empty__") {
    return c.json({ student: null, summary: null, tests: { items: [] }, attendance: { items: [] }, rewards: [] });
  }
  await rate(c, "parent-lookup", 180, 60);
  const norm = raw.toUpperCase().replace(/[\s-]+/g, "");
  if (norm.length < 3) fail("O‘quvchi kodini to‘g‘ri kiriting", 422);

  const student = await first(
    c.env.DB,
    `SELECT s.id, s.tenant_id, s.group_id, s.student_code, s.name, g.name group_name, t.name center_name
     FROM students s
     JOIN tenants t ON t.id=s.tenant_id
     LEFT JOIN groups g ON g.id=s.group_id AND g.tenant_id=s.tenant_id
     WHERE (UPPER(REPLACE(REPLACE(s.student_code,'-',''),' ',''))=? OR UPPER(s.student_code)=?)
       AND s.status='active' AND t.status='active'
     LIMIT 1`,
    norm,
    raw.toUpperCase(),
  );
  if (!student) fail("Bunday kodli o‘quvchi topilmadi. Kodni qayta tekshiring.", 404);

  const fromStr = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("from") || "") ? c.req.query("from")! : "";
  const toStr = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query("to") || "") ? c.req.query("to")! : "";
  const fromTs = fromStr ? Math.floor(Date.parse(fromStr + "T00:00:00+05:00") / 1000) : 0;
  const toTs = toStr ? Math.floor(Date.parse(toStr + "T23:59:59+05:00") / 1000) : 9999999999;

  const attList = await rows(
    c.env.DB,
    `SELECT lesson_date, status
     FROM attendance_records
     WHERE tenant_id=? AND student_id=?
       AND (?='' OR lesson_date>=?)
       AND (?='' OR lesson_date<=?)
     ORDER BY lesson_date DESC LIMIT 200`,
    student.tenant_id,
    student.id,
    fromStr,
    fromStr,
    toStr,
    toStr,
  );

  let present = 0, late = 0, absent = 0, excused = 0;
  for (const r of attList) {
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else if (r.status === "absent") absent++;
    else if (r.status === "excused") excused++;
  }
  const attMarked = present + late + absent + excused;
  const attPct = attMarked ? Math.round(((present + late) / attMarked) * 1000) / 10 : null;

  const normName = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");
  const sn = normName(student.name);

  const rawAttempts = await rows(
    c.env.DB,
    `SELECT a.id, a.student_id, a.student_name, a.score, a.max_score, a.percentage,
      a.correct_count, a.incorrect_count, a.unanswered_count, a.started_at, a.submitted_at,
      COALESCE(a.violations_count,0) violations_count, COALESCE(a.auto_submitted,0) auto_submitted,
      c.title card_title, c.slug card_slug, c.settings_json
     FROM attempts a
     JOIN cards c ON c.id=a.card_id AND c.tenant_id=a.tenant_id
     WHERE a.tenant_id=? AND a.status='submitted' AND a.submitted_at>=? AND a.submitted_at<=?
     ORDER BY a.submitted_at DESC LIMIT 300`,
    student.tenant_id,
    fromTs,
    toTs,
  );

  const archivedAttempts = await rows(
    c.env.DB,
    `SELECT card_title, card_slug, card_category, student_name, score, max_score, percentage, passed,
      correct_count, incorrect_count, unanswered_count, submitted_at, duration_seconds
     FROM archived_results
     WHERE tenant_id=? AND submitted_at>=? AND submitted_at<=?
     ORDER BY submitted_at DESC LIMIT 200`,
    student.tenant_id,
    fromTs,
    toTs,
  );

  const tests: any[] = [];
  for (const a of rawAttempts) {
    if (a.student_id === student.id || (!a.student_id && normName(a.student_name) === sn)) {
      const cfg = JSON.parse(a.settings_json || "{}");
      const passPct = Number(cfg.pass_percent ?? 70);
      const pct = Number(a.percentage || 0);
      tests.push({
        id: a.id,
        title: a.card_title,
        slug: a.card_slug,
        category: cfg.category || "",
        score: Number(a.score || 0),
        max_score: Number(a.max_score || 0),
        percentage: pct,
        pass_percent: passPct,
        passed: pct >= passPct,
        reward: cfg.reward || "",
        correct_count: Number(a.correct_count || 0),
        incorrect_count: Number(a.incorrect_count || 0),
        unanswered_count: Number(a.unanswered_count || 0),
        violations_count: Number(a.violations_count || 0),
        auto_submitted: !!a.auto_submitted,
        submitted_at: Number(a.submitted_at),
        duration_seconds: Math.max(0, Number(a.submitted_at) - Number(a.started_at)),
      });
    }
  }
  for (const a of archivedAttempts) {
    if (normName(a.student_name) === sn) {
      tests.push({
        id: "arch-" + a.submitted_at,
        title: a.card_title,
        slug: a.card_slug,
        category: a.card_category || "",
        score: Number(a.score || 0),
        max_score: Number(a.max_score || 0),
        percentage: Number(a.percentage || 0),
        pass_percent: 70,
        passed: !!a.passed,
        reward: "",
        correct_count: Number(a.correct_count || 0),
        incorrect_count: Number(a.incorrect_count || 0),
        unanswered_count: Number(a.unanswered_count || 0),
        violations_count: 0,
        auto_submitted: false,
        submitted_at: Number(a.submitted_at),
        duration_seconds: Number(a.duration_seconds || 0),
      });
    }
  }

  tests.sort((a, b) => b.submitted_at - a.submitted_at);
  const taken = tests.length;
  const passed = tests.filter((t) => t.passed).length;
  const avgPct = taken
    ? Math.round((tests.reduce((acc, t) => acc + t.percentage, 0) / taken) * 10) / 10
    : null;
  const earnedRewards = tests
    .filter((t) => t.passed && t.reward)
    .map((t) => ({
      test_title: t.title,
      percentage: t.percentage,
      reward: t.reward,
      submitted_at: t.submitted_at,
    }));

  return c.json({
    student: {
      name: student.name,
      student_code: student.student_code,
      group_name: student.group_name || "Guruhsiz",
      center_name: student.center_name || "Bilim UZ",
    },
    summary: {
      avg_percent: avgPct,
      tests_taken: taken,
      tests_passed: passed,
      attendance_percent: attPct,
      present_count: present,
      late_count: late,
      absent_count: absent,
      excused_count: excused,
      rewards_count: earnedRewards.length,
    },
    rewards: earnedRewards,
    tests,
    attendance: attList,
  });
});

export function csvExport(c: Ctx, attempts: Row[]) {
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", 'attachment; filename="testlab-results.csv"');
  return c.body(toCsv(exportRows(attempts)));
}
export function xlsxExport(c: Ctx, attempts: Row[]) {
  c.header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  c.header(
    "Content-Disposition",
    'attachment; filename="testlab-results.xlsx"',
  );
  return c.body(makeXlsx(exportRows(attempts)));
}
