import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Award, CalendarDays, Search } from "lucide-react";
import { Busy, Empty, ErrorBox, Field, Pill, useData } from "./ui";
import { openCertificatePrint } from "./cert-pdf";
import { useConfig } from "./main";

const ATT_LABEL: Record<string, { text: string; tone: "green" | "amber" | "red" | "blue" }> = {
  present: { text: "Keldi (+)", tone: "green" },
  late: { text: "Kechikdi (K)", tone: "amber" },
  absent: { text: "Kelmadi (—)", tone: "red" },
  excused: { text: "Sababli (S)", tone: "blue" },
};

export function ParentPortal() {
  const cfg = useConfig();
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const [inputCode, setInputCode] = useState(code);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const activeCode = code.trim();
  const queryUrl = activeCode
    ? `/api/v2/public/parent/${encodeURIComponent(activeCode)}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
    : "";

  const data = useData(queryUrl || "/api/v2/public/parent/__empty__");

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (!cleaned) return;
    navigate("/parent/" + encodeURIComponent(cleaned));
  }

  function setThisMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const last = String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, "0");
    setFromDate(`${y}-${m}-01`);
    setToDate(`${y}-${m}-${last}`);
  }

  const d = activeCode ? data.data : null;

  return (
    <div className="exam-join parent-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }} className="back-link" style={{ margin: 0 }}>
          <ArrowLeft size={17} />
          Orqaga
        </Link>
        {activeCode && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {cfg.tg_bot_username && (
            <a
              href={"https://t.me/" + encodeURIComponent(cfg.tg_bot_username) + "?start=" + encodeURIComponent(activeCode)}
              target="_blank"
              rel="noreferrer"
              className="btn primary tiny"
            >
              🤖 Telegram xabarnoma ulash
            </a>
          )}
          <Link to={"/vazifalar/" + encodeURIComponent(activeCode)} className="btn secondary tiny">
            Uyga vazifalar <ArrowRight size={14} />
          </Link>
          </div>
        )}
      </div>

      <section className="panel" style={{ marginBottom: 18 }}>
        <span className="eyebrow">OTA-ONALAR VA O‘QUVCHILAR KABINETI</span>
        <h1>Farzandingiz natijalarini tekshiring</h1>
        <p className="muted">
          Ro‘yxatdan o‘tish shart emas. O‘qituvchi bergan maxsus o‘quvchi kodini (masalan: <strong>K48291</strong>) kiriting — barcha test natijalari, davomat va yutuqlar (chegirmalar) ko‘rinadi.
        </p>
        <form className="parent-lookup-form" onSubmit={onLookup}>
          <div className="lib-search-box" style={{ margin: 0, flex: 1 }}>
            <Search size={18} />
            <input
              required
              minLength={3}
              maxLength={32}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="O‘quvchi kodi (masalan: K48291)"
            />
          </div>
          <button className="btn primary">
            Natijani ko‘rish <ArrowRight size={17} />
          </button>
        </form>
      </section>

      {!activeCode ? null : data.loading ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : d ? (
        <>
          <section className="panel" style={{ marginBottom: 18 }}>
            <div className="parent-student-head">
              <div>
                <span className="eyebrow">{d.student.center_name} · {d.student.group_name}</span>
                <h2 style={{ margin: "4px 0 2px" }}>{d.student.name}</h2>
                <small className="muted">O‘quvchi kodi: <strong>{d.student.student_code}</strong></small>
              </div>
              <div className="parent-date-filters">
                <Field label="Sanadan">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </Field>
                <Field label="Sanagacha">
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </Field>
                <div className="actions" style={{ alignSelf: "end", paddingBottom: 4 }}>
                  <button type="button" className="btn secondary tiny" onClick={setThisMonth}>
                    Shu oy
                  </button>
                  {(fromDate || toDate) && (
                    <button
                      type="button"
                      className="btn ghost tiny"
                      onClick={() => {
                        setFromDate("");
                        setToDate("");
                      }}
                    >
                      Barchasi
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="journal-kpis">
            <div className="panel">
              <small className="muted">O‘rtacha bilim</small>
              <strong>{d.summary.avg_percent !== null ? d.summary.avg_percent + "%" : "—"}</strong>
            </div>
            <div className="panel">
              <small className="muted">O‘tgan / Jami testlar</small>
              <strong>
                {d.summary.tests_passed} / {d.summary.tests_taken}
              </strong>
            </div>
            <div className="panel">
              <small className="muted">Davomat foizi</small>
              <strong>
                {d.summary.attendance_percent !== null ? d.summary.attendance_percent + "%" : "—"}
              </strong>
            </div>
            <div className="panel">
              <small className="muted">Qo‘lga kiritilgan yutuqlar</small>
              <strong>🏆 {d.summary.rewards_count} ta</strong>
            </div>
          </div>

          {d.rewards?.length > 0 && (
            <section className="panel parent-rewards-panel" style={{ marginBottom: 18 }}>
              <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <Award size={20} /> Yutuqlar va chegirmalar (Skitkalar)
              </h2>
              <div className="parent-rewards-grid">
                {d.rewards.map((rw: any, i: number) => (
                  <div className="reward-banner" key={i} style={{ margin: 0 }}>
                    <strong>🏆 {rw.reward}</strong>
                    <small style={{ display: "block", marginTop: 4 }}>
                      {rw.test_title} · {rw.percentage}% ·{" "}
                      {new Date(rw.submitted_at * 1000).toLocaleDateString("uz-UZ")}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel" style={{ marginBottom: 18 }}>
            <h2 style={{ marginTop: 0 }}>Topshirilgan testlar ({d.tests.length})</h2>
            {!d.tests.length ? (
              <Empty
                title="Test natijalari topilmadi"
                text="Tanlangan sana oralig‘ida topshirilgan testlar yo‘q."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Sana</th>
                      <th>Test nomi</th>
                      <th>Natija</th>
                      <th>Holat</th>
                      <th>Yutuq / Chegirma</th>
                      <th>Nazorat</th>
                      <th>Sertifikat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.tests.map((t: any) => (
                      <tr key={t.id}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {new Date(t.submitted_at * 1000).toLocaleDateString("uz-UZ")}
                        </td>
                        <td>
                          <strong>{t.title}</strong>
                          {t.category && (
                            <small className="muted" style={{ display: "block" }}>
                              {t.category}
                            </small>
                          )}
                        </td>
                        <td>
                          <strong>{t.percentage}%</strong> ({t.score}/{t.max_score})
                        </td>
                        <td>
                          <Pill tone={t.passed ? "green" : "red"}>
                            {t.passed ? "O‘tdi" : "O‘tmadi"}
                          </Pill>
                        </td>
                        <td>
                          {t.reward ? (
                            t.passed ? (
                              <span className="parent-reward-won">🏆 {t.reward}</span>
                            ) : (
                              <small className="muted">Maqsad: {t.reward}</small>
                            )
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {t.auto_submitted ? (
                            <Pill tone="red">Avto-yakun ({t.violations_count})</Pill>
                          ) : t.violations_count > 0 ? (
                            <Pill tone="amber">{t.violations_count} ta</Pill>
                          ) : (
                            <Pill tone="green">Toza</Pill>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn secondary tiny"
                            onClick={() =>
                              openCertificatePrint({
                                studentName: d.student?.name || "O‘quvchi",
                                studentCode: d.student?.student_code || activeCode,
                                groupName: d.student?.group_name || "",
                                tenantName: d.student?.tenant_name || "",
                                testTitle: t.card_title || "Onlayn test",
                                category: t.card_category || "",
                                percentage: Number(t.percentage || 0),
                                score: Number(t.score || 0),
                                maxScore: Number(t.max_score || 0),
                                passed: !!t.passed || Number(t.percentage || 0) >= 70,
                                reward: t.reward || "",
                                dateText: new Date(Number(t.submitted_at || Date.now() / 1000) * 1000).toLocaleDateString("uz-UZ"),
                                certCode: "BUZ-" + String(d.student?.student_code || activeCode || "CERT").slice(0, 6) + "-" + String(t.id || "01").slice(0, 4).toUpperCase(),
                              })
                            }
                          >
                            🏅 PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <CalendarDays size={20} /> Davomat tarixi ({d.attendance.length} kun)
            </h2>
            <div className="journal-legend" style={{ marginBottom: 12 }}>
              <span className="att-pill present">Keldi: {d.summary.present_count}</span>
              <span className="att-pill late">Kechikdi: {d.summary.late_count}</span>
              <span className="att-pill absent">Kelmadi: {d.summary.absent_count}</span>
              <span className="att-pill excused">Sababli: {d.summary.excused_count}</span>
            </div>
            {!d.attendance.length ? (
              <Empty
                title="Davomat yozuvlari yo‘q"
                text="Tanlangan sana oralig‘ida davomat belgilanmagan."
              />
            ) : (
              <div className="parent-att-grid">
                {d.attendance.map((a: any) => {
                  const m = ATT_LABEL[a.status] || { text: a.status, tone: "neutral" as const };
                  return (
                    <div className="parent-att-chip" key={a.lesson_date}>
                      <strong>{a.lesson_date}</strong>
                      <Pill tone={m.tone}>{m.text}</Pill>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
