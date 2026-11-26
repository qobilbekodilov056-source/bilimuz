import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  Gamepad2,
  Maximize2,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Field, Modal, PageTitle, Pill, useData, useDebounce, useToast, SmartBackLink } from "./ui";

const MODE_META: Record<string, { label: string; tone: "green" | "blue" | "amber" | "neutral" }> = {
  duel: { label: "1 vs 1 Duel", tone: "amber" },
  team: { label: "Jamoaviy", tone: "green" },
  multiplayer: { label: "Multiplayer", tone: "blue" },
  solo: { label: "Yakka o‘yin", tone: "neutral" },
};

function buildGameUrl(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    const savedCode = typeof localStorage !== "undefined" ? localStorage.getItem("bilimuz_student_code") || "" : "";
    if (savedCode && !u.searchParams.has("code")) {
      u.searchParams.set("code", savedCode);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

// ============================================================================
// 1. PUBLIC GAMES CATALOG (/games)
// ============================================================================
export function GamesCatalogPage() {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const q = useDebounce(search, 200);
  const stCode = (() => { try { return localStorage.getItem("bilimuz_student_code") || ""; } catch { return ""; } })();
  const data = useData(
    `/api/v2/games?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}${stCode ? "&student_code=" + encodeURIComponent(stCode) : ""}`,
  );
  const items: any[] = data.data?.items || [];

  function trackPlay(id: string) {
    fetch(`/api/v2/games/${encodeURIComponent(id)}/play${stCode ? "?student_code=" + encodeURIComponent(stCode) : ""}`, { method: "POST" }).catch(() => {});
  }

  return (
    <div className="exam-join lib-page">
      <SmartBackLink />

      <div className="panel lib-hero">
        <span className="eyebrow">BILIM UZ · O‘YINLAR MARKAZI</span>
        <h1 style={{ margin: "6px 0 8px" }}>Ta’limiy o‘yinlar va bellashuvlar</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          1 vs 1 bilim duellari, jamoaviy sinf musobaqalari va interaktiv mashq o‘yinlari — alohida tezkor serverlarda ishlaydi.
        </p>

        <div className="lib-search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="O‘yin nomi yoki fan bo‘yicha qidirish…"
          />
        </div>

        <div className="lib-subjects">
          {[
            ["", "Barchasi"],
            ["duel", "1 vs 1 Duel"],
            ["team", "Jamoaviy"],
            ["multiplayer", "Multiplayer"],
            ["solo", "Yakka o‘yin"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={mode === v ? "btn primary tiny" : "btn secondary tiny"}
              onClick={() => setMode(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {data.loading ? (
        <Busy />
      ) : (data.error as any)?.status === 403 ? (
        <div className="panel" style={{ textAlign: "center", padding: "36px 24px", maxWidth: 560, margin: "20px auto" }}>
          <h2 style={{ margin: "0 0 8px" }}>O‘yinlar bo‘limi yopiq</h2>
          <p className="muted" style={{ margin: "0 0 18px" }}>
            O‘yinlar faqat o‘quv markazi va maktab kabineti hamda undagi o‘quvchilar (o‘quvchi kodi orqali) uchun ochiq.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/student" className="btn primary">O‘quvchi kodi bilan kirish</Link>
            <Link to="/login" className="btn secondary">O‘qituvchi kirishi</Link>
          </div>
        </div>
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !items.length ? (
        <div className="panel">
          <Empty
            title="Hali o‘yinlar qo‘shilmagan"
            text="Tez orada bu yerda 1 vs 1 bilim dueli va jamoaviy sinf o‘yinlari paydo bo‘ladi!"
          />
        </div>
      ) : (
        <div className="games-grid">
          {items.map((g: any) => {
            const mm = MODE_META[g.mode] || MODE_META.multiplayer;
            return (
              <article className="panel game-card" key={g.id}>
                <div className="game-cover">
                  {g.cover_url ? (
                    <img src={g.cover_url} alt={g.title} />
                  ) : (
                    <div className="game-cover-placeholder">
                      <Gamepad2 size={38} />
                      <span>{g.category}</span>
                    </div>
                  )}
                  <div className="game-cover-badge">
                    <Pill tone={mm.tone}>{mm.label}</Pill>
                  </div>
                </div>

                <div className="game-card-body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <small className="muted">{g.category}</small>
                    <small className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Users size={13} /> {g.plays_count || 0} marta
                    </small>
                  </div>
                  <h2 style={{ margin: "4px 0 6px", fontSize: 18 }}>{g.title}</h2>
                  {g.description && <p className="hw-desc">{g.description}</p>}

                  <div className="game-card-foot">
                    {g.open_mode === "newtab" ? (
                      <a
                        href={buildGameUrl(g.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn primary full"
                        onClick={() => trackPlay(g.id)}
                      >
                        <Play size={16} /> O‘ynash <ExternalLink size={14} />
                      </a>
                    ) : (
                      <Link
                        to={"/games/" + encodeURIComponent(g.id)}
                        className="btn primary full"
                        onClick={() => trackPlay(g.id)}
                      >
                        <Play size={16} /> O‘ynash
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 2. IMMERSIVE GAME PLAYER (/games/:id)
// ============================================================================
export function GamePlayPage() {
  const { id = "" } = useParams();
  const stCode = (() => { try { return localStorage.getItem("bilimuz_student_code") || ""; } catch { return ""; } })();
  const data = useData("/api/v2/games/" + encodeURIComponent(id) + (stCode ? "?student_code=" + encodeURIComponent(stCode) : ""));
  const wrapRef = useRef<HTMLDivElement>(null);
  const g = data.data?.game;

  useEffect(() => {
    if (id) {
      fetch(`/api/v2/games/${encodeURIComponent(id)}/play`, { method: "POST" }).catch(() => {});
    }
  }, [id]);

  function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }

  if (data.loading) return <Busy />;
  if (data.error || !g) {
    return (
      <div className="exam-join">
        <Link to="/games" className="back-link">
          <ArrowLeft size={17} /> O‘yinlarga qaytish
        </Link>
        <ErrorBox error={data.error || new Error("O‘yin topilmadi")} retry={data.reload} />
      </div>
    );
  }

  const finalUrl = buildGameUrl(g.url);

  return (
    <div className="game-player-shell" ref={wrapRef}>
      <header className="game-player-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link to="/games" className="btn secondary tiny">
            <ArrowLeft size={15} /> O‘yinlar
          </Link>
          <strong className="game-player-title">{g.title}</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="btn secondary tiny" onClick={toggleFullscreen}>
            <Maximize2 size={14} /> To‘liq ekran
          </button>
          <a href={finalUrl} target="_blank" rel="noreferrer" className="btn primary tiny">
            <ExternalLink size={14} /> Yangi oyna
          </a>
        </div>
      </header>
      <iframe
        src={finalUrl}
        title={g.title}
        className="game-player-iframe"
        allow="fullscreen; autoplay; clipboard-read; clipboard-write"
      />
    </div>
  );
}

// ============================================================================
// 3. OWNER GAMES MANAGER (/owner/games)
// ============================================================================
export function OwnerGamesPage() {
  const base = "/api/v2/owner/games";
  const data = useData(base);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const items: any[] = data.data?.items || [];

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(base + (edit?.id ? "/" + edit.id : ""), {
        method: edit?.id ? "PUT" : "POST",
        data: {
          title: String(f.title || ""),
          description: String(f.description || ""),
          category: String(f.category || "Viktorina"),
          mode: String(f.mode || "multiplayer"),
          url: String(f.url || ""),
          cover_url: String(f.cover_url || ""),
          open_mode: String(f.open_mode || "embed"),
          active: f.active === "on",
        },
      });
      setEdit(null);
      data.reload();
      toast("O‘yin saqlandi");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(g: any) {
    if (!confirm(`"${g.title}" o‘yinini o‘chirasizmi?`)) return;
    setBusy(true);
    try {
      await api(base + "/" + g.id, { method: "DELETE" });
      data.reload();
      toast("O‘yin o‘chirildi");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="O‘YINLAR MARKAZI"
        title="O‘yinlarni boshqarish"
        description="GitHub Pages yoki alohida multiplayer serverda joylashgan o‘yinlarni Bilim UZ ga ulang."
        actions={
          <>
            <Link to="/games" target="_blank" className="btn secondary">
              O‘yinlar sahifasini ko‘rish
            </Link>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setError(null);
                setEdit({ mode: "duel", open_mode: "embed", category: "Bilim dueli", active: 1 });
              }}
            >
              <Plus size={16} /> Yangi o‘yin qo‘shish
            </button>
          </>
        }
      />

      {!!error && !edit && <ErrorBox error={error} />}

      <div className="panel">
        {data.loading ? (
          <Busy />
        ) : data.error ? (
          <ErrorBox error={data.error} retry={data.reload} />
        ) : !items.length ? (
          <Empty
            title="Hali o‘yinlar qo‘shilmagan"
            text="«Yangi o‘yin qo‘shish» tugmasini bosib tashqi o‘yin havolasini kiriting."
          />
        ) : (
          <div className="moderation-list">
            {items.map((g: any) => {
              const mm = MODE_META[g.mode] || MODE_META.multiplayer;
              return (
                <article className="panel" key={g.id} style={{ padding: 14 }}>
                  <div className="panel-title" style={{ marginBottom: 6 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong>{g.title}</strong>
                        <Pill tone={mm.tone}>{mm.label}</Pill>
                        <Pill tone={g.active ? "green" : "neutral"}>
                          {g.active ? "Faol" : "Yashirin"}
                        </Pill>
                      </div>
                      <small className="muted" style={{ display: "block", marginTop: 4 }}>
                        {g.category} · {g.open_mode === "embed" ? "Sahifa ichida (iframe)" : "Yangi oynada"} · {g.plays_count} marta o‘ynalgan
                      </small>
                      <small className="muted" style={{ display: "block", wordBreak: "break-all" }}>
                        {g.url}
                      </small>
                    </div>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Tahrirlash"
                        onClick={() => {
                          setError(null);
                          setEdit(g);
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="O‘chirish"
                        disabled={busy}
                        onClick={() => void remove(g)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {edit && (
        <Modal title={edit.id ? "O‘yinni tahrirlash" : "Yangi o‘yin qo‘shish"} close={() => setEdit(null)}>
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={save}>
            <Field label="O‘yin nomi">
              <input name="title" defaultValue={edit.title || ""} required minLength={2} maxLength={120} placeholder="Masalan: Bilim Dueli 1 vs 1" />
            </Field>
            <Field label="O‘yin manzili (URL — GitHub Pages yoki alohida server)">
              <input name="url" type="url" defaultValue={edit.url || ""} required placeholder="https://username.github.io/bilim-duel/" />
            </Field>
            <div className="hw-two-col">
              <Field label="O‘yin rejimi">
                <select name="mode" defaultValue={edit.mode || "duel"}>
                  <option value="duel">1 vs 1 Duel</option>
                  <option value="team">Jamoaviy sinf o‘yini</option>
                  <option value="multiplayer">Multiplayer</option>
                  <option value="solo">Yakka o‘yin</option>
                </select>
              </Field>
              <Field label="Kategoriya / Fan">
                <input name="category" defaultValue={edit.category || "Bilim dueli"} required maxLength={60} />
              </Field>
            </div>
            <Field label="Qisqa tavsif">
              <textarea name="description" rows={3} defaultValue={edit.description || ""} maxLength={1000} placeholder="O‘yin qoidalari va maqsadi haqida qisqacha…" />
            </Field>
            <div className="hw-two-col">
              <Field label="Ochilish usuli">
                <select name="open_mode" defaultValue={edit.open_mode || "embed"}>
                  <option value="embed">Bilim UZ ichida (to‘liq ekran iframe)</option>
                  <option value="newtab">Alohida yangi oynada</option>
                </select>
              </Field>
              <Field label="Muqova rasmi URL (ixtiyoriy)">
                <input name="cover_url" type="url" defaultValue={edit.cover_url || ""} placeholder="https://.../banner.png" />
              </Field>
            </div>
            <label className="mod-check-inline" style={{ marginBottom: 14 }}>
              <input type="checkbox" name="active" defaultChecked={edit.active !== 0} />
              <span>O‘yinlar sahifasida ko‘rsatish (Faol)</span>
            </label>
            <button className="btn primary full" disabled={busy}>
              {busy ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
