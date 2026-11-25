import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Field, Modal, PageTitle, Pill, useData, useToast } from "./ui";

const KIND_META: Record<string, { label: string; tone: "blue" | "green" | "amber" | "neutral" }> = {
  text: { label: "Matn / Kod", tone: "blue" },
  link: { label: "Havola (Link)", tone: "neutral" },
  image: { label: "Rasm / Skrinshot", tone: "green" },
  file: { label: "Hujjat / Fayl", tone: "amber" },
  test: { label: "Test vazifasi", tone: "green" },
};

function fmtDateTime(ts: number | null | undefined) {
  if (!ts) return "Muddatsiz";
  return new Intl.DateTimeFormat("uz-UZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts * 1000));
}

function toDatetimeLocal(ts: number | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtBytes(n: number) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

// Brauzerning o'zida rasmni siqib kichraytirish (~150-300 KB)
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1600;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], baseName + ".jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.78,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// ============================================================================
// 1. O'QITUVCHI: VAZIFALAR BOSHQARUVI (/studio/assignments)
// ============================================================================
export function TeacherAssignmentsPage() {
  const base = "/api/v2/teacher/assignments";
  const data = useData(base);
  const toast = useToast();
  const [edit, setEdit] = useState<any>(null);
  const [kindDraft, setKindDraft] = useState<string>("text");
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const items: any[] = data.data?.items || [];
  const groups: any[] = data.data?.groups || [];
  const cards: any[] = data.data?.cards || [];

  async function saveAssignment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const dueStr = String(f.due_at || "").trim();
    const dueTs = dueStr ? Math.floor(new Date(dueStr).getTime() / 1000) : null;
    try {
      await api(base + (edit?.id ? "/" + edit.id : ""), {
        method: edit?.id ? "PUT" : "POST",
        data: {
          title: String(f.title || ""),
          description: String(f.description || ""),
          group_id: f.group_id ? String(f.group_id) : null,
          kind: String(f.kind || "text"),
          linked_card_slug: String(f.linked_card_slug || ""),
          max_score: Number(f.max_score || 100),
          due_at: dueTs && !Number.isNaN(dueTs) ? dueTs : null,
          status: String(f.status || "active"),
        },
      });
      setEdit(null);
      data.reload();
      toast("Vazifa saqlandi");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment(id: string) {
    if (!confirm("Ushbu vazifa va unga yuklangan barcha topshiriqlar o‘chirilsinmi?")) return;
    setBusy(true);
    try {
      await api(`${base}/${id}`, { method: "DELETE" });
      data.reload();
      toast("Vazifa o‘chirildi");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function cleanupOldFiles() {
    if (!confirm("90 kundan eski baholangan topshiriqlarning rasm va fayllari serverdan tozalansinmi? (Baholar va izohlar saqlanib qoladi)")) return;
    setBusy(true);
    try {
      const res = await api(base + "/cleanup-files", { method: "POST", data: {} });
      toast(res.cleaned ? `${res.cleaned} ta eski fayl tozalandi` : "Tozalanadigan 90+ kunlik fayl topilmadi");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="O‘QUV JARAYONI"
        title="Vazifalar"
        description="Guruhlarga uyga vazifa bering, topshiriqlarni tekshiring va baholang. O‘quvchilar o‘z kodi orqali bajaradi."
        actions={
          <>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void cleanupOldFiles()}>
              Eski fayllarni tozalash
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setError(null);
                setKindDraft("text");
                setEdit({ max_score: 100, status: "active", kind: "text" });
              }}
            >
              <Plus size={16} /> Yangi vazifa
            </button>
          </>
        }
      />

      {!!error && !edit && <ErrorBox error={error} />}

      {data.loading ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !items.length ? (
        <div className="panel">
          <Empty
            title="Hali vazifalar yo‘q"
            text="«Yangi vazifa» tugmasini bosib guruhingizga birinchi uyga vazifani bering."
          />
        </div>
      ) : (
        <div className="hw-grid">
          {items.map((a: any) => {
            const km = KIND_META[a.kind] || KIND_META.text;
            const overdue = a.due_at && a.due_at < Date.now() / 1000;
            return (
              <div className="panel hw-card" key={a.id}>
                <div className="hw-card-top">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Pill tone={km.tone}>{km.label}</Pill>
                    <Pill tone="neutral">{a.group_name || "Barcha guruhlar"}</Pill>
                    {a.status === "closed" && <Pill tone="red">Yopilgan</Pill>}
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Tahrirlash"
                      onClick={() => {
                        setError(null);
                        setKindDraft(a.kind || "text");
                        setEdit(a);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="O‘chirish"
                      disabled={busy}
                      onClick={() => void deleteAssignment(a.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <h3 className="hw-title">{a.title}</h3>
                {a.description && <p className="hw-desc">{a.description}</p>}

                <div className="hw-meta">
                  <span className={overdue ? "hw-overdue" : "muted"}>
                    <Clock size={14} /> {fmtDateTime(a.due_at)}
                  </span>
                  <span className="muted">Max: <strong>{a.max_score}</strong> ball</span>
                </div>

                <div className="hw-card-foot">
                  <div className="hw-stats">
                    <span>Topshirdi: <strong>{a.submitted_count}</strong> / {a.student_count}</span>
                    <span>Baholandi: <strong>{a.graded_count}</strong></span>
                  </div>
                  <button
                    type="button"
                    className="btn primary tiny"
                    onClick={() => setInspectId(a.id)}
                  >
                    <ClipboardCheck size={15} /> Tekshirish
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <Modal title={edit.id ? "Vazifani tahrirlash" : "Yangi vazifa yaratish"} close={() => setEdit(null)}>
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={saveAssignment}>
            <Field label="Vazifa nomi">
              <input name="title" defaultValue={edit.title || ""} required minLength={2} maxLength={160} placeholder="Masalan: Excelda oylik jadval tuzish" />
            </Field>
            <Field label="Guruh">
              <select name="group_id" defaultValue={edit.group_id || ""}>
                <option value="">Barcha o‘quvchilar</option>
                {groups.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Vazifa turi">
              <select
                name="kind"
                value={kindDraft}
                onChange={(e) => setKindDraft(e.target.value)}
              >
                <option value="text">Matn / Dastur kodi javobi</option>
                <option value="link">Havola (Google Docs, GitHub, Figma…)</option>
                <option value="image">Rasm / Skrinshot yuklash (avto-siqiladi)</option>
                <option value="file">Hujjat / Fayl (PDF, DOCX, XLSX, ZIP — max 5 MB)</option>
                <option value="test">Test vazifasi (mavjud test kartasi)</option>
              </select>
            </Field>
            {kindDraft === "test" && (
              <Field label="Bog‘langan test kartasi">
                <select name="linked_card_slug" defaultValue={edit.linked_card_slug || ""}>
                  <option value="">Test kartasini tanlang…</option>
                  {cards.map((c: any) => (
                    <option key={c.id} value={c.slug}>{c.title} ({c.slug})</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Vazifa sharti va ko‘rsatmalar">
              <textarea name="description" rows={4} defaultValue={edit.description || ""} maxLength={4000} placeholder="O‘quvchi nima qilishi kerakligini yozing…" />
            </Field>
            <div className="hw-two-col">
              <Field label="Maksimal ball">
                <input name="max_score" type="number" min={1} max={1000} defaultValue={edit.max_score || 100} required />
              </Field>
              <Field label="Topshirish muddati (ixtiyoriy)">
                <input name="due_at" type="datetime-local" defaultValue={toDatetimeLocal(edit.due_at)} />
              </Field>
            </div>
            {edit.id && (
              <Field label="Holat">
                <select name="status" defaultValue={edit.status || "active"}>
                  <option value="active">Faol (topshirish ochiq)</option>
                  <option value="closed">Yopilgan</option>
                </select>
              </Field>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </form>
        </Modal>
      )}

      {inspectId && (
        <SubmissionsModal
          assignmentId={inspectId}
          close={() => {
            setInspectId(null);
            data.reload();
          }}
        />
      )}
    </>
  );
}

function SubmissionsModal({ assignmentId, close }: { assignmentId: string; close: () => void }) {
  const data = useData(`/api/v2/teacher/assignments/${assignmentId}/submissions`);
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "submitted" | "missing">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { score: string; feedback: string }>>({});

  const a = data.data?.assignment;
  const items: any[] = data.data?.items || [];
  const filtered = items.filter((it) => {
    const hasSub = !!(it.submission || it.test_attempt);
    if (filter === "submitted") return hasSub;
    if (filter === "missing") return !hasSub;
    return true;
  });

  async function saveGrade(subId: string, curScore: any, curFeedback: string) {
    const d = drafts[subId] || { score: curScore ?? "", feedback: curFeedback || "" };
    setSavingId(subId);
    try {
      await api(`/api/v2/teacher/assignments/${assignmentId}/submissions/${subId}/grade`, {
        method: "PUT",
        data: {
          score: d.score === "" ? null : Number(d.score),
          feedback: d.feedback,
          status: "graded",
        },
      });
      toast("Baho saqlandi");
      data.reload();
    } catch (e: any) {
      toast(e?.message || "Xatolik yuz berdi");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Modal title={a ? `Topshiriqlar: ${a.title}` : "Topshiriqlarni tekshirish"} close={close}>
      {data.loading ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : (
        <div className="hw-subs-wrap">
          <div className="tabs-bar" style={{ marginBottom: 12 }}>
            <button type="button" className={filter === "all" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setFilter("all")}>
              Hammasi ({items.length})
            </button>
            <button type="button" className={filter === "submitted" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setFilter("submitted")}>
              Topshirgan ({items.filter((x) => x.submission || x.test_attempt).length})
            </button>
            <button type="button" className={filter === "missing" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setFilter("missing")}>
              Topshirmagan ({items.filter((x) => !x.submission && !x.test_attempt).length})
            </button>
          </div>

          {!filtered.length ? (
            <p className="muted">Ushbu filtr bo‘yicha o‘quvchilar topilmadi.</p>
          ) : (
            <div className="hw-subs-list">
              {filtered.map(({ student, submission, test_attempt }) => {
                const sub = submission;
                const d = sub ? drafts[sub.id] || { score: sub.score ?? "", feedback: sub.feedback || "" } : null;
                const isImg = sub?.file_key && /\.(jpg|jpeg|png|webp)$/i.test(sub.file_key);
                return (
                  <div className="hw-sub-item" key={student.id}>
                    <div className="hw-sub-head">
                      <div>
                        <div className="student-name-cell">
                          <strong>{student.name}</strong>
                          {student.note && <span className="student-note-tag">{student.note}</span>}
                        </div>
                        <small className="muted">{student.student_code}</small>
                      </div>
                      {sub ? (
                        <Pill tone={sub.status === "graded" ? "green" : "amber"}>
                          {sub.status === "graded" ? `Baholandi: ${sub.score}/${a.max_score}` : "Tekshirilmagan"}
                        </Pill>
                      ) : test_attempt ? (
                        <Pill tone="green">Test: {test_attempt.best_pct}%</Pill>
                      ) : (
                        <Pill tone="neutral">Topshirmagan</Pill>
                      )}
                    </div>

                    {sub && (
                      <div className="hw-sub-body">
                        <small className="muted">Topshirildi: {fmtDateTime(sub.submitted_at)}</small>
                        {sub.answer_text && <pre className="hw-answer-text">{sub.answer_text}</pre>}
                        {sub.answer_link && (
                          <a href={sub.answer_link} target="_blank" rel="noreferrer" className="hw-link-pill">
                            <ExternalLink size={14} /> {sub.answer_link}
                          </a>
                        )}
                        {sub.file_key && (
                          isImg ? (
                            <a href={"/api/v2/media/" + sub.file_key} target="_blank" rel="noreferrer" className="hw-img-preview">
                              <img src={"/api/v2/media/" + sub.file_key} alt={sub.file_name || "Rasm"} />
                            </a>
                          ) : (
                            <a href={"/api/v2/media/" + sub.file_key} target="_blank" rel="noreferrer" className="hw-link-pill">
                              <FileText size={14} /> {sub.file_name || "Faylni yuklab olish"} ({fmtBytes(sub.file_size)})
                            </a>
                          )
                        )}

                        <div className="hw-grade-bar">
                          <input
                            type="number"
                            min={0}
                            max={a.max_score}
                            placeholder={`Ball (0-${a.max_score})`}
                            value={d!.score}
                            onChange={(e) => setDrafts((p) => ({ ...p, [sub.id]: { ...d!, score: e.target.value } }))}
                            style={{ width: 110 }}
                          />
                          <input
                            type="text"
                            placeholder="O‘qituvchi izohi (ixtiyoriy)"
                            value={d!.feedback}
                            onChange={(e) => setDrafts((p) => ({ ...p, [sub.id]: { ...d!, feedback: e.target.value } }))}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn primary tiny"
                            disabled={savingId === sub.id}
                            onClick={() => void saveGrade(sub.id, sub.score, sub.feedback)}
                          >
                            {savingId === sub.id ? "…" : "Baholash"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ============================================================================
// 2. O'QUVCHI: VAZIFALAR KABINETI (/vazifalar va /vazifalar/:code)
// ============================================================================
export function StudentAssignmentsPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const savedCode = typeof localStorage !== "undefined" ? localStorage.getItem("bilimuz_student_code") || "" : "";
  const [inputCode, setInputCode] = useState(code || savedCode);
  const [tab, setTab] = useState<"all" | "pending" | "done">("all");
  const [activeHw, setActiveHw] = useState<any>(null);

  const activeCode = code.trim();
  const data = useData(
    activeCode
      ? `/api/v2/public/assignments/student/${encodeURIComponent(activeCode)}`
      : "/api/v2/public/assignments/student/__empty__",
  );

  function openCode(e: FormEvent) {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (!cleaned) return;
    try { localStorage.setItem("bilimuz_student_code", cleaned); } catch {}
    navigate("/vazifalar/" + encodeURIComponent(cleaned));
  }

  const st = data.data?.student;
  const sum = data.data?.summary;
  const items: any[] = data.data?.items || [];
  const filtered = items.filter((a) => {
    const done = !!(a.submission || a.test_attempt);
    if (tab === "pending") return !done;
    if (tab === "done") return done;
    return true;
  });

  return (
    <div className="exam-join lib-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }} className="back-link" style={{ margin: 0 }}>
          <ArrowLeft size={17} /> Orqaga
        </Link>
        {st && (
          <Link to={"/parent/" + encodeURIComponent(st.student_code)} className="btn secondary tiny">
            Davomat va natijalar <ArrowRight size={14} />
          </Link>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <span className="eyebrow">BILIM UZ · O‘QUVCHI VAZIFALARI</span>
        <h1 style={{ margin: "6px 0 8px" }}>Mening vazifalarim</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          O‘qituvchingiz bergan <strong>o‘quvchi kodingiz</strong> (masalan: <code>K48291</code>) orqali kirib, uyga vazifalaringizni bajaring.
        </p>
        <form onSubmit={openCode} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="O‘quvchi kodi (masalan: K48291)"
            required
            maxLength={40}
            style={{ flex: "1 1 220px" }}
          />
          <button className="btn primary">
            Vazifalarni ochish <ArrowRight size={16} />
          </button>
        </form>
      </div>

      {activeCode && (
        data.loading ? (
          <Busy />
        ) : data.error ? (
          <ErrorBox error={data.error} retry={data.reload} />
        ) : st ? (
          <>
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="student-name-cell" style={{ marginBottom: 4 }}>
                <h2 style={{ margin: 0 }}>{st.name}</h2>
                {st.note && <span className="student-note-tag">{st.note}</span>}
              </div>
              <small className="muted">Kod: <strong>{st.student_code}</strong> · Guruh: <strong>{st.group_name}</strong></small>

              {sum && (
                <div className="journal-kpis" style={{ marginTop: 14, marginBottom: 0 }}>
                  <div className="panel">
                    <small className="muted">Jami vazifa</small>
                    <strong>{sum.total}</strong>
                  </div>
                  <div className="panel">
                    <small className="muted">Bajarilgan</small>
                    <strong>{sum.submitted}</strong>
                  </div>
                  <div className="panel">
                    <small className="muted">Kutilmoqda</small>
                    <strong>{sum.pending}</strong>
                  </div>
                  <div className="panel">
                    <small className="muted">O‘rtacha natija</small>
                    <strong>{sum.avg_percent !== null ? sum.avg_percent + "%" : "—"}</strong>
                  </div>
                </div>
              )}
            </div>

            <div className="tabs-bar" style={{ marginBottom: 14 }}>
              <button type="button" className={tab === "all" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("all")}>
                Barchasi ({items.length})
              </button>
              <button type="button" className={tab === "pending" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("pending")}>
                Bajarilmagan ({items.filter((x) => !x.submission && !x.test_attempt).length})
              </button>
              <button type="button" className={tab === "done" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("done")}>
                Topshirilgan ({items.filter((x) => x.submission || x.test_attempt).length})
              </button>
            </div>

            {!filtered.length ? (
              <div className="panel">
                <Empty title="Vazifalar topilmadi" text="Hozircha bu bo‘limda faol vazifalar yo‘q." />
              </div>
            ) : (
              <div className="hw-grid">
                {filtered.map((a: any) => {
                  const km = KIND_META[a.kind] || KIND_META.text;
                  const sub = a.submission;
                  const tAtt = a.test_attempt;
                  const overdue = a.due_at && a.due_at < Date.now() / 1000 && !sub && !tAtt;
                  return (
                    <div className="panel hw-card" key={a.id}>
                      <div className="hw-card-top">
                        <Pill tone={km.tone}>{km.label}</Pill>
                        {sub?.status === "graded" ? (
                          <Pill tone="green">Baho: {sub.score}/{a.max_score}</Pill>
                        ) : sub ? (
                          <Pill tone="amber">Topshirilgan</Pill>
                        ) : tAtt ? (
                          <Pill tone="green">Test: {tAtt.best_pct}%</Pill>
                        ) : overdue ? (
                          <Pill tone="red">Muddati o‘tgan</Pill>
                        ) : (
                          <Pill tone="blue">Yangi</Pill>
                        )}
                      </div>

                      <h3 className="hw-title">{a.title}</h3>
                      {a.description && <p className="hw-desc">{a.description}</p>}

                      <div className="hw-meta">
                        <span className={overdue ? "hw-overdue" : "muted"}>
                          <Clock size={14} /> {fmtDateTime(a.due_at)}
                        </span>
                        <span className="muted">Max: <strong>{a.max_score}</strong> ball</span>
                      </div>

                      {sub?.feedback && (
                        <div className="lib-callout is-tip" style={{ margin: "10px 0 0", padding: "9px 12px", fontSize: 13 }}>
                          <strong>O‘qituvchi izohi:</strong> {sub.feedback}
                        </div>
                      )}

                      <div className="hw-card-foot">
                        {a.kind === "test" && a.linked_card_slug ? (
                          <Link to={"/t/" + encodeURIComponent(a.linked_card_slug)} className="btn primary tiny">
                            Testni yechish <ArrowRight size={14} />
                          </Link>
                        ) : a.status === "active" ? (
                          <button
                            type="button"
                            className={sub ? "btn secondary tiny" : "btn primary tiny"}
                            onClick={() => setActiveHw(a)}
                          >
                            {sub ? "Javobni yangilash" : "Vazifani topshirish"} <ArrowRight size={14} />
                          </button>
                        ) : (
                          <small className="muted">Vazifa yopilgan</small>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null
      )}

      {activeHw && st && (
        <SubmitAssignmentModal
          code={st.student_code}
          assignment={activeHw}
          close={() => setActiveHw(null)}
          onSubmitted={() => {
            setActiveHw(null);
            data.reload();
            toast("Vazifa muvaffaqiyatli topshirildi!");
          }}
        />
      )}
    </div>
  );
}

function SubmitAssignmentModal({
  code,
  assignment,
  close,
  onSubmitted,
}: {
  code: string;
  assignment: any;
  close: () => void;
  onSubmitted: () => void;
}) {
  const sub = assignment.submission;
  const [answerText, setAnswerText] = useState(sub?.answer_text || "");
  const [answerLink, setAnswerLink] = useState(sub?.answer_link || "");
  const [fileInfo, setFileInfo] = useState<{ file_key: string; file_name: string; file_size: number } | null>(
    sub?.file_key ? { file_key: sub.file_key, file_name: sub.file_name, file_size: sub.file_size } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onPickFile(rawFile: File | null) {
    if (!rawFile) return;
    setUploading(true);
    setError(null);
    try {
      const ready = assignment.kind === "image" ? await compressImage(rawFile) : rawFile;
      if (ready.size > 5 * 1024 * 1024) {
        throw new Error("Fayl hajmi 5 MB dan oshmasligi kerak");
      }
      const fd = new FormData();
      fd.append("file", ready);
      const r = await fetch(`/api/v2/public/assignments/student/${encodeURIComponent(code)}/upload`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Yuklashda xatolik");
      setFileInfo({ file_key: j.file_key, file_name: j.file_name, file_size: j.file_size });
    } catch (err) {
      setError(err);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(
        `/api/v2/public/assignments/student/${encodeURIComponent(code)}/${assignment.id}/submit`,
        {
          method: "POST",
          data: {
            answer_text: answerText,
            answer_link: answerLink,
            file_key: fileInfo?.file_key || "",
            file_name: fileInfo?.file_name || "",
            file_size: fileInfo?.file_size || 0,
          },
        },
      );
      onSubmitted();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={assignment.title} close={close}>
      {assignment.description && (
        <div className="lib-ch-summary" style={{ marginBottom: 14 }}>
          {assignment.description}
        </div>
      )}
      {!!error && <ErrorBox error={error} />}
      <form onSubmit={submit}>
        {assignment.kind === "text" && (
          <Field label="Javobingiz (matn yoki dastur kodi)">
            <textarea
              rows={6}
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              required
              placeholder="Javobingizni shu yerga yozing…"
            />
          </Field>
        )}

        {assignment.kind === "link" && (
          <>
            <Field label="Havola (Google Docs, GitHub, Figma, Replit…)">
              <input
                type="url"
                value={answerLink}
                onChange={(e) => setAnswerLink(e.target.value)}
                required
                placeholder="https://..."
              />
            </Field>
            <Field label="Qo‘shimcha izoh (ixtiyoriy)">
              <textarea rows={3} value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
            </Field>
          </>
        )}

        {(assignment.kind === "image" || assignment.kind === "file") && (
          <>
            <Field
              label={
                assignment.kind === "image"
                  ? "Rasm yoki skrinshot tanlang (avtomatik siqiladi)"
                  : "Fayl tanlang (PDF, DOCX, XLSX, PPTX, ZIP, TXT — max 5 MB)"
              }
            >
              <label className="hw-upload-box">
                <Upload size={18} />
                <span>{uploading ? "Yuklanmoqda…" : fileInfo ? `Yuklandi: ${fileInfo.file_name} (${fmtBytes(fileInfo.file_size)})` : "Fayl tanlash uchun bosing"}</span>
                <input
                  type="file"
                  accept={assignment.kind === "image" ? "image/*" : ".pdf,.docx,.xlsx,.pptx,.zip,.txt,image/*"}
                  disabled={uploading}
                  onChange={(e) => void onPickFile(e.target.files?.[0] || null)}
                  style={{ display: "none" }}
                />
              </label>
            </Field>
            <Field label="Izoh (ixtiyoriy)">
              <textarea rows={2} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="O‘qituvchi uchun qisqa izoh…" />
            </Field>
          </>
        )}

        <button className="btn primary full" disabled={busy || uploading}>
          <CheckCircle2 size={16} /> {busy ? "Yuborilmoqda…" : "Vazifani yuborish"}
        </button>
      </form>
    </Modal>
  );
}
