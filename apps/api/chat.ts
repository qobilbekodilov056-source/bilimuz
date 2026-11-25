import { Hono } from "hono";
import type { AppEnv } from "./types";
import { digest, fail, first, rate, rows, settings } from "./core";
import { authenticate } from "./auth";

export const chatRoutes = new Hono<AppEnv>();

export type ChatRoomMeta = {
  id: string;
  title: string;
  subtitle: string;
  type: "public" | "group";
  canModerate: boolean;
};

function normalizeFirebaseUrl(raw: unknown): string {
  const s = String(raw || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    const host = u.hostname.toLowerCase();
    if (
      !host.endsWith(".firebaseio.com") &&
      !host.endsWith(".firebasedatabase.app")
    ) {
      return "";
    }
    return u.origin;
  } catch {
    return "";
  }
}

async function groupRoomId(tenantId: string, groupId: string): Promise<string> {
  const h = await digest(`bilimuz_chat_room_v1:${tenantId}:${groupId}`);
  return "grp_" + h.slice(0, 16);
}

const PUBLIC_ROOM_BASE: ChatRoomMeta = {
  id: "public_all",
  title: "Bilim UZ Umumiy Chat",
  subtitle: "Barcha o‘quvchi va o‘qituvchilar uchun ochiq guruh",
  type: "public",
  canModerate: false,
};

// Public / Student access: verifies student code in D1 (read-only, 1 query)
chatRoutes.get("/public-access", async (c) => {
  await rate(c, "chat-public-access", 60, 60);
  const s = await settings(c.env);
  if (s.chat_enabled === false) {
    return c.json({
      enabled: false,
      firebase_db_url: "",
      rooms: [],
      me: null,
      code_error: "",
    });
  }
  const firebase_db_url = normalizeFirebaseUrl(s.firebase_db_url);
  const rawCode = String(c.req.query("code") || "").trim();
  const rooms: ChatRoomMeta[] = [];
  let me: {
    id: string;
    name: string;
    role: "student" | "guest";
    code?: string;
    badge: string;
  } | null = null;
  let code_error = "";

  if (rawCode) {
    const clean = rawCode.toUpperCase().replace(/[\s-]+/g, "");
    const st = await first(
      c.env.DB,
      `SELECT st.id, st.name, st.student_code, st.tenant_id, st.group_id,
              g.name AS group_name, t.name AS tenant_name
       FROM students st
       LEFT JOIN groups g ON g.id = st.group_id AND g.tenant_id = st.tenant_id
       JOIN tenants t ON t.id = st.tenant_id
       WHERE UPPER(REPLACE(REPLACE(st.student_code, '-', ''), ' ', '')) = ?
         AND st.status = 'active'
       LIMIT 1`,
      clean,
    );
    if (!st) {
      code_error = "Bunday faol o‘quvchi kodi topilmadi";
    } else {
      me = {
        id: "stu_" + st.id,
        name: st.name,
        role: "student",
        code: st.student_code,
        badge: st.group_name || "O‘quvchi",
      };
      if (st.group_id) {
        rooms.push({
          id: await groupRoomId(st.tenant_id, st.group_id),
          title: st.group_name || "Mening guruhim",
          subtitle: `${st.tenant_name || "Bilim UZ"} · Yopiq sinf guruhi`,
          type: "group",
          canModerate: false,
        });
      }
    }
  }

  rooms.push({ ...PUBLIC_ROOM_BASE });

  return c.json({
    enabled: true,
    firebase_db_url,
    rooms,
    me,
    code_error,
  });
});

// Authenticated Teacher / Owner access: lists all teacher groups + public room
chatRoutes.get("/studio-access", async (c) => {
  const p = await authenticate(c);
  await rate(c, "chat-studio-access", 60, 60, p.userId);
  const s = await settings(c.env);
  if (s.chat_enabled === false && p.scope !== "owner") {
    fail("Jonli chat vaqtincha o‘chirilgan", 403);
  }
  const firebase_db_url = normalizeFirebaseUrl(s.firebase_db_url);
  const rooms: ChatRoomMeta[] = [];

  if (p.scope === "owner") {
    rooms.push({ ...PUBLIC_ROOM_BASE, canModerate: true });
    return c.json({
      enabled: s.chat_enabled !== false,
      firebase_db_url,
      rooms,
      me: {
        id: "owner_" + p.userId,
        name: p.name || "Administrator",
        role: "owner",
        badge: "Admin",
      },
    });
  }

  const grps = await rows(
    c.env.DB,
    `SELECT g.id, g.name,
            (SELECT COUNT(*) FROM students st
             WHERE st.group_id = g.id AND st.tenant_id = g.tenant_id AND st.status = 'active') AS student_count
     FROM groups g
     WHERE g.tenant_id = ?
     ORDER BY g.name ASC`,
    p.tenantId!,
  );

  for (const g of grps) {
    rooms.push({
      id: await groupRoomId(p.tenantId!, g.id),
      title: g.name,
      subtitle: `${Number(g.student_count || 0)} ta o‘quvchi · Yopiq guruh`,
      type: "group",
      canModerate: true,
    });
  }
  rooms.push({ ...PUBLIC_ROOM_BASE, canModerate: false });

  return c.json({
    enabled: true,
    firebase_db_url,
    rooms,
    me: {
      id: "tch_" + p.userId,
      name: p.name || "O‘qituvchi",
      role: "teacher",
      badge: "O‘qituvchi",
    },
  });
});
