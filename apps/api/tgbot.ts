import { Hono } from "hono";
import type { AppEnv, Bindings, Ctx } from "./types";
import { fail, first, now, rows, stmt } from "./core";
import { getEffectivePlan } from "./billing";

export const tgbotPublic = new Hono<AppEnv>();
export const tgbotOwner = new Hono<AppEnv>();

function escTg(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTgMessage(env: Bindings, chatId: string, html: string) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
  } catch {}
}

async function isUltraPlan(env: Bindings, tenantId: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const plan = await getEffectivePlan(env.DB, tenantId);
    return plan.id === "center"; // Ultra plan
  } catch {
    return false;
  }
}

function runBg(c: Ctx, p: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(p);
  } catch {
    void p;
  }
}

// 1. Attendance notification
export function notifyParentAttendance(
  c: Ctx,
  tenantId: string,
  records: Array<{ student_id: string; lesson_date: string; status: string }>,
) {
  if (!c.env.TELEGRAM_BOT_TOKEN || !records.length) return;
  const labels: Record<string, string> = {
    present: "✅ Keldi (+)",
    late: "⏰ Kechikdi (K)",
    absent: "❌ Kelmadi (—)",
    excused: "📄 Sababli (S)",
  };
  runBg(
    c,
    (async () => {
      if (!(await isUltraPlan(c.env, tenantId))) return;
      const origin = c.env.APP_ORIGIN || "https://bilimuz.dpdns.org";
      for (const r of records) {
        if (!r.status || !labels[r.status]) continue;
        const link = await first(
          c.env.DB,
          `SELECT l.chat_id, s.name, s.student_code
           FROM student_telegram_links l
           JOIN students s ON s.id = l.student_id
           WHERE s.tenant_id=? AND s.id=?`,
          tenantId,
          r.student_id,
        );
        if (!link?.chat_id) continue;
        const msg = [
          "📅 <b>Bilim UZ · Davomat xabari</b>",
          `👤 O‘quvchi: <b>${escTg(link.name)}</b>`,
          `📆 Sana: ${escTg(r.lesson_date)}`,
          `📌 Holat: <b>${labels[r.status]}</b>`,
          `🔗 <a href="${origin}/parent/${encodeURIComponent(link.student_code)}">Ota-ona kabinetini ochish</a>`,
        ].join("\n");
        await sendTgMessage(c.env, link.chat_id, msg);
      }
    })(),
  );
}

// 2. Exam result notification
export function notifyParentExamResult(
  c: Ctx,
  tenantId: string,
  studentId: string | null | undefined,
  info: { cardTitle: string; percentage: number; score: number; maxScore: number; passed: boolean },
) {
  if (!c.env.TELEGRAM_BOT_TOKEN || !studentId) return;
  runBg(
    c,
    (async () => {
      if (!(await isUltraPlan(c.env, tenantId))) return;
      const link = await first(
        c.env.DB,
        `SELECT l.chat_id, s.name, s.student_code
         FROM student_telegram_links l
         JOIN students s ON s.id = l.student_id
         WHERE s.tenant_id=? AND s.id=?`,
        tenantId,
        studentId,
      );
      if (!link?.chat_id) return;
      const origin = c.env.APP_ORIGIN || "https://bilimuz.dpdns.org";
      const msg = [
        "🏆 <b>Bilim UZ · Test natijasi tayyor!</b>",
        `👤 O‘quvchi: <b>${escTg(link.name)}</b>`,
        `📝 Test: ${escTg(info.cardTitle || "Onlayn test")}`,
        `📊 Natija: <b>${info.percentage}%</b> (${info.score}/${info.maxScore} ball) · ${info.passed ? "✅ O‘tdi" : "⚠️ Qayta mashq kerak"}`,
        `🔗 <a href="${origin}/parent/${encodeURIComponent(link.student_code)}">QR Sertifikat va tahlilni ko‘rish</a>`,
      ].join("\n");
      await sendTgMessage(c.env, link.chat_id, msg);
    })(),
  );
}

