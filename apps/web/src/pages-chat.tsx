import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Globe,
  KeyRound,
  Lock,
  MessageCircle,
  Pin,
  Reply,
  Send,
  ShieldAlert,
  Smile,
  Trash2,
  UserCheck,
  VolumeX,
  X,
} from "lucide-react";
import { Busy, ErrorBox, useToast } from "./ui";

type ChatRoomMeta = {
  id: string;
  title: string;
  subtitle: string;
  type: "public" | "group";
  canModerate: boolean;
};

type ChatUser = {
  id: string;
  name: string;
  role: "student" | "teacher" | "owner" | "guest";
  code?: string;
  badge: string;
};

type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderBadge?: string;
  text: string;
  ts: number;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  } | null;
};

type RoomState = {
  messages: Record<string, Omit<ChatMessage, "id">>;
  pin: { id: string; senderName: string; text: string; ts: number } | null;
  mutes: Record<string, number>;
};

const EMPTY_ROOM: RoomState = { messages: {}, pin: null, mutes: {} };
const MAX_ROOM_MESSAGES = 200;
const QUICK_EMOJIS = ["👍", "🔥", "🎉", "👏", "😂", "❤️", "🤔", "💡", "✅", "📚", "🎯", "🏆"];
const NAME_COLORS = [
  "#0c8066",
  "#1d4ed8",
  "#7c3aed",
  "#b45309",
  "#be123c",
  "#0f766e",
  "#4338ca",
  "#9a3412",
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function initials(name: string): string {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function fmtTime(ts: number): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

function fmtDay(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return "Bugun";
  const yest = new Date(now.getTime() - 86400000);
  if (key(d) === key(yest)) return "Kecha";
  return new Intl.DateTimeFormat("uz-UZ", {
    day: "numeric",
    month: "long",
  }).format(d);
}

function applyFirebaseEvent(
  prev: RoomState,
  eventType: "put" | "patch",
  path: string,
  data: any,
): RoomState {
  if (path === "/" || path === "") {
    if (eventType === "put") {
      if (!data || typeof data !== "object") return EMPTY_ROOM;
      return {
        messages: data.messages && typeof data.messages === "object" ? { ...data.messages } : {},
        pin: data.pin && typeof data.pin === "object" ? data.pin : null,
        mutes: data.mutes && typeof data.mutes === "object" ? { ...data.mutes } : {},
      };
    }
    if (eventType === "patch" && data && typeof data === "object") {
      return {
        messages: data.messages ? { ...prev.messages, ...data.messages } : prev.messages,
        pin: "pin" in data ? data.pin : prev.pin,
        mutes: data.mutes ? { ...prev.mutes, ...data.mutes } : prev.mutes,
      };
    }
    return prev;
  }

  const segs = path.replace(/^\/+/, "").split("/");
  const top = segs[0];

  if (top === "messages") {
    const nextMsgs = { ...prev.messages };
    if (segs.length === 1) {
      if (eventType === "put") {
        return { ...prev, messages: data && typeof data === "object" ? { ...data } : {} };
      }
      if (data && typeof data === "object") {
        for (const [k, v] of Object.entries(data)) {
          if (v === null) delete nextMsgs[k];
          else nextMsgs[k] = v as any;
        }
      }
      return { ...prev, messages: nextMsgs };
    }
    const msgId = segs[1];
    if (segs.length === 2) {
      if (data === null) delete nextMsgs[msgId];
      else if (eventType === "patch" && nextMsgs[msgId]) {
        nextMsgs[msgId] = { ...nextMsgs[msgId], ...data };
      } else {
        nextMsgs[msgId] = data;
      }
      return { ...prev, messages: nextMsgs };
    }
  }

  if (top === "pin") {
    return { ...prev, pin: data && typeof data === "object" ? data : null };
  }

  if (top === "mutes") {
    const nextMutes = { ...prev.mutes };
    if (segs.length === 1) {
      return { ...prev, mutes: data && typeof data === "object" ? { ...data } : {} };
    }
    const uid = segs[1];
    if (data === null) delete nextMutes[uid];
    else nextMutes[uid] = Number(data) || 0;
    return { ...prev, mutes: nextMutes };
  }

  return prev;
}

export function ChatPage({ studioMode = false }: { studioMode?: boolean }) {
  const { code: paramCode } = useParams();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [dbUrl, setDbUrl] = useState("");
  const [rooms, setRooms] = useState<ChatRoomMeta[]>([]);
  const [me, setMe] = useState<ChatUser | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [mobileView, setMobileView] = useState<"list" | "room">("list");

  // Student code & guest nickname states
  const [codeInput, setCodeInput] = useState(() => {
    if (paramCode) return decodeURIComponent(paramCode).toUpperCase();
    try {
      return localStorage.getItem("bilimuz_chat_code") || "";
    } catch {
      return "";
    }
  });
  const [codeError, setCodeError] = useState("");
  const [guestName, setGuestName] = useState(() => {
    try {
      return localStorage.getItem("bilimuz_chat_guest_name") || "";
    } catch {
      return "";
    }
  });
  const [guestDraft, setGuestDraft] = useState("");

  // Live Firebase room state
  const [roomState, setRoomState] = useState<RoomState>(EMPTY_ROOM);
  const [connStatus, setConnStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [activeMsgMenu, setActiveMsgMenu] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Stable guest ID in localStorage
  const guestId = useMemo(() => {
    try {
      let id = localStorage.getItem("bilimuz_chat_guest_id");
      if (!id) {
        id = "gst_" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("bilimuz_chat_guest_id", id);
      }
      return id;
    } catch {
      return "gst_anon";
    }
  }, []);

  async function loadAccess(studentCode?: string) {
    setLoading(true);
    setError(null);
    setCodeError("");
    try {
      // In studio mode (or if no code given, try studio session first silently)
      if (studioMode || (!studentCode && !paramCode)) {
        const sr = await fetch("/api/v2/chat/studio-access", { credentials: "include" });
        if (sr.ok) {
          const d = await sr.json();
          setDbUrl(d.firebase_db_url || "");
          setRooms(d.rooms || []);
          setMe(d.me || null);
          if (d.rooms?.length) {
            setActiveRoomId((prev) =>
              d.rooms.some((r: ChatRoomMeta) => r.id === prev) ? prev : d.rooms[0].id
            );
          }
          setLoading(false);
          return;
        }
        if (studioMode) {
          throw new Error("O‘qituvchi sessiyasi topilmadi. Qayta kiring.");
        }
      }

      const q = studentCode ? "?code=" + encodeURIComponent(studentCode.trim()) : "";
      const r = await fetch("/api/v2/chat/public-access" + q);
      if (!r.ok) throw new Error("Chat ma’lumotlarini yuklab bo‘lmadi");
      const d = await r.json();
      setDbUrl(d.firebase_db_url || "");
      setRooms(d.rooms || []);
      setCodeError(d.code_error || "");
      if (d.me) {
        setMe(d.me);
        try {
          if (studentCode) localStorage.setItem("bilimuz_chat_code", studentCode.trim().toUpperCase());
        } catch {}
      } else {
        setMe(null);
      }
      if (d.rooms?.length) {
        setActiveRoomId((prev) =>
          d.rooms.some((x: ChatRoomMeta) => x.id === prev) ? prev : d.rooms[0].id
        );
        if (studentCode && d.rooms[0]?.type === "group") {
          setMobileView("room");
        }
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAccess(paramCode ? decodeURIComponent(paramCode) : codeInput || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramCode, studioMode]);

  // Cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) || rooms[0] || null,
    [rooms, activeRoomId]
  );

  // Real-time Firebase SSE subscription for activeRoom
  useEffect(() => {
    if (!dbUrl || !activeRoom?.id) return;
    setRoomState(EMPTY_ROOM);
    setConnStatus("connecting");
    setReplyTo(null);
    setActiveMsgMenu(null);

    const url = `${dbUrl}/rooms/${encodeURIComponent(activeRoom.id)}.json`;
    let es: EventSource | null = null;
    let closed = false;

    try {
      es = new EventSource(url);
      es.addEventListener("put", (ev: Event) => {
        if (closed) return;
        try {
          const parsed = JSON.parse((ev as MessageEvent).data);
          setRoomState((prev) => applyFirebaseEvent(prev, "put", parsed.path || "/", parsed.data));
          setConnStatus("live");
        } catch {}
      });
      es.addEventListener("patch", (ev: Event) => {
        if (closed) return;
        try {
          const parsed = JSON.parse((ev as MessageEvent).data);
          setRoomState((prev) => applyFirebaseEvent(prev, "patch", parsed.path || "/", parsed.data));
          setConnStatus("live");
        } catch {}
      });
      es.onerror = () => {
        if (!closed) setConnStatus("error");
      };
    } catch {
      setConnStatus("error");
    }

    return () => {
      closed = true;
      if (es) es.close();
    };
  }, [dbUrl, activeRoom?.id]);

  const messages: ChatMessage[] = useMemo(() => {
    return Object.entries(roomState.messages || {})
      .filter(([, v]) => v && typeof v === "object" && v.text)
      .map(([id, v]) => ({ id, ...(v as any) }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
  }, [roomState.messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, activeRoom?.id]);

  const effectiveUser: ChatUser | null = useMemo(() => {
    if (me) return me;
    if (guestName.trim()) {
      return {
        id: guestId,
        name: guestName.trim(),
        role: "guest",
        badge: "Mehmon",
      };
    }
    return null;
  }, [me, guestName, guestId]);

  const mutedUntil = effectiveUser ? Number(roomState.mutes?.[effectiveUser.id] || 0) : 0;
  const isMuted = mutedUntil > Date.now() && !activeRoom?.canModerate;

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!dbUrl || !activeRoom || !effectiveUser || sending || cooldown > 0 || isMuted) return;
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const payload = {
        senderId: effectiveUser.id,
        senderName: effectiveUser.name,
        senderRole: effectiveUser.role,
        senderBadge: effectiveUser.badge,
        text: body.slice(0, 1000),
        ts: Date.now(),
        replyTo: replyTo
          ? {
              id: replyTo.id,
              senderName: replyTo.senderName,
              text: replyTo.text.slice(0, 120),
            }
          : null,
      };
      const res = await fetch(
        `${dbUrl}/rooms/${encodeURIComponent(activeRoom.id)}/messages.json`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) throw new Error("Xabar yuborilmadi (Firebase ruxsatlarini tekshiring)");
      setText("");
      setReplyTo(null);
      setShowEmoji(false);
      setCooldown(3);

      // Auto-prune excess messages beyond MAX_ROOM_MESSAGES (keeps Firebase tiny forever)
      if (messages.length >= MAX_ROOM_MESSAGES) {
        const excess = messages.slice(0, messages.length - MAX_ROOM_MESSAGES + 1);
        const patchBody: Record<string, null> = {};
        for (const m of excess) patchBody[m.id] = null;
        fetch(`${dbUrl}/rooms/${encodeURIComponent(activeRoom.id)}/messages.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        }).catch(() => {});
      }
    } catch (err: any) {
      toast(err?.message || "Xatolik yuz berdi");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  async function deleteMessage(msgId: string) {
    if (!dbUrl || !activeRoom) return;
    try {
      await fetch(
        `${dbUrl}/rooms/${encodeURIComponent(activeRoom.id)}/messages/${encodeURIComponent(msgId)}.json`,
        { method: "DELETE" }
      );
      setActiveMsgMenu(null);
      toast("Xabar o‘chirildi");
    } catch {
      toast("O‘chirishda xatolik");
    }
  }

  async function pinMessage(msg: ChatMessage | null) {
    if (!dbUrl || !activeRoom || !activeRoom.canModerate) return;
    try {
      await fetch(
        `${dbUrl}/rooms/${encodeURIComponent(activeRoom.id)}/pin.json`,
        {
          method: msg ? "PUT" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: msg
            ? JSON.stringify({
                id: msg.id,
                senderName: msg.senderName,
                text: msg.text.slice(0, 220),
                ts: msg.ts,
              })
            : undefined,
        }
      );
      setActiveMsgMenu(null);
      toast(msg ? "Xabar tepaga qadaldi" : "Qadalgan xabar olindi");
    } catch {
      toast("Amalni bajarib bo‘lmadi");
    }
  }

  async function muteUser(senderId: string, senderName: string, minutes: number) {
    if (!dbUrl || !activeRoom || !activeRoom.canModerate) return;
    try {
      await fetch(
        `${dbUrl}/rooms/${encodeURIComponent(activeRoom.id)}/mutes/${encodeURIComponent(senderId)}.json`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Date.now() + minutes * 60000),
        }
      );
      setActiveMsgMenu(null);
      toast(`${senderName} ${minutes} daqiqaga cheklandi`);
    } catch {
      toast("Cheklashda xatolik");
    }
  }

  function saveGuest(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = guestDraft.trim().slice(0, 40);
    if (cleaned.length < 2) return;
    setGuestName(cleaned);
    try {
      localStorage.setItem("bilimuz_chat_guest_name", cleaned);
    } catch {}
  }

  function logoutStudentCode() {
    setCodeInput("");
    try {
      localStorage.removeItem("bilimuz_chat_code");
    } catch {}
    loadAccess("");
  }

  if (loading) {
    return (
      <div className={studioMode ? "" : "public-page-wrap"}>
        <Busy />
      </div>
    );
  }

  if (error) {
    return (
      <div className={studioMode ? "" : "public-page-wrap"}>
        <ErrorBox error={error} />
      </div>
    );
  }

  if (!dbUrl) {
    return (
      <div className={studioMode ? "panel" : "policy-page"} style={{ textAlign: "center", padding: "48px 20px" }}>
        <MessageCircle size={42} style={{ color: "#162d3d", marginBottom: 12 }} />
        <h2>Jonli Chat hali ulanmagan</h2>
        <p className="muted" style={{ maxWidth: 480, margin: "8px auto 18px" }}>
          Platforma administratori <strong>Owner → Sozlamalar</strong> bo‘limida Firebase Realtime Database manzilini kiritishi bilan barcha sinf guruhlari va umumiy chat darhol ishga tushadi.
        </p>
        {!studioMode && (
          <Link to="/" className="btn primary">
            Bosh sahifaga qaytish
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={studioMode ? "chat-page-studio" : "chat-page-public"}>
      {!studioMode && (
        <header className="chat-topbar">
          <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }} className="btn secondary tiny">
            <ArrowLeft size={15} /> Orqaga
          </Link>
          <div className="chat-topbar-title">
            <MessageCircle size={18} />
            <strong>Bilim UZ Jonli Chat</strong>
          </div>
          {me?.code ? (
            <Link to={"/student/" + encodeURIComponent(me.code)} className="btn secondary tiny">
              Kabinetim
            </Link>
          ) : (
            <Link to="/studio" className="btn secondary tiny">
              O‘qituvchi
            </Link>
          )}
        </header>
      )}

      <div className={`chat-shell ${mobileView === "room" ? "show-room" : "show-list"}`}>
        {/* LEFT SIDEBAR: ROOMS + STUDENT CODE LOGIN */}
        <aside className="chat-sidebar">
          <div className="chat-sidebar-head">
            <h3>Guruhlar</h3>
            <span className="pill neutral">{rooms.length} ta</span>
          </div>

          {!studioMode && (!me || me.role === "student") && (
            <div className="chat-code-box">
              {me?.role === "student" ? (
                <div className="chat-code-active">
                  <div>
                    <small className="muted">O‘quvchi kodi: {me.code}</small>
                    <strong>{me.name}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn secondary tiny"
                    onClick={logoutStudentCode}
                    title="Boshqa kod bilan kirish"
                  >
                    Almashtirish
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (codeInput.trim()) loadAccess(codeInput.trim());
                  }}
                >
                  <label className="chat-code-label">
                    <KeyRound size={13} /> Yopiq guruhingizga kirish
                  </label>
                  <div className="chat-code-row">
                    <input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      placeholder="O‘quvchi kodi (K48291)"
                      maxLength={24}
                    />
                    <button type="submit" className="btn primary tiny">
                      Kirish
                    </button>
                  </div>
                  {codeError && <small className="chat-code-err">{codeError}</small>}
                </form>
              )}
            </div>
          )}

          <div className="chat-room-list">
            {rooms.map((r) => {
              const active = activeRoom?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  className={active ? "chat-room-item is-active" : "chat-room-item"}
                  onClick={() => {
                    setActiveRoomId(r.id);
                    setMobileView("room");
                  }}
                >
                  <span className={`chat-room-avatar ${r.type === "public" ? "is-public" : "is-group"}`}>
                    {r.type === "public" ? <Globe size={18} /> : <Lock size={17} />}
                  </span>
                  <span className="chat-room-meta">
                    <strong>{r.title}</strong>
                    <small>{r.subtitle}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* RIGHT PANE: ACTIVE CHAT ROOM */}
        <section className="chat-main">
          {activeRoom && (
            <>
              <div className="chat-room-header">
                <button
                  type="button"
                  className="chat-back-btn"
                  onClick={() => setMobileView("list")}
                  aria-label="Guruhlar ro‘yxati"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className={`chat-room-avatar ${activeRoom.type === "public" ? "is-public" : "is-group"}`}>
                  {activeRoom.type === "public" ? <Globe size={18} /> : <Lock size={17} />}
                </span>
                <div className="chat-room-header-info">
                  <strong>{activeRoom.title}</strong>
                  <small>{activeRoom.subtitle}</small>
                </div>
                <span className={`chat-live-pill is-${connStatus}`}>
                  {connStatus === "live"
                    ? "● Jonli"
                    : connStatus === "connecting"
                      ? "○ Ulanmoqda"
                      : "● Qayta ulanmoqda"}
                </span>
              </div>

              {roomState.pin && (
                <div className="chat-pin-bar">
                  <Pin size={15} className="chat-pin-ico" />
                  <div className="chat-pin-copy">
                    <small>Qadalgan xabar · {roomState.pin.senderName}</small>
                    <span>{roomState.pin.text}</span>
                  </div>
                  {activeRoom.canModerate && (
                    <button
                      type="button"
                      className="chat-icon-btn"
                      onClick={() => pinMessage(null)}
                      title="Qadashni olib tashlash"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              )}

              <div className="chat-feed" ref={feedRef}>
                {messages.length === 0 ? (
                  <div className="chat-empty">
                    <MessageCircle size={32} />
                    <strong>Hali xabarlar yo‘q</strong>
                    <small>Birinchi bo‘lib salom yo‘llang!</small>
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const prev = idx > 0 ? messages[idx - 1] : null;
                    const showDay = !prev || fmtDay(prev.ts) !== fmtDay(m.ts);
                    const isMine = effectiveUser && m.senderId === effectiveUser.id;
                    const canDelete = isMine || activeRoom.canModerate;
                    const menuOpen = activeMsgMenu === m.id;
                    return (
                      <React.Fragment key={m.id}>
                        {showDay && (
                          <div className="chat-day-sep">
                            <span>{fmtDay(m.ts)}</span>
                          </div>
                        )}
                        <div className={`chat-msg-row ${isMine ? "is-mine" : "is-other"}`}>
                          {!isMine && (
                            <span
                              className="chat-msg-avatar"
                              style={{ background: colorFor(m.senderId) }}
                            >
                              {initials(m.senderName)}
                            </span>
                          )}
                          <div
                            className={`chat-bubble ${isMine ? "is-mine" : "is-other"}`}
                            onClick={() => setActiveMsgMenu(menuOpen ? null : m.id)}
                          >
                            {!isMine && (
                              <div className="chat-bubble-author">
                                <strong style={{ color: colorFor(m.senderId) }}>
                                  {m.senderName}
                                </strong>
                                {(m.senderRole === "teacher" || m.senderRole === "owner") && (
                                  <span className="chat-role-badge">
                                    {m.senderRole === "owner" ? "Admin" : "O‘qituvchi"}
                                  </span>
                                )}
                              </div>
                            )}
                            {m.replyTo && (
                              <div className="chat-reply-quote">
                                <strong>{m.replyTo.senderName}</strong>
                                <span>{m.replyTo.text}</span>
                              </div>
                            )}
                            <div className="chat-bubble-text">{m.text}</div>
                            <div className="chat-bubble-foot">
                              <span>{fmtTime(m.ts)}</span>
                            </div>

                            {menuOpen && (
                              <div
                                className="chat-msg-actions"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyTo(m);
                                    setActiveMsgMenu(null);
                                    inputRef.current?.focus();
                                  }}
                                >
                                  <Reply size={13} /> Javob
                                </button>
                                {activeRoom.canModerate && (
                                  <button type="button" onClick={() => pinMessage(m)}>
                                    <Pin size={13} /> Qadash
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    type="button"
                                    className="is-danger"
                                    onClick={() => deleteMessage(m.id)}
                                  >
                                    <Trash2 size={13} /> O‘chirish
                                  </button>
                                )}
                                {activeRoom.canModerate &&
                                  !isMine &&
                                  m.senderRole !== "teacher" &&
                                  m.senderRole !== "owner" && (
                                    <button
                                      type="button"
                                      className="is-danger"
                                      onClick={() => muteUser(m.senderId, m.senderName, 10)}
                                    >
                                      <VolumeX size={13} /> 10 daq mute
                                    </button>
                                  )}
                              </div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              {/* BOTTOM COMPOSER */}
              {!effectiveUser ? (
                <form className="chat-guest-bar" onSubmit={saveGuest}>
                  <UserCheck size={17} />
                  <input
                    value={guestDraft}
                    onChange={(e) => setGuestDraft(e.target.value)}
                    placeholder="Umumiy chatda yozish uchun ismingizni kiriting..."
                    minLength={2}
                    maxLength={40}
                    required
                  />
                  <button type="submit" className="btn primary tiny">
                    Boshlash
                  </button>
                </form>
              ) : isMuted ? (
                <div className="chat-muted-bar">
                  <ShieldAlert size={16} />
                  <span>
                    Siz vaqtincha yozishdan cheklangansiz (
                    {Math.max(1, Math.ceil((mutedUntil - Date.now()) / 60000))} daqiqa qoldi).
                  </span>
                </div>
              ) : (
                <div className="chat-composer-wrap">
                  {replyTo && (
                    <div className="chat-reply-bar">
                      <Reply size={14} />
                      <div className="chat-reply-bar-copy">
                        <strong>{replyTo.senderName}</strong>
                        <span>{replyTo.text}</span>
                      </div>
                      <button
                        type="button"
                        className="chat-icon-btn"
                        onClick={() => setReplyTo(null)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}

                  {showEmoji && (
                    <div className="chat-emoji-pop">
                      {QUICK_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            setText((t) => t + em);
                            inputRef.current?.focus();
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}

                  <form className="chat-composer" onSubmit={sendMessage}>
                    <button
                      type="button"
                      className="chat-icon-btn"
                      onClick={() => setShowEmoji((v) => !v)}
                      title="Emoji"
                    >
                      <Smile size={20} />
                    </button>
                    <input
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Xabar yozing..."
                      maxLength={1000}
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      className="chat-send-btn"
                      disabled={sending || cooldown > 0 || !text.trim()}
                      title={cooldown > 0 ? `${cooldown} soniya kuting` : "Yuborish"}
                    >
                      {cooldown > 0 ? cooldown : <Send size={18} />}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
