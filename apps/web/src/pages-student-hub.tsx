import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Trophy,
  Upload,
} from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Field, Modal, Pill, useData, useToast } from "./ui";

const ATT_LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" | "blue" }> = {
  present: { text: "Keldi (+)", tone: "green" },
  late: { text: "Kechikdi (K)", tone: "amber" },
  absent: { text: "Kelmadi (—)", tone: "red" },
  excused: { text: "Sababli (S)", tone: "blue" },
};

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

function fmtBytes(n: number) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

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

interface StudentBadge {
  id: string;
  icon: string;
  title: string;
  desc: string;
  unlocked: boolean;
}

function computeBadges(pData: any, hwSum: any, lb: any): StudentBadge[] {
  const tests: any[] = pData?.tests?.items || [];
  const has100 = tests.some((t) => Number(t.percentage) >= 100);
  const testsCount = tests.length;
  const avgTest = Number(pData?.tests?.avg_percent ?? 0);
  const attPct = Number(pData?.attendance?.percent ?? 0);
  const attTotal =
    Number(pData?.attendance?.present || 0) +
    Number(pData?.attendance?.late || 0) +
    Number(pData?.attendance?.absent || 0) +
    Number(pData?.attendance?.excused || 0);
  const hwDone = Number(hwSum?.submitted || 0);
  const rank = Number(lb?.my_rank || 0);
  const xp = Number(lb?.me?.xp || 0);

  return [
    { id: "sniper", icon: "🎯", title: "100% Snayper", desc: "Biror testda 100% natija olish", unlocked: has100 },
    { id: "streak5", icon: "🔥", title: "Faol sinovchi", desc: "Kamida 5 ta test topshirish", unlocked: testsCount >= 5 },
    { id: "excel", icon: "⭐", title: "A’lochi", desc: "O‘rtacha test natijasi 85%+", unlocked: testsCount >= 1 && avgTest >= 85 },
    { id: "hw3", icon: "📚", title: "Vazifa ustasi", desc: "Kamida 3 ta vazifa topshirish", unlocked: hwDone >= 3 },
    { id: "att90", icon: "✅", title: "Intizomli", desc: "Davomat 90%+ (kamida 3 dars)", unlocked: attTotal >= 3 && attPct >= 90 },
    { id: "leader", icon: "🏆", title: "Guruh lideri", desc: "Guruh reytingida 1-o‘rin", unlocked: rank === 1 && xp > 0 },
    { id: "top3", icon: "🥉", title: "Top-3 ishtirokchi", desc: "Guruh reytingida Top-3 ga kirish", unlocked: rank > 0 && rank <= 3 && xp > 0 },
    { id: "xp500", icon: "💎", title: "Bilimdon (500+ XP)", desc: "500 va undan yuqori XP to‘plash", unlocked: xp >= 500 },
  ];
}