// 3. New homework assignment notification
export function notifyParentNewAssignment(
  c: Ctx,
  tenantId: string,
  groupId: string | null,
  title: string,
  dueAt: number | null,
) {
  if (!c.env.TELEGRAM_BOT_TOKEN) return;
  runBg(
    c,
    (async () => {
      if (!(await isUltraPlan(c.env, tenantId))) return;
      const links = await rows(
        c.env.DB,
        `SELECT l.chat_id, s.name, s.student_code
         FROM student_telegram_links l
         JOIN students s ON s.id = l.student_id
         WHERE s.tenant_id=? AND s.status='active' AND (? IS NULL OR s.group_id=?)
         LIMIT 100`,
        tenantId,
        groupId,
        groupId,
      );
      const origin = c.env.APP_ORIGIN || "https://bilimuz.dpdns.org";
      const dueStr = dueAt
        ? new Date(dueAt * 1000).toLocaleString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
        : "Muddatsiz";
      for (const link of links) {
        const msg = [
          "📚 <b>Bilim UZ · Yangi uyga vazifa</b>",
          `👤 O‘quvchi: <b>${escTg(link.name)}</b>`,
          `📌 Mavzu: <b>${escTg(title)}</b>`,
          `⏰ Topshirish muddati: ${escTg(dueStr)}`,
          `🔗 <a href="${origin}/student/${encodeURIComponent(link.student_code)}">Vazifani ochish</a>`,
        ].join("\n");
        await sendTgMessage(c.env, link.chat_id, msg);
      }
    })(),
  );
}

// 4. Homework graded notification
export function notifyParentHomeworkGraded(
  c: Ctx,
  tenantId: string,
  studentId: string,
  title: string,
  score: number | null,
  maxScore: number,
  feedback: string,
) {
  if (!c.env.TELEGRAM_BOT_TOKEN || !studentId) return;
  runBg(
    c,
    (async () => {
      if (!(await isUltraPlan(c.env, tenantId))) return;
      const link = await first(
        c.env.DB,
        `SELECT l.chat_id, s.name, s.student_code
         FROM student_telegram_links l
         JOIN students s ON s.id = l.student_id
         WHERE s.tenant_id=? AND s.id=?`,
        tenantId,
        studentId,
      );
      if (!link?.chat_id) return;
      const origin = c.env.APP_ORIGIN || "https://bilimuz.dpdns.org";
      const msg = [
        "⭐ <b>Bilim UZ · Uyga vazifa baholandi!</b>",
        `👤 O‘quvchi: <b>${escTg(link.name)}</b>`,
        `📝 Vazifa: ${escTg(title)}`,
        `🎯 Baho: <b>${score !== null ? `${score} / ${maxScore}` : "Tekshirildi"}</b>`,
        feedback ? `💬 Izoh: ${escTg(feedback)}` : "",
        `🔗 <a href="${origin}/parent/${encodeURIComponent(link.student_code)}">Natijalarni ko‘rish</a>`,
      ]
        .filter(Boolean)
        .join("\n");
      await sendTgMessage(c.env, link.chat_id, msg);
    })(),
  );
}

