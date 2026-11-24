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
  LifeBuoy,
  LogOut,
  Settings,
  ShieldCheck,
  Gamepad2,
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
          <h2>Tizim holati</h2>
          <div className="stat-line">
            <span>D1</span>
            <Pill tone="green">Ulandi</Pill>
          </div>
          <div className="stat-line">
            <span>Baza hajmi</span>
            <b>{(r.data.health.storage_bytes / 1024 / 1024).toFixed(2)} MB</b>
          </div>
          <div className="stat-line">
            <span>Oxirgi backup</span>
            <b>
              {r.data.health.last_backup
                ? new Date(
                    r.data.health.last_backup.created_at * 1000,
                  ).toLocaleString()
                : "Hali yaratilmagan"}
            </b>
          </div>
          <p className="muted">{r.data.usage_notice}</p>
          {r.data.usage && <pre>{JSON.stringify(r.data.usage, null, 2)}</pre>}
          <p>Ogohlantirish chegaralari: 70% · 85% · 95%</p>
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
