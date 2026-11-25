import { useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  Archive,
  Check,
  ClipboardCheck,
  CreditCard,
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  Gamepad2,
  ShoppingBag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { api } from "./api";
import { OwnerGamesPage } from "./pages-games";
import {
  Busy,
  Empty,
  ErrorBox,
  Field,
  Modal,
  PageTitle,
  Pill,
  useData,
  useToast,
} from "./ui";
const base = "/api/v2/owner";
const sections = [
  ["", "Umumiy ko‘rinish", Activity],
  ["teachers", "O‘qituvchilar", Users],
  ["moderation", "Store moderatsiyasi", ClipboardCheck],
  ["games", "O‘yinlar", Gamepad2],
  ["shop", "Do‘kon / Packlar", ShoppingBag],
  ["billing", "To‘lovlar", CreditCard],
  ["reports", "Kontent shikoyatlari", ShieldCheck],
  ["support", "Support inbox", LifeBuoy],
  ["operations", "Operatsiyalar", Archive],
  ["settings", "Sozlamalar", Settings],
] as const;
export function OwnerPage() {
  const user = useData("/api/v2/auth/me");
  const location = useLocation(),
    navigate = useNavigate();
  const section = location.pathname.split("/")[2] || "";
  const [error, setError] = useState<unknown>(null);
  if (user.loading) return <Busy />;
  if (user.error || user.data?.user.scope !== "owner")
    return <Navigate to="/owner/login" replace />;
  async function logout() {
    try {
      await api("/api/v2/auth/logout", { method: "POST", data: {} });
      navigate("/owner/login");
    } catch (e) {
      setError(e);
    }
  }
  return (
    <div className="owner-layout">
      <aside className="owner-dock">
        <Link to="/" className="owner-logo">
          <img className="brand-logo" src="/logo.png" alt="Bilim UZ" />
          Bilim UZ <b>Owner OS</b>
        </Link>
        <Pill tone="green">MFA bilan tasdiqlangan</Pill>
        <nav>
          {sections.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              end={!path}
              to={"/owner" + (path ? "/" + path : "")}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button className="btn secondary" onClick={() => void logout()}>
          <LogOut size={16} />
          Chiqish
        </button>
      </aside>
      <main className="owner-main">
        {!!error && <ErrorBox error={error} />}{" "}
        {section === "" ? (
          <OwnerOverview />
        ) : section === "teachers" ? (
          <OwnerTeachers />
        ) : section === "moderation" ? (
          <Moderation />
        ) : section === "games" ? (
          <OwnerGamesPage />
        ) : section === "shop" ? (
          <OwnerShopPacks />
        ) : section === "billing" ? (
          <OwnerBillingPage />
        ) : section === "reports" ? (
          <OwnerReports />
        ) : section === "support" ? (
          <OwnerSupport />
        ) : section === "operations" ? (
          <OwnerOperations />
        ) : section === "settings" ? (
          <OwnerSettings />
        ) : (
          <Navigate to="/owner" replace />
        )}
      </main>
    </div>
  );
}
function OwnerOverview() {
  const r = useData(base + "/overview");
  if (r.loading) return <Busy />;
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />;
  return (
    <>
      <PageTitle
        eyebrow="PLATFORMA NAZORATI"
        title="Owner OS"
        description="Operatsion ko‘rsatkichlar. O‘quvchilarning shaxsiy natijalari bu yerda ochilmaydi."
      />
      <div className="metrics">
        {[
          ["tenants", "Workspacelar"],
          ["teachers", "Faol o‘qituvchilar"],
          ["questions", "Savollar"],
          ["attempts", "Test urinishlari"],
        ].map(([k, t]) => (
          <div className="metric" key={k}>
            <span>{t}</span>
            <strong>{r.data.stats[k]}</strong>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <h2>E’tibor talab qilmoqda</h2>
          <div className="stat-line">
            <Link to="/owner/moderation">Moderatsiya kutilmoqda</Link>
            <b>{r.data.stats.pending}</b>
          </div>
          <div className="stat-line">
            <Link to="/owner/support">Ochiq murojaatlar</Link>
            <b>{r.data.stats.support_open}</b>
          </div>
          <div className="stat-line">
            <span>Jami kartalar</span>
            <b>{r.data.stats.cards}</b>
          </div>
        </section>
        <section className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Server resurslari va qolgan joy</h2>
            <button type="button" className="btn secondary tiny" onClick={() => r.reload()}>
              Yangilash
            </button>
          </div>

          {(() => {
            const fmtSize = (b: number) => {
              if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + " GB";
              if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + " MB";
              if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
              return b + " B";
            };
            const d1 = r.data.resources?.d1 || {
              used_bytes: r.data.health.storage_bytes,
              limit_bytes: 500 * 1024 * 1024,
              free_bytes: Math.max(0, 500 * 1024 * 1024 - r.data.health.storage_bytes),
              percent: Number(((r.data.health.storage_bytes / (500 * 1024 * 1024)) * 100).toFixed(2)),
            };
            const r2 = r.data.resources?.r2 || {
              used_bytes: 0,
              limit_bytes: 10 * 1024 * 1024 * 1024,
              free_bytes: 10 * 1024 * 1024 * 1024,
              percent: 0,
              files_count: 0,
              breakdown: {},
            };
            const barColor = (pct: number) => (pct >= 85 ? "#dc2626" : pct >= 70 ? "#d97706" : "#0c8066");
            const labels: Array<[string, string]> = [
              ["apk", "Android APK"],
              ["cosmetics", "Do‘kon packlari"],
              ["libpdf", "Kutubxona PDF"],
              ["hw", "Vazifa fayllari"],
              ["qimg", "Savol rasmlari"],
              ["backups", "Backuplar"],
            ];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <strong>D1 Ma’lumotlar bazasi (500 MB)</strong>
                    <Pill tone={d1.percent >= 85 ? "red" : d1.percent >= 70 ? "amber" : "green"}>{d1.percent}% band</Pill>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: Math.max(1, Math.min(100, d1.percent)) + "%", background: barColor(d1.percent), borderRadius: 999 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span>Band: <b>{fmtSize(d1.used_bytes)}</b></span>
                    <span style={{ color: "#0c8066" }}>Bo‘sh qolgan: <b>{fmtSize(d1.free_bytes)}</b></span>
                  </div>
                </div>

                <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <strong>R2 Fayl xotirasi (10 GB · {r2.files_count} ta fayl)</strong>
                    <Pill tone={r2.percent >= 85 ? "red" : r2.percent >= 70 ? "amber" : "green"}>{r2.percent}% band</Pill>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: "#e2e8f0", overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: Math.max(1, Math.min(100, r2.percent)) + "%", background: barColor(r2.percent), borderRadius: 999 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 10 }}>
                    <span>Band: <b>{fmtSize(r2.used_bytes)}</b></span>
                    <span style={{ color: "#0c8066" }}>Bo‘sh qolgan: <b>{fmtSize(r2.free_bytes)}</b></span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))", gap: 6 }}>
                    {labels.map(([k, title]) => {
                      const b = r2.breakdown?.[k] || { bytes: 0, count: 0 };
                      return (
                        <div key={k} style={{ padding: "6px 8px", borderRadius: 8, background: "#fff", border: "1px solid var(--line)", fontSize: 11.5 }}>
                          <span className="muted" style={{ display: "block" }}>{title}</span>
                          <strong>{fmtSize(b.bytes)}</strong> <small className="muted">({b.count})</small>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="stat-line">
                  <span>Oxirgi backup</span>
                  <b>
                    {r.data.health.last_backup
                      ? new Date(r.data.health.last_backup.created_at * 1000).toLocaleString()
                      : "Hali yaratilmagan"}
                  </b>
                </div>
                <small className="muted">{r.data.usage_notice}</small>
              </div>
            );
          })()}
        </section>
      </div>
    </>
  );
}
function OwnerTeachers() {
  const r = useData(base + "/teachers?limit=100"),
    [item, setItem] = useState<any>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(base + "/teachers/" + item.id + "/status", {
        method: "POST",
        data: {
          status: item.status === "active" ? "blocked" : "active",
          reason,
        },
      });
      setItem(null);
      r.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="O‘qituvchi workspacelari"
        description="Bloklash barcha teacher sessiyalarini bekor qiladi va testga kirishni yopadi."
      />
      <div className="panel">
        {r.loading ? (
          <Busy />
        ) : r.error ? (
          <ErrorBox error={r.error} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>O‘qituvchi</th>
                  <th>Holat</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {r.data.items.map((t: any) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      {t.display_name}
                      <small>{t.email || "Telegram"}</small>
                    </td>
                    <td>
                      <Pill tone={t.status === "active" ? "green" : "red"}>
                        {t.status}
                      </Pill>
                    </td>
                    <td>
                      <button
                        className="btn secondary tiny"
                        onClick={() => {
                          setItem(t);
                          setReason("");
                          setError(null);
                        }}
                      >
                        {t.status === "active" ? "Bloklash" : "Faollashtirish"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {item && (
        <Modal
          title="Workspace holatini o‘zgartirish"
          close={() => setItem(null)}
        >
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={save}>
            <Field label="Asos (audit logga yoziladi)">
              <textarea
                minLength={10}
                maxLength={1000}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              Tasdiqlash
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Moderation() {
  const [status, setStatus] = useState("pending"),
    [item, setItem] = useState<any>(null),
    [decision, setDecision] = useState("approved"),
    [reason, setReason] = useState(""),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [qSearch, setQSearch] = useState(""),
    [authorFilter, setAuthorFilter] = useState(""),
    [catFilter, setCatFilter] = useState(""),
    [levelFilter, setLevelFilter] = useState(""),
    [hideDuplicates, setHideDuplicates] = useState(false),
    [selectedIds, setSelectedIds] = useState<string[]>([]);
  const r = useData(base + "/moderation?status=" + status + "&limit=200");
  const mc = useData(base + "/market-cards?status=" + status);
  const lb = useData(base + "/library-books?status=" + status);
  async function reviewLibraryBook(bookId: string, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await api(base + "/library-books/" + bookId, { method: "POST", data: { decision } });
      lb.reload();
      toast(decision === "approved" ? "Kitob ochiq kutubxonaga chiqarildi" : "Kitob rad etildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const toast = useToast();
  async function reviewMarketCard(cardId: string, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await api(base + "/market-cards/" + cardId, { method: "POST", data: { decision } });
      mc.reload();
      toast(decision === "approved" ? "Kartochka marketga chiqarildi" : "Kartochka rad etildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(base + "/moderation/" + item.id, {
        method: "POST",
        data: { decision, reason },
      });
      setItem(null);
      r.reload();
      toast("Moderatsiya qarori auditga yozildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const allSubs: any[] = r.data?.items || [];
  const authorOf = (s: any) => (s.tenant_name || s.attribution || "Noma’lum muallif").trim();
  const authors = Array.from(new Set(allSubs.map(authorOf))).sort();
  const categories = Array.from(new Set(allSubs.map((s) => s.content?.category || "Umumiy"))).sort();
  const filteredSubs = allSubs.filter((s) => {
    if (authorFilter && authorOf(s) !== authorFilter) return false;
    if (catFilter && (s.content?.category || "Umumiy") !== catFilter) return false;
    if (levelFilter && (s.content?.level || "") !== levelFilter) return false;
    if (hideDuplicates && s.duplicate_count > 0) return false;
    if (qSearch.trim()) {
      const needle = qSearch.trim().toLowerCase();
      const hay = `${s.content?.title || ""} ${s.content?.category || ""} ${s.content?.topic || ""} ${authorOf(s)}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const filteredIds = filteredSubs.map((s) => s.id);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  function toggleOne(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }
  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  }
  async function bulkReview(bulkDecision: "approved" | "rejected") {
    const targetIds = selectedIds.filter((id) => filteredIds.includes(id));
    if (!targetIds.length) return;
    const label = bulkDecision === "approved" ? "ommaga nashr qilish" : "rad etish";
    if (!confirm(`Tanlangan ${targetIds.length} ta savolni ${label}ni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api(base + "/moderation/bulk", {
        method: "POST",
        data: { ids: targetIds, decision: bulkDecision },
      });
      setSelectedIds([]);
      r.reload();
      toast(
        bulkDecision === "approved"
          ? `${res.processed} ta savol nashr qilindi`
          : `${res.processed} ta savol rad etildi`,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const activeSelectedCount = selectedIds.filter((id) => filteredIds.includes(id)).length;
  return (
    <>
      <PageTitle
        title="Store moderatsiyasi"
        description="Faqat muallif ixtiyoriy yuborgan savollar ko‘rsatiladi."
      />
      <div className="tabs">
        {[
          ["pending", "Kutilmoqda"],
          ["approved", "Tasdiqlangan"],
          ["rejected", "Rad etilgan"],
          ["changes_requested", "Tahrir kerak"],
          ["revoked", "Qaytarilgan"],
        ].map(([v, t]) => (
          <button
            key={v}
            className={status === v ? "active" : ""}
            onClick={() => { setStatus(v); setSelectedIds([]); }}
          >
            {t}
          </button>
        ))}
      </div>
      {!!error && <ErrorBox error={error} />}
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-title">
          <h2>Test kartochkalari marketi ({mc.data?.items?.length || 0})</h2>
        </div>
        {mc.loading ? (
          <Busy />
        ) : !mc.data?.items?.length ? (
          <p className="muted" style={{ margin: 0 }}>Ushbu holatda test kartochkalari yo‘q.</p>
        ) : (
          <div className="moderation-list">
            {mc.data.items.map((c: any) => (
              <article className="panel" key={c.id} style={{ padding: 14 }}>
                <div className="panel-title">
                  <div>
                    <strong>{c.title}</strong>
                    <small className="muted" style={{ display: "block" }}>
                      {c.tenant_name} · {c.category || "Umumiy"} · {c.question_count} savol · {c.slug}
                    </small>
                  </div>
                  <div className="actions">
                    {c.market_status !== "approved" && (
                      <button
                        type="button"
                        className="btn primary tiny"
                        disabled={busy}
                        onClick={() => void reviewMarketCard(c.id, "approved")}
                      >
                        Tasdiqlash
                      </button>
                    )}
                    {c.market_status !== "rejected" && (
                      <button
                        type="button"
                        className="btn danger tiny"
                        disabled={busy}
                        onClick={() => void reviewMarketCard(c.id, "rejected")}
                      >
                        Rad etish
                      </button>
                    )}
                  </div>
                </div>
                {c.description && <p className="muted" style={{ margin: "6px 0 0" }}>{c.description}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-title">
          <h2>Kutubxona kitoblari moderatsiyasi ({lb.data?.items?.length || 0})</h2>
        </div>
        {lb.loading ? (
          <Busy />
        ) : !lb.data?.items?.length ? (
          <p className="muted" style={{ margin: 0 }}>Ushbu holatda kutubxona kitoblari yo‘q.</p>
        ) : (
          <div className="moderation-list">
            {lb.data.items.map((b: any) => (
              <article className="panel" key={b.id} style={{ padding: 14 }}>
                <div className="panel-title">
                  <div>
                    <strong>{b.title}</strong>
                    <small className="muted" style={{ display: "block" }}>
                      {b.tenant_name} · {b.subject} · {b.chapter_count} ta bob
                    </small>
                  </div>
                  <div className="actions">
                    {b.moderation_status !== "approved" && (
                      <button
                        type="button"
                        className="btn primary tiny"
                        disabled={busy}
                        onClick={() => void reviewLibraryBook(b.id, "approved")}
                      >
                        Tasdiqlash
                      </button>
                    )}
                    {b.moderation_status !== "rejected" && (
                      <button
                        type="button"
                        className="btn danger tiny"
                        disabled={busy}
                        onClick={() => void reviewLibraryBook(b.id, "rejected")}
                      >
                        Rad etish
                      </button>
                    )}
                  </div>
                </div>
                {b.summary && <p className="muted" style={{ margin: "6px 0 0" }}>{b.summary}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
      <div className="panel">
        <div className="panel-title" style={{ marginBottom: 12 }}>
          <h2>Savollar do‘koni moderatsiyasi ({filteredSubs.length} / {allSubs.length})</h2>
        </div>
        {!r.loading && !r.error && allSubs.length > 0 && (
          <>
            <div className="mod-filter-bar">
              <input
                type="search"
                value={qSearch}
                onChange={(e) => setQSearch(e.target.value)}
                placeholder="Savol, mavzu yoki muallif qidirish…"
              />
              <select value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
                <option value="">Barcha mualliflar ({authors.length})</option>
                {authors.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option value="">Barcha fanlar ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                <option value="">Barcha darajalar</option>
                <option value="easy">Oson</option>
                <option value="medium">O‘rtacha</option>
                <option value="hard">Qiyin</option>
                <option value="expert">Ekspert</option>
              </select>
              <label className="mod-check-inline">
                <input
                  type="checkbox"
                  checked={hideDuplicates}
                  onChange={(e) => setHideDuplicates(e.target.checked)}
                />
                <span>Dublikatlarni yashirish</span>
              </label>
            </div>

            <div className="mod-bulk-bar">
              <label className="mod-check-inline">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAllFiltered}
                />
                <strong>Barchasini belgilash ({filteredSubs.length})</strong>
              </label>
              <div className="actions">
                {status !== "approved" && (
                  <button
                    type="button"
                    className="btn primary tiny"
                    disabled={busy || activeSelectedCount === 0}
                    onClick={() => void bulkReview("approved")}
                  >
                    Tanlanganlarni nashr qilish ({activeSelectedCount})
                  </button>
                )}
                {status !== "rejected" && (
                  <button
                    type="button"
                    className="btn danger tiny"
                    disabled={busy || activeSelectedCount === 0}
                    onClick={() => void bulkReview("rejected")}
                  >
                    Rad etish ({activeSelectedCount})
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {r.loading ? (
          <Busy />
        ) : r.error ? (
          <ErrorBox error={r.error} retry={r.reload} />
        ) : !filteredSubs.length ? (
          <Empty
            title={allSubs.length ? "Filtr bo‘yicha savol topilmadi" : "Navbat bo‘sh"}
            text={allSubs.length ? "Filtrlarni tozalab qayta urinib ko‘ring." : "Ushbu holatda takliflar yo‘q."}
          />
        ) : (
          filteredSubs.map((s: any) => {
            const checked = selectedIds.includes(s.id);
            const lvlMap: Record<string, string> = {
              easy: "Oson",
              medium: "O‘rtacha",
              hard: "Qiyin",
              expert: "Ekspert",
            };
            return (
              <article className={"moderation-row" + (checked ? " is-selected" : "")} key={s.id}>
                <div className="mod-row-left">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(s.id)}
                    aria-label="Savolni belgilash"
                  />
                  <div>
                    <h3>{s.content.title}</h3>
                    <p>
                      <strong>{authorOf(s)}</strong> · {s.content.category}
                      {s.content.topic ? ` · ${s.content.topic}` : ""} ·{" "}
                      {lvlMap[s.content.level] || s.content.level} · v{s.source_version}
                    </p>
                    {s.duplicate_count > 0 && (
                      <Pill tone="amber">
                        O‘xshash nashr mavjud: {s.duplicate_count}
                      </Pill>
                    )}
                  </div>
                </div>
                <button
                  className="btn secondary tiny"
                  onClick={() => {
                    setItem(s);
                    setReason("");
                    setError(null);
                  }}
                >
                  Tekshirish
                </button>
              </article>
            );
          })
        )}
      </div>
      {item && (
        <Modal title="Savolni tekshirish va qaror" close={() => setItem(null)}>
          <h3>{item.content.title}</h3>
          {item.content.code && <pre>{item.content.code}</pre>}
          {item.content.options.map((o: any) => (
            <p key={o.id}>
              {o.id}. {o.text}{" "}
              {item.content.correct.includes(o.id) && <Check size={15} />}
            </p>
          ))}
          <p>Izoh: {item.content.explanation || "—"}</p>
          <p>
            Muallif: {item.attribution || "Ko‘rsatilmagan"}. Rozilik:{" "}
            {new Date(item.consent_at * 1000).toLocaleString()}.
          </p>
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={save}>
            <Field label="Qaror">
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
              >
                <option value="approved">Ommaga chiqarish</option>
                <option value="rejected">Rad etish</option>
                <option value="changes_requested">Tahrir so‘rash</option>
                <option value="revoked">Nashrni qaytarib olish</option>
              </select>
            </Field>
            <Field label="Sifat, mualliflik, spam va javob tekshiruvi bo‘yicha asos">
              <textarea
                minLength={10}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              Qarorni saqlash
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function OwnerReports() {
  const r = useData(base + "/reports"),
    [error, setError] = useState<unknown>(null);
  async function resolve(id: string) {
    try {
      await api(base + "/reports/" + id + "/resolve", {
        method: "POST",
        data: { reason: "Kontent shikoyati tekshirildi va ko‘rib chiqildi." },
      });
      r.reload();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <PageTitle title="Kontent shikoyatlari" />
      {!!error && <ErrorBox error={error} />}
      <div className="panel">
        {r.loading ? (
          <Busy />
        ) : r.error ? (
          <ErrorBox error={r.error} />
        ) : !r.data.items.length ? (
          <Empty
            title="Shikoyatlar yo‘q"
            text="Ochiq savollar yuzasidan murojaatlar bu yerda chiqadi."
          />
        ) : (
          r.data.items.map((x: any) => (
            <article className="ticket" key={x.id}>
              <Pill>{x.status}</Pill>
              <p>{x.reason}</p>
              <Link to="/owner/moderation">Moderatsiyani ochish</Link>
              {x.status === "open" && (
                <button
                  className="btn secondary tiny"
                  onClick={() => void resolve(x.id)}
                >
                  Ko‘rib chiqildi
                </button>
              )}
            </article>
          ))
        )}
      </div>
    </>
  );
}
function OwnerSupport() {
  const r = useData(base + "/support"),
    [item, setItem] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  async function reply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(base + "/support/" + item.id + "/reply", {
        method: "POST",
        data: Object.fromEntries(new FormData(e.currentTarget)),
      });
      setItem(null);
      r.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Support inbox"
        description="Teacher yuborgan murojaatlarga javob bering."
      />
      <div className="panel">
        {r.loading ? (
          <Busy />
        ) : r.error ? (
          <ErrorBox error={r.error} />
        ) : !r.data.items.length ? (
          <Empty
            title="Murojaatlar yo‘q"
            text="Yangi murojaatlar shu yerda ko‘rinadi."
          />
        ) : (
          r.data.items.map((t: any) => (
            <article className="ticket" key={t.id}>
              <Pill>{t.status}</Pill>
              <h3>{t.subject}</h3>
              <p>{t.message}</p>
              {t.reply && <p className="ticket-reply">{t.reply}</p>}
              <button
                className="btn secondary tiny"
                onClick={() => {
                  setItem(t);
                  setError(null);
                }}
              >
                Javob berish
              </button>
            </article>
          ))
        )}
      </div>
      {item && (
        <Modal title="Murojaatga javob" close={() => setItem(null)}>
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={reply}>
            <Field label="Javob">
              <textarea
                name="reply"
                defaultValue={item.reply}
                minLength={3}
                maxLength={4000}
                required
              />
            </Field>
            <Field label="Holat">
              <select name="status">
                <option value="resolved">Hal qilindi</option>
                <option value="open">Ochiq</option>
              </select>
            </Field>
            <button className="btn primary" disabled={busy}>
              Javobni saqlash
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function OwnerOperations() {
  const readiness = useData(base + "/readiness"),
    backups = useData(base + "/backups"),
    audit = useData(base + "/audit"),
    sessions = useData(base + "/sessions");
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true);
    try {
      await api(base + "/backups", {
        method: "POST",
        data: { reason: "Owner tomonidan qo‘lda shifrlangan backup yaratish." },
      });
      backups.reload();
      audit.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    try {
      await api(base + "/sessions/" + id, { method: "DELETE" });
      sessions.reload();
    } catch (e) {
      setError(e);
    }
  }
  return (
    <>
      <PageTitle
        title="Platforma operatsiyalari"
        description="Release holati, shifrlangan nusxalar va audit."
      />
      {!!error && <ErrorBox error={error} />}
      <section className="panel">
        <h2>Xizmatlar tayyorgarligi</h2>
        {readiness.loading ? (
          <Busy />
        ) : readiness.error ? (
          <ErrorBox error={readiness.error} />
        ) : (
          Object.entries(readiness.data).map(([k, v]) => (
            <div className="stat-line" key={k}>
              <span>{k.replaceAll("_", " ")}</span>
              {typeof v === "boolean" ? (
                <Pill tone={v ? "green" : "amber"}>
                  {v ? "Sozlangan" : "Yopiq / sozlanmagan"}
                </Pill>
              ) : (
                <b>{String(v)}</b>
              )}
            </div>
          ))
        )}
      </section>
      <section className="panel owner-section">
        <div className="panel-title">
          <h2>Shifrlangan backuplar</h2>
          <button
            className="btn primary tiny"
            disabled={busy}
            onClick={() => void backup()}
          >
            Backup yaratish
          </button>
        </div>
        {backups.error ? (
          <ErrorBox error={backups.error} />
        ) : backups.loading ? (
          <Busy />
        ) : !backups.data.items.length ? (
          <p>Backup hali yaratilmagan.</p>
        ) : (
          backups.data.items.map((b: any) => (
            <div className="stat-line" key={b.id}>
              <span>{new Date(b.created_at * 1000).toLocaleString()}</span>
              <code>{b.sha256.slice(0, 16)}…</code>
            </div>
          ))
        )}
        <p className="muted">
          Restore ishlab turgan bazaga web orqali yozilmaydi. Ajratilgan bazada
          runbook bo‘yicha tekshiriladi.
        </p>
      </section>
      <section className="panel owner-section">
        <h2>Owner sessiyalari</h2>
        {sessions.data?.items.map((s: any) => (
          <div className="stat-line" key={s.id_hash}>
            <span>
              {new Date(s.created_at * 1000).toLocaleString()} ·{" "}
              {s.revoked_at ? "Bekor qilingan" : "Faol"}
            </span>
            <button
              className="btn secondary tiny"
              disabled={!!s.revoked_at}
              onClick={() => void revoke(s.id_hash)}
            >
              Bekor qilish
            </button>
          </div>
        ))}
      </section>
      <section className="panel owner-section">
        <h2>Audit log</h2>
        {audit.loading ? (
          <Busy />
        ) : audit.error ? (
          <ErrorBox error={audit.error} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Amal</th>
                  <th>Asos</th>
                  <th>Vaqt</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.items.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      {a.action}
                      <small>{a.target_type}</small>
                    </td>
                    <td>{a.reason}</td>
                    <td>{new Date(a.timestamp * 1000).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function OwnerSettings() {
  const r = useData(base + "/settings");
  return (
    <>
      <PageTitle
        title="Platforma sozlamalari"
        description="Faqat tasdiqlangan aloqa manzillarini kiriting."
      />
      {r.loading ? (
        <Busy />
      ) : r.error ? (
        <ErrorBox error={r.error} />
      ) : (
        <OwnerSettingsForm initial={r.data} />
      )}
    </>
  );
}
function OwnerSettingsForm({ initial }: { initial: any }) {
  const [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      await api(base + "/settings", {
        method: "PUT",
        data: {
          support_email: f.support_email,
          support_telegram: f.support_telegram,
          maintenance: f.maintenance,
          retention_days: Number(f.retention_days),
          store_enabled: f.store_enabled === "on",
          games_enabled: f.games_enabled === "on",
          library_enabled: f.library_enabled === "on",
          assignments_enabled: f.assignments_enabled === "on",
          journal_enabled: f.journal_enabled === "on",
          parent_enabled: f.parent_enabled === "on",
          practice_enabled: f.practice_enabled === "on",
          apk_enabled: f.apk_enabled === "on",
          chat_enabled: f.chat_enabled === "on",
          firebase_db_url: String(f.firebase_db_url || "").trim().replace(/\/+$/, ""),
          billing_card_number: String(f.billing_card_number || "").trim(),
          billing_card_holder: String(f.billing_card_holder || "").trim(),
          tg_bot_username: String(f.tg_bot_username || "").trim().replace(/^@/, ""),
          reason: f.reason,
        },
      });
      toast("Sozlamalar yangilandi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      {!!error && <ErrorBox error={error} />}
      <form onSubmit={save}>
        <Field label="Support email">
          <input
            type="email"
            name="support_email"
            defaultValue={initial.support_email}
          />
        </Field>
        <Field label="Tasdiqlangan Telegram Support havolasi">
          <input
            name="support_telegram"
            type="url"
            placeholder="https://t.me/…"
            defaultValue={initial.support_telegram}
          />
        </Field>
        <Field label="Texnik ishlar xabari">
          <textarea
            name="maintenance"
            defaultValue={initial.maintenance}
            maxLength={500}
          />
        </Field>
        <Field label="Natijalar saqlanishi (kun)">
          <input
            name="retention_days"
            type="number"
            min={30}
            max={730}
            defaultValue={initial.retention_days}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <Field label="To‘lov kartasi (Uzcard / Humo)">
            <input name="billing_card_number" placeholder="8600 0000 0000 0000" defaultValue={initial.billing_card_number || ""} maxLength={40} />
          </Field>
          <Field label="Karta egasi (F.I.Sh)">
            <input name="billing_card_holder" placeholder="QOBILBEK ODILOV" defaultValue={initial.billing_card_holder || ""} maxLength={80} />
          </Field>
        </div>
        <Field label="Ota-ona xabarnoma Telegram bot username (ixtiyoriy)">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input name="tg_bot_username" placeholder="BilimUZNotifyBot (@ siz)" defaultValue={initial.tg_bot_username || ""} maxLength={80} style={{ flex: 1 }} />
            <button
              type="button"
              className="btn secondary tiny"
              onClick={async () => {
                try {
                  const res = await api("/api/v2/owner/tgbot/set-webhook", { method: "POST", data: {} });
                  toast("Telegram webhook ulandi: " + res.webhook_url);
                } catch (e: any) {
                  toast(e?.message || "Webhook ulashda xato");
                }
              }}
            >
              🤖 Webhookni ulash
            </button>
          </div>
        </Field>
        <Field label="Firebase Realtime Database URL (Jonli Chat uchun)">
          <input
            name="firebase_db_url"
            type="url"
            placeholder="https://sizning-loyiha-default-rtdb.europe-west1.firebasedatabase.app"
            defaultValue={initial.firebase_db_url || ""}
            maxLength={300}
          />
          <small className="muted" style={{ display: "block", marginTop: 4 }}>
            console.firebase.google.com → Realtime Database manzili (Bilim UZ serveridan 0 bayt joy oladi).
          </small>
        </Field>
        <div style={{ margin: "18px 0 14px" }}>
          <strong style={{ display: "block", marginBottom: 8 }}>
            Platforma bo‘limlarini boshqarish (Yoqish / Yashirish)
          </strong>
          <small className="muted" style={{ display: "block", marginBottom: 10 }}>
            O‘chirilgan bo‘limlar foydalanuvchilar, o‘qituvchilar menyusi va bosh sahifadan avtomatik yashiriladi.
          </small>
          <div className="feature-flags-grid">
            {[
              ["games_enabled", "🎮 O‘yinlar markazi (/games)"],
              ["chat_enabled", "💬 Jonli Chat (Guruhlar + Umumiy chat)"],
              ["library_enabled", "📚 Raqamli kutubxona (/library)"],
              ["assignments_enabled", "📝 Vazifalar (/vazifalar va Studio)"],
              ["journal_enabled", "📊 Kurs jurnali (Studio)"],
              ["store_enabled", "🛒 Savollar do‘koni va Market"],
              ["practice_enabled", "⚡ Ochiq mashq testlari"],
              ["parent_enabled", "👨‍👩‍👧 Ota-ona kabineti (/parent)"],
              ["apk_enabled", "📱 Android APK yuklab olish kartasi"],
            ].map(([key, label]) => (
              <label className="flag-toggle" key={key}>
                <input
                  type="checkbox"
                  name={key}
                  defaultChecked={initial[key] !== false}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <Field label="O‘zgarish asosi (audit uchun)">
          <textarea
            name="reason"
            minLength={5}
            maxLength={1000}
            defaultValue="Platforma funksiyalari sozlamalari yangilandi"
            required
          />
        </Field>
        <button className="btn primary" disabled={busy}>
          Sozlamalarni saqlash
        </button>
      </form>
    </section>
  );
}

function OwnerShopPacks() {
  const toast = useToast();
  const list = useData("/api/v2/owner/shop-items");
  const [slot, setSlot] = useState<"banner" | "frame" | "avatar" | "title">("banner");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("150");
  const [rarity, setRarity] = useState("epic");
  const [titleText, setTitleText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("slot", slot);
      fd.set("name", name.trim());
      fd.set("description", desc.trim());
      fd.set("price", price);
      fd.set("rarity", rarity);
      fd.set("title_text", titleText.trim());
      fd.set("image_url", imageUrl.trim());
      if (file) fd.set("file", file);
      await api("/api/v2/owner/shop-items", { method: "POST", form: fd });
      toast("Yangi kosmetik pack do‘konga qo‘shildi!");
      setName("");
      setDesc("");
      setTitleText("");
      setImageUrl("");
      setFile(null);
      list.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Ushbu pack do‘kondan o‘chirilsinmi?")) return;
    try {
      await api("/api/v2/owner/shop-items/" + encodeURIComponent(id), { method: "DELETE" });
      toast("Pack o‘chirildi");
      list.reload();
    } catch (err) {
      setError(err);
    }
  }

  const items: any[] = list.data?.items || [];

  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2 style={{ margin: 0 }}>Bilim Do‘koni — Kosmetik Packlar</h2>
          <small className="muted">
            Discord / Steam uslubidagi banner, shaffof PNG ramka, avatar yoki unvon yuklang (PNG/WebP/GIF, maks 2 MB).
          </small>
        </div>
      </div>

      {!!error && <ErrorBox error={error} />}

      <form onSubmit={onUpload} style={{ display: "grid", gap: 12, marginTop: 14, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <Field label="Pack turi">
            <select value={slot} onChange={(e) => setSlot(e.target.value as any)}>
              <option value="banner">Banner (16:5 keng rasm)</option>
              <option value="frame">Avatar ramkasi (1:1 shaffof PNG)</option>
              <option value="avatar">Avatar (1:1 kvadrat rasm)</option>
              <option value="title">Unvon (matnli badge)</option>
            </select>
          </Field>
          <Field label="Nomi">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Cyber Dragon Banner" required maxLength={80} />
          </Field>
          <Field label="Narxi (Bilim Coin)">
            <input type="number" min={0} max={100000} value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
          <Field label="Darajasi (Rarity)">
            <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
              <option value="common">Oddiy</option>
              <option value="rare">Noyob</option>
              <option value="epic">Epik</option>
              <option value="legendary">Afsonaviy</option>
            </select>
          </Field>
        </div>

        <Field label="Qisqa tavsif">
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="O‘quvchilar uchun qisqa ta’rif…" maxLength={200} />
        </Field>

        {slot === "title" ? (
          <Field label="Unvon matni">
            <input value={titleText} onChange={(e) => setTitleText(e.target.value)} placeholder="Masalan: Kiber Chempion" required maxLength={60} />
          </Field>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <Field label="Rasm faylini yuklash (PNG / WebP / GIF)">
              <input type="file" accept="image/png,image/webp,image/gif,image/jpeg,image/svg+xml" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Field>
            <Field label="Yoki tashqi rasm havolasi (ixtiyoriy)">
              <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            </Field>
          </div>
        )}

        <div>
          <button className="btn primary" disabled={busy}>
            <Upload size={15} /> {busy ? "Yuklanmoqda…" : "Do‘konga qo‘shish"}
          </button>
        </div>
      </form>

      <h3 style={{ margin: "0 0 12px" }}>Yuklangan packlar ({items.length})</h3>
      {list.loading ? (
        <Busy />
      ) : !items.length ? (
        <Empty title="Hali maxsus packlar yuklanmagan" text="Yuqoridagi forma orqali birinchi banner, ramka yoki avatarni qo‘shing." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {items.map((it: any) => (
            <div key={it.id} className="panel" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {it.image_url && (
                <div style={{ height: 90, borderRadius: 10, overflow: "hidden", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img src={it.image_url} alt={it.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: it.slot === "banner" ? "cover" : "contain", width: it.slot === "banner" ? "100%" : "auto", height: it.slot === "banner" ? "100%" : "auto" }} />
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                <strong>{it.name}</strong>
                <Pill tone="neutral">{it.slot}</Pill>
              </div>
              <small className="muted">{it.price} Coin · {it.rarity}</small>
              <button type="button" className="btn secondary tiny" onClick={() => onDelete(it.id)}>
                <Trash2 size={13} /> O‘chirish
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function OwnerBillingPage() {
  const toast = useToast();
  const data = useData("/api/v2/owner/billing/orders");
  const keysData = useData("/api/v2/owner/billing/keys");
  const teachers = useData("/api/v2/owner/teachers?limit=100");
  const [keyPlan, setKeyPlan] = useState<"pro" | "center">("pro");
  const [keyDays, setKeyDays] = useState("30");
  const [keyUses, setKeyUses] = useState("1");
  const [keyNote, setKeyNote] = useState("");
  const [grantTenant, setGrantTenant] = useState("");
  const [grantPlan, setGrantPlan] = useState<"pro" | "center" | "free">("pro");
  const [grantDays, setGrantDays] = useState("30");
  const [busy, setBusy] = useState(false);

  async function approve(id: string) {
    setBusy(true);
    try {
      await api("/api/v2/owner/billing/orders/" + encodeURIComponent(id) + "/approve", { method: "POST", data: {} });
      toast("To‘lov tasdiqlandi va tarif yoqildi!");
      data.reload();
    } catch (e: any) {
      toast(e?.message || "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    setBusy(true);
    try {
      await api("/api/v2/owner/billing/orders/" + encodeURIComponent(id) + "/reject", { method: "POST", data: {} });
      toast("Buyurtma rad etildi");
      data.reload();
    } catch (e: any) {
      toast(e?.message || "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function grant(e: FormEvent) {
    e.preventDefault();
    if (!grantTenant) return;
    setBusy(true);
    try {
      await api("/api/v2/owner/billing/grant", {
        method: "POST",
        data: { tenant_id: grantTenant, plan: grantPlan, days: Number(grantDays || 30), note: "Owner bergan" },
      });
      toast("Tarif qo‘lda belgilandi!");
      data.reload();
    } catch (e: any) {
      toast(e?.message || "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function createKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api("/api/v2/owner/billing/keys", {
        method: "POST",
        data: { plan: keyPlan, days: Number(keyDays || 30), max_uses: Number(keyUses || 1), note: keyNote },
      });
      await navigator.clipboard?.writeText(res.code).catch(() => {});
      toast("Product Key yaratildi va nusxalandi: " + res.code);
      setKeyNote("");
      keysData.reload();
    } catch (e: any) {
      toast(e?.message || "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey(id: string) {
    await api("/api/v2/owner/billing/keys/" + encodeURIComponent(id), { method: "DELETE" });
    toast("Kalit o‘chirildi");
    keysData.reload();
  }

  const orders: any[] = data.data?.orders || [];
  const pKeys: any[] = keysData.data?.items || [];
  return (
    <section className="panel">
      <div className="panel-title">
        <div>
          <h2 style={{ margin: 0 }}>To‘lovlar va Tariflar boshqaruvi</h2>
          <small className="muted">
            Avtomatik Telegram bot orqali tasdiqlangan yoki chek yuklangan buyurtmalar. Karta raqamini «Sozlamalar» da kiriting.
          </small>
        </div>
      </div>

      <form onSubmit={grant} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid var(--line)", margin: "14px 0 18px" }}>
        <Field label="Workspace (O‘qituvchi)">
          <select value={grantTenant} onChange={(e) => setGrantTenant(e.target.value)} required>
            <option value="">Tanlang…</option>
            {(teachers.data?.items || []).map((t: any) => (
              <option key={t.id} value={t.id}>{t.name} ({t.display_name})</option>
            ))}
          </select>
        </Field>
        <Field label="Tarif">
          <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as any)}>
            <option value="pro">Ustoz Pro</option>
            <option value="center">Ultra</option>
            <option value="free">Start (Bepul)</option>
          </select>
        </Field>
        <Field label="Kun">
          <input type="number" min={0} max={3650} value={grantDays} onChange={(e) => setGrantDays(e.target.value)} style={{ width: 90 }} />
        </Field>
        <button className="btn primary tiny" disabled={busy}>Qo‘lda yoqish</button>
      </form>

      {/* Product Key Generator */}
      <div style={{ padding: 14, borderRadius: 12, background: "#f8fafc", border: "1px solid var(--line)", marginBottom: 18 }}>
        <strong style={{ display: "block", marginBottom: 8 }}>🔑 Product Key yaratish (Tarif kaliti)</strong>
        <form onSubmit={createKey} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <Field label="Tarif">
            <select value={keyPlan} onChange={(e) => setKeyPlan(e.target.value as any)}>
              <option value="pro">Ustoz Pro</option>
              <option value="center">Ultra</option>
            </select>
          </Field>
          <Field label="Muddat (kun)">
            <input type="number" min={1} max={3650} value={keyDays} onChange={(e) => setKeyDays(e.target.value)} style={{ width: 90 }} />
          </Field>
          <Field label="Ishlatish soni">
            <input type="number" min={1} max={500} value={keyUses} onChange={(e) => setKeyUses(e.target.value)} style={{ width: 90 }} />
          </Field>
          <Field label="Izoh (ixtiyoriy)">
            <input value={keyNote} onChange={(e) => setKeyNote(e.target.value)} placeholder="Masalan: Akmal ustozga" maxLength={120} />
          </Field>
          <button className="btn primary tiny" disabled={busy}>+ Kalit yaratish</button>
        </form>
        {pKeys.length > 0 && (
          <div style={{ display: "grid", gap: 6 }}>
            {pKeys.map((k: any) => (
              <div key={k.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}>
                <div>
                  <strong style={{ letterSpacing: 0.6 }}>{k.code}</strong>{" "}
                  <small className="muted">· {(k.plan === "center" ? "ULTRA" : k.plan.toUpperCase())} · {k.days} kun · {k.used_count}/{k.max_uses} ishlatildi {k.note ? "· " + k.note : ""}</small>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn secondary tiny" onClick={() => { navigator.clipboard.writeText(k.code); toast("Kalit nusxalandi"); }}>Nusxa</button>
                  <button type="button" className="btn secondary tiny" onClick={() => deleteKey(k.id)}>O‘chirish</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {data.loading ? <Busy /> : !orders.length ? (
        <Empty title="Hali to‘lov buyurtmalari yo‘q" text="O‘qituvchilar tarif tanlaganda shu yerda chiqadi." />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>O‘qituvchi</th>
                <th>Tarif</th>
                <th>Aniq summa</th>
                <th>Chek / Izoh</th>
                <th>Holat</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td><strong>{o.tenant_name}</strong><small className="muted" style={{ display: "block" }}>{o.teacher_name}</small></td>
                  <td>{(o.plan === "center" ? "ULTRA" : o.plan.toUpperCase())} ({o.months} oy)</td>
                  <td><strong>{Number(o.unique_amount).toLocaleString("ru-RU")} so‘m</strong></td>
                  <td>
                    {o.receipt_key && (
                      <a href={"/api/v2/media/" + o.receipt_key} target="_blank" rel="noreferrer" className="btn secondary tiny">
                        Chekni ko‘rish
                      </a>
                    )}
                    {o.tx_note && <small className="muted" style={{ display: "block", marginTop: 4 }}>{o.tx_note}</small>}
                  </td>
                  <td>
                    <Pill tone={o.status === "paid" ? "green" : o.status === "rejected" ? "red" : "amber"}>
                      {o.status === "paid" ? "To‘landi" : o.status === "rejected" ? "Rad etildi" : "Kutilmoqda"}
                    </Pill>
                  </td>
                  <td>
                    {o.status === "pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn primary tiny" disabled={busy} onClick={() => approve(o.id)}>Tasdiqlash</button>
                        <button type="button" className="btn secondary tiny" disabled={busy} onClick={() => reject(o.id)}>Rad</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