// ============================================================================
// Incoming Telegram Bot Webhook (/api/v2/tgbot/webhook)
// ============================================================================
tgbotPublic.post("/webhook", async (c) => {
  const sec = String(c.env.TELEGRAM_BOT_WEBHOOK_SECRET || "").trim();
  if (sec && c.req.header("x-telegram-bot-api-secret-token") !== sec) {
    fail("Webhook token noto‘g‘ri", 403);
  }
  const update = await c.req.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : "";
  const text = String(msg?.text || "").trim();
  const uname = String(msg?.from?.username || "");
  if (!chatId || !text) return c.json({ ok: true });

  const origin = c.env.APP_ORIGIN || "https://bilimuz.dpdns.org";

  if (text === "/start") {
    await sendTgMessage(
      c.env,
      chatId,
      [
        "👋 <b>Assalomu alaykum! Bilim UZ xabarnoma botiga xush kelibsiz.</b>",
        "",
        "Farzandingizning dars davomati, test natijalari va uyga vazifalarini avtomatik olish uchun <b>o‘quvchi kodini</b> yuboring.",
        "Masalan: <code>K48291</code>",
      ].join("\n"),
    );
    return c.json({ ok: true });
  }

  if (text === "/unlink") {
    await stmt(c.env.DB, "DELETE FROM student_telegram_links WHERE chat_id=?", chatId).run();
    await sendTgMessage(c.env, chatId, "🔕 Xabarnomalar uzildi. Qayta ulash uchun o‘quvchi kodini yuboring.");
    return c.json({ ok: true });
  }

  if (text === "/status") {
    const linked = await rows(
      c.env.DB,
      `SELECT s.name, s.student_code, g.name AS group_name
       FROM student_telegram_links l
       JOIN students s ON s.id = l.student_id
       LEFT JOIN groups g ON g.id = s.group_id
       WHERE l.chat_id=?`,
      chatId,
    );
    if (!linked.length) {
      await sendTgMessage(c.env, chatId, "Hozircha birorta o‘quvchi ulanmagan. O‘quvchi kodini (masalan <code>K48291</code>) yuboring.");
    } else {
      const lines = linked.map(
        (x: any) => `• <b>${escTg(x.name)}</b> (${escTg(x.group_name || "Umumiy")}) — <a href="${origin}/parent/${encodeURIComponent(x.student_code)}">Kabinet</a>`,
      );
      await sendTgMessage(c.env, chatId, "✅ <b>Ulangan o‘quvchilar:</b>\n" + lines.join("\n"));
    }
    return c.json({ ok: true });
  }

  // Handle "/start K48291" deep-link OR plain "K48291"
  const rawCode = text.startsWith("/start ") ? text.slice(7).trim() : text;
  const clean = rawCode.toUpperCase().replace(/[\s-]+/g, "");
  const st = await first(
    c.env.DB,
    `SELECT s.id, s.name, s.student_code, g.name AS group_name, t.name AS tenant_name
     FROM students s
     LEFT JOIN groups g ON g.id = s.group_id
     JOIN tenants t ON t.id = s.tenant_id
     WHERE UPPER(REPLACE(REPLACE(s.student_code, '-', ''), ' ', '')) = ? AND s.status = 'active'
     LIMIT 1`,
    clean,
  );
  if (!st) {
    await sendTgMessage(
      c.env,
      chatId,
      "❌ Bunday faol o‘quvchi kodi topilmadi. O‘qituvchingiz bergan kodni (masalan: <code>K48291</code>) to‘g‘ri kiriting.",
    );
    return c.json({ ok: true });
  }

  await stmt(
    c.env.DB,
    `INSERT INTO student_telegram_links(student_id, chat_id, username, linked_at)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(student_id) DO UPDATE SET chat_id=excluded.chat_id, username=excluded.username, linked_at=excluded.linked_at`,
    st.id,
    chatId,
    uname,
    now(),
  ).run();

  await sendTgMessage(
    c.env,
    chatId,
    [
      "✅ <b>Muvaffaqiyatli ulandi!</b>",
      `👤 O‘quvchi: <b>${escTg(st.name)}</b>`,
      `🏫 Guruh: ${escTg(st.group_name || "Umumiy")} · ${escTg(st.tenant_name)}`,
      "",
      "Endi davomat, test natijalari va uyga vazifalar shu yerga avtomatik kelib turadi.",
      `🔗 <a href="${origin}/parent/${encodeURIComponent(st.student_code)}">Ota-ona kabinetini ochish</a>`,
    ].join("\n"),
  );
  return c.json({ ok: true });
});

// Owner 1-click Webhook Setup (/api/v2/owner/tgbot/set-webhook)
tgbotOwner.post("/set-webhook", async (c) => {
  const token = String(c.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) fail("Avval terminalda TELEGRAM_BOT_TOKEN secretini kiriting", 400);
  const webhookUrl = (c.env.APP_ORIGIN || "https://bilimuz.dpdns.org") + "/api/v2/tgbot/webhook";
  const payload: Record<string, any> = { url: webhookUrl };
  if (c.env.TELEGRAM_BOT_WEBHOOK_SECRET) {
    payload.secret_token = c.env.TELEGRAM_BOT_WEBHOOK_SECRET;
  }
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = (await r.json()) as any;
  if (!res.ok) fail(res.description || "Telegram webhook ulanmadi", 400);
  return c.json({ ok: true, webhook_url: webhookUrl, telegram: res });
});