export function StudentCabinetPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const savedCode = typeof localStorage !== "undefined" ? localStorage.getItem("bilimuz_student_code") || "" : "";
  const [inputCode, setInputCode] = useState(code || savedCode);
  const [tab, setTab] = useState<"hw" | "tests" | "attendance" | "rating">("hw");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeHw, setActiveHw] = useState<any>(null);

  const activeCode = code.trim();
  const hwData = useData(
    activeCode
      ? `/api/v2/public/assignments/student/${encodeURIComponent(activeCode)}`
      : "/api/v2/public/assignments/student/__empty__",
  );
  const parentData = useData(
    activeCode
      ? `/api/v2/public/parent/${encodeURIComponent(activeCode)}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
      : "/api/v2/public/parent/__empty__",
  );
  const lbData = useData(
    activeCode
      ? `/api/v2/public/assignments/leaderboard/${encodeURIComponent(activeCode)}`
      : "/api/v2/public/assignments/leaderboard/__empty__",
  );

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (!cleaned) return;
    try { localStorage.setItem("bilimuz_student_code", cleaned); } catch {}
    navigate("/student/" + encodeURIComponent(cleaned));
  }

  function setThisMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const last = String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, "0");
    setFromDate(`${y}-${m}-01`);
    setToDate(`${y}-${m}-${last}`);
  }

  const st = hwData.data?.student || parentData.data?.student;
  const hwSum = hwData.data?.summary;
  const hwItems: any[] = hwData.data?.items || [];
  const pData = parentData.data;
  const lb = lbData.data;
  const badges = st ? computeBadges(pData, hwSum, lb) : [];
  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const loadingAny = activeCode && hwData.loading && parentData.loading;
  const lookupError = activeCode && (hwData.error || parentData.error);

  return (
    <div className="exam-join lib-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Link to="/" className="back-link" style={{ margin: 0 }}>
          <ArrowLeft size={17} /> Bosh sahifa
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/library" className="btn secondary tiny">Kutubxona</Link>
          <Link to="/games" className="btn secondary tiny">O‘yinlar</Link>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 18 }}>
        <span className="eyebrow">BILIM UZ · YAGONA O‘QUVCHI KABINETI</span>
        <h1 style={{ margin: "6px 0 8px" }}>O‘quvchi kabineti</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Shaxsiy kodingiz (masalan: <code>K48291</code>) bilan kirib, <strong>vazifalaringiz</strong>, <strong>test natijalaringiz</strong>, <strong>davomatingiz</strong> va <strong>guruh reytingi (Top-10)</strong> ni bitta oynada kuzating.
        </p>
        <form onSubmit={onLookup} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <input
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value)}
            placeholder="O‘quvchi kodi (masalan: K48291)"
            required
            maxLength={40}
            style={{ flex: "1 1 220px" }}
          />
          <button className="btn primary">
            Kabinetga kirish <ArrowRight size={16} />
          </button>
        </form>
      </div>

      {activeCode && (
        loadingAny ? (
          <Busy />
        ) : lookupError && !st ? (
          <ErrorBox error={lookupError} retry={() => { hwData.reload(); parentData.reload(); lbData.reload(); }} />
        ) : st ? (
          <>
            {/* Profil va Umumiy KPI kartalar */}
            <div className="panel" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="student-name-cell" style={{ marginBottom: 4 }}>
                    <h2 style={{ margin: 0 }}>{st.name}</h2>
                    {st.note && <span className="student-note-tag">{st.note}</span>}
                  </div>
                  <small className="muted">
                    Kod: <strong>{st.student_code}</strong> · Guruh: <strong>{st.group_name || "Umumiy"}</strong>
                    {pData?.student?.center_name ? ` · ${pData.student.center_name}` : ""}
                  </small>
                </div>
                {lb?.my_rank && (
                  <Pill tone="green">
                    🏆 Guruhda #{lb.my_rank}-o‘rin ({lb.total_students} o‘quvchidan)
                  </Pill>
                )}
              </div>

              <div className="journal-kpis" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="panel">
                  <small className="muted">Vazifalar</small>
                  <strong>{hwSum ? `${hwSum.submitted} / ${hwSum.total}` : "—"}</strong>
                </div>
                <div className="panel">
                  <small className="muted">O‘rtacha test</small>
                  <strong>{pData?.tests?.avg_percent !== null && pData?.tests?.avg_percent !== undefined ? pData.tests.avg_percent + "%" : "—"}</strong>
                </div>
                <div className="panel">
                  <small className="muted">Davomat</small>
                  <strong>{pData?.attendance?.percent !== null && pData?.attendance?.percent !== undefined ? pData.attendance.percent + "%" : "—"}</strong>
                </div>
                <div className="panel">
                  <small className="muted">Reyting balli</small>
                  <strong>{lb?.me ? lb.me.xp + " XP" : "—"}</strong>
                </div>
              </div>
            </div>

            {/* Yutuq nishonlari (Badges) */}
            {badges.length > 0 && (
              <div className="panel" style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <strong style={{ fontSize: 15 }}>🏅 Yutuq nishonlari (Badges)</strong>
                  <Pill tone={unlockedCount > 0 ? "green" : "neutral"}>
                    {unlockedCount} / {badges.length} ochilgan
                  </Pill>
                </div>
                <div className="badges-grid">
                  {badges.map((b) => (
                    <div key={b.id} className={"badge-card" + (b.unlocked ? " is-unlocked" : " is-locked")} title={b.desc}>
                      <span className="badge-icon">{b.icon}</span>
                      <div>
                        <strong>{b.title}</strong>
                        <small>{b.desc}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4 ta asosiy tab */}
            <div className="tabs-bar" style={{ marginBottom: 16 }}>
              <button type="button" className={tab === "hw" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("hw")}>
                <ClipboardList size={14} /> Vazifalarim ({hwItems.length})
              </button>
              <button type="button" className={tab === "tests" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("tests")}>
                <Award size={14} /> Test natijalarim ({pData?.tests?.items?.length || 0})
              </button>
              <button type="button" className={tab === "attendance" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("attendance")}>
                <CalendarDays size={14} /> Davomatim
              </button>
              <button type="button" className={tab === "rating" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("rating")}>
                <Trophy size={14} /> Guruh reytingi (Top-10)
              </button>
            </div>

            {/* TAB 1: VAZIFALARIM */}
            {tab === "hw" && (
              hwData.loading ? (
                <Busy />
              ) : !hwItems.length ? (
                <div className="panel">
                  <Empty title="Hozircha vazifalar yo‘q" text="O‘qituvchingiz yangi vazifa berganda shu yerda chiqadi." />
                </div>
              ) : (
                <div className="hw-grid">
                  {hwItems.map((a: any) => {
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
                          <div className="lib-callout is-tip" style={{ margin: "8px 0 0", padding: "9px 12px", fontSize: 13 }}>
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
              )
            )}

            {/* TAB 2: TEST NATIJALARIM */}
            {tab === "tests" && (
              parentData.loading ? (
                <Busy />
              ) : (
                <div className="panel">
                  <div className="parent-date-filters" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
                    <Field label="Dan">
                      <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                    </Field>
                    <Field label="Gacha">
                      <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                    </Field>
                    <button type="button" className="btn secondary tiny" onClick={setThisMonth}>Shu oy</button>
                    {(fromDate || toDate) && (
                      <button type="button" className="btn secondary tiny" onClick={() => { setFromDate(""); setToDate(""); }}>Tozalash</button>
                    )}
                  </div>

                  {pData?.rewards?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <h3 style={{ margin: "0 0 8px" }}>🏆 Yutuqlar va chegirmalar</h3>
                      <div className="parent-rewards-grid">
                        {pData.rewards.map((rw: any, i: number) => (
                          <div className="panel" key={i} style={{ padding: 12, background: "#ecfdf5", borderColor: "#86efac" }}>
                            <strong>{rw.reward}</strong>
                            <small className="muted" style={{ display: "block" }}>{rw.card_title} · {rw.percentage}%</small>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {!pData?.tests?.items?.length ? (
                    <Empty title="Test natijalari hali yo‘q" text="Test topshirganingizdan so‘ng barcha natijalaringiz shu yerda ko‘rinadi." />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Test nomi</th>
                            <th>Sana</th>
                            <th>Ball</th>
                            <th>Natija</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pData.tests.items.map((t: any, idx: number) => (
                            <tr key={idx}>
                              <td><strong>{t.card_title}</strong></td>
                              <td>{new Date(t.submitted_at * 1000).toLocaleDateString("uz-UZ")}</td>
                              <td>{t.score} / {t.max_score}</td>
                              <td>
                                <Pill tone={t.passed ? "green" : t.percentage >= 50 ? "amber" : "red"}>
                                  {t.percentage}%
                                </Pill>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            )}

            {/* TAB 3: DAVOMATIM */}
            {tab === "attendance" && (
              parentData.loading ? (
                <Busy />
              ) : (
                <div className="panel">
                  <div className="journal-legend" style={{ marginBottom: 14 }}>
                    <span className="att-pill present">Keldi: {pData?.attendance?.present || 0}</span>
                    <span className="att-pill late">Kechikdi: {pData?.attendance?.late || 0}</span>
                    <span className="att-pill absent">Kelmadi: {pData?.attendance?.absent || 0}</span>
                    <span className="att-pill excused">Sababli: {pData?.attendance?.excused || 0}</span>
                  </div>
                  {!pData?.attendance?.items?.length ? (
                    <Empty title="Davomat yozuvlari yo‘q" text="O‘qituvchi kurs jurnalida davomat belgilaganda shu yerda ko‘rinadi." />
                  ) : (
                    <div className="parent-att-grid">
                      {pData.attendance.items.map((a: any, i: number) => {
                        const m = ATT_LABEL[a.status] || { text: a.status, tone: "blue" as const };
                        return (
                          <div className="panel" key={i} style={{ padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong>{a.lesson_date}</strong>
                            <Pill tone={m.tone}>{m.text}</Pill>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )
            )}

            {/* TAB 4: GURUH REYTINGI (TOP-10) */}
            {tab === "rating" && (
              lbData.loading ? (
                <Busy />
              ) : !lb?.top10?.length ? (
                <div className="panel">
                  <Empty title="Reyting hali shakllanmagan" text="Testlar va vazifalar bajarilgani sari Top-10 reyting shu yerda chiqadi." />
                </div>
              ) : (
                <div className="panel">
                  <div className="panel-title" style={{ marginBottom: 12 }}>
                    <div>
                      <h2 style={{ margin: 0 }}>🏆 {lb.group_name} — Top-10 reyting</h2>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        Reyting test natijalari, davomat va bajarilgan vazifalar asosida avtomatik hisoblanadi.
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 56 }}>O‘rin</th>
                          <th>O‘quvchi</th>
                          <th>Test (%)</th>
                          <th>Davomat</th>
                          <th>Vazifalar</th>
                          <th>Reyting (XP)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lb.top10.map((r: any) => {
                          const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
                          return (
                            <tr key={r.id} className={r.is_me ? "lb-row-me" : ""}>
                              <td><strong>{medal}</strong></td>
                              <td>
                                <div className="student-name-cell">
                                  <strong>{r.name}</strong>
                                  {r.note && <span className="student-note-tag">{r.note}</span>}
                                  {r.is_me && <Pill tone="green">Siz</Pill>}
                                </div>
                              </td>
                              <td>{r.avg_test !== null ? `${r.avg_test}%` : "—"}</td>
                              <td>{r.att_pct !== null ? `${r.att_pct}%` : "—"}</td>
                              <td>{r.hw_done} ta</td>
                              <td><strong>{r.xp} XP</strong></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </>
        ) : null
      )}

      {activeHw && st && (
        <HubSubmitModal
          code={st.student_code}
          assignment={activeHw}
          close={() => setActiveHw(null)}
          onSubmitted={() => {
            setActiveHw(null);
            hwData.reload();
            lbData.reload();
            toast("Vazifa muvaffaqiyatli topshirildi!");
          }}
        />
      )}
    </div>
  );
}

function HubSubmitModal({
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
      if (ready.size > 5 * 1024 * 1024) throw new Error("Fayl hajmi 5 MB dan oshmasligi kerak");
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
      {assignment.description && <div className="lib-ch-summary" style={{ marginBottom: 14 }}>{assignment.description}</div>}
      {!!error && <ErrorBox error={error} />}
      <form onSubmit={submit}>
        {assignment.kind === "text" && (
          <Field label="Javobingiz (matn yoki dastur kodi)">
            <textarea rows={6} value={answerText} onChange={(e) => setAnswerText(e.target.value)} required placeholder="Javobingizni shu yerga yozing…" />
          </Field>
        )}
        {assignment.kind === "link" && (
          <>
            <Field label="Havola (Google Docs, GitHub, Figma…)">
              <input type="url" value={answerLink} onChange={(e) => setAnswerLink(e.target.value)} required placeholder="https://..." />
            </Field>
            <Field label="Qo‘shimcha izoh (ixtiyoriy)">
              <textarea rows={3} value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
            </Field>
          </>
        )}
        {(assignment.kind === "image" || assignment.kind === "file") && (
          <>
            <Field label={assignment.kind === "image" ? "Rasm yoki skrinshot tanlang (avtomatik siqiladi)" : "Fayl tanlang (PDF, DOCX, XLSX, PPTX, ZIP, TXT — max 5 MB)"}>
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
