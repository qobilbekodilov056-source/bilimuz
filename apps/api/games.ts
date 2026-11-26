import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Ctx } from "./types";
import { authenticate } from "./auth";
import { body, fail, first, id, now, rate, rows, stmt } from "./core";

export const gamesPublic = new Hono<AppEnv>();
export const gamesOwner = new Hono<AppEnv>();

const gameSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  category: z.string().trim().min(2).max(60).optional().default("Viktorina"),
  mode: z.enum(["solo", "duel", "team", "multiplayer"]).default("multiplayer"),
  url: z
    .string()
    .trim()
    .url("To‘g‘ri HTTPS havola kiriting")
    .refine((u) => /^https?:\/\//i.test(u), "Havola https:// bilan boshlanishi kerak"),
  cover_url: z.string().trim().max(500).optional().default(""),
  open_mode: z.enum(["embed", "newtab"]).default("embed"),
  active: z.boolean().optional().default(true),
});

// --- SCHOOL/CENTER GAMES API (/api/v2/games) ---

async function requireGamesAccess(c: Ctx) {
  // 1. Tizimga kirgan Teacher yoki Owner bo'lsa ruxsat (learner emas!)
  try {
    const p = await authenticate(c);
    if (p.scope === "owner") return;
    if (p.scope === "teacher") {
      const u = await first(c.env.DB, "SELECT account_type FROM users WHERE id=?", p.userId);
      if (u?.account_type !== "learner") return;
    }
  } catch {}

  // 2. O'quv markazi / maktab o'quvchi kodi (ST-... yoki A12345) tekshiruvi
  const code = String(c.req.header("x-student-code") || c.req.query("student_code") || "").trim().toUpperCase();
  if (code) {
    const st = await first(
      c.env.DB,
      "SELECT id FROM students WHERE UPPER(student_code)=? AND status='active' LIMIT 1",
      code,
    );
    if (st) return;
  }

  fail(
    "O‘yinlar bo‘limi faqat o‘quv markazi yoki maktab kabineti va undagi o‘quvchilar (o‘quvchi kodi bilan) uchun ochiq.",
    403,
  );
}

gamesPublic.use("*", async (c, next) => {
  await requireGamesAccess(c);
  await next();
});

gamesPublic.get("/", async (c) => {
  const q = (c.req.query("q") || "").trim().toLowerCase();
  const mode = (c.req.query("mode") || "").trim();
  const list = await rows(
    c.env.DB,
    "SELECT * FROM games WHERE active=1 ORDER BY created_at DESC LIMIT 100",
  );
  const filtered = list.filter((g: any) => {
    if (mode && g.mode !== mode) return false;
    if (q) {
      const hay = `${g.title} ${g.description} ${g.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return c.json({ items: filtered });
});

gamesPublic.get("/:id", async (c) => {
  const g = await first(
    c.env.DB,
    "SELECT * FROM games WHERE id=? AND active=1",
    c.req.param("id"),
  );
  if (!g) fail("O‘yin topilmadi", 404);
  return c.json({ game: g });
});

gamesPublic.post("/:id/play", async (c) => {
  await rate(c, "game-play", 60, 60);
  await stmt(
    c.env.DB,
    "UPDATE games SET plays_count = plays_count + 1 WHERE id=? AND active=1",
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});

// --- OWNER GAMES MANAGEMENT (/api/v2/owner/games) ---

gamesOwner.get("/", async (c) => {
  const items = await rows(
    c.env.DB,
    "SELECT * FROM games ORDER BY created_at DESC LIMIT 200",
  );
  return c.json({ items });
});

gamesOwner.post("/", async (c) => {
  const d = await body(c, gameSchema);
  const gid = id();
  const ts = now();
  await stmt(
    c.env.DB,
    "INSERT INTO games(id,title,description,category,mode,url,cover_url,open_mode,plays_count,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?,?,?)",
    gid,
    d.title,
    d.description,
    d.category,
    d.mode,
    d.url,
    d.cover_url,
    d.open_mode,
    d.active ? 1 : 0,
    ts,
    ts,
  ).run();
  return c.json({ id: gid }, 201);
});

gamesOwner.put("/:id", async (c) => {
  const gid = c.req.param("id");
  const cur = await first(c.env.DB, "SELECT id FROM games WHERE id=?", gid);
  if (!cur) fail("O‘yin topilmadi", 404);
  const d = await body(c, gameSchema);
  await stmt(
    c.env.DB,
    "UPDATE games SET title=?,description=?,category=?,mode=?,url=?,cover_url=?,open_mode=?,active=?,updated_at=? WHERE id=?",
    d.title,
    d.description,
    d.category,
    d.mode,
    d.url,
    d.cover_url,
    d.open_mode,
    d.active ? 1 : 0,
    now(),
    gid,
  ).run();
  return c.json({ ok: true });
});

gamesOwner.delete("/:id", async (c) => {
  await stmt(c.env.DB, "DELETE FROM games WHERE id=?", c.req.param("id")).run();
  return c.json({ ok: true });
});
