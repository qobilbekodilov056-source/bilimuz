import { useEffect, useState, type FormEvent } from "react";
import { Link, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ClipboardCheck,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Pill, useData, useToast } from "./ui";

const LEARNER_NAV = [
  ["", "Boshqaruv", LayoutDashboard],
  ["books", "Kitoblarim", BookOpen],
  ["tests", "Testlarim", ClipboardCheck],
  ["results", "Natijalarim", BarChart3],
  ["group", "Guruhim (ST-...)", Users],
] as const;

export function LearnerBillingStandalone() {
  const st = useData("/api/v2/auth/learner-billing/status");
  const toast = useToast();
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [order, setOrder] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!order || order.paid) return;
    const t = setInterval(async () => {
      try {
        const r = await api("/api/v2/auth/learner-billing/order/" + encodeURIComponent(order.order_id) + "/status");
        if (r?.paid) {
          setOrder({ ...order, paid: true });
          toast("🎉 To‘lov tasdiqlandi! Abituriyent obunangiz faollashdi!");
          st.reload();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [order]);

  if (st.loading) return <Busy />;
  if (st.error) return <ErrorBox error={st.error} retry={st.reload} />;

  const curPlan = st.data?.plan || { id: "free", name: "Bepul", expires_at: 0 };
  const mul = months >= 12 ? 0.8 : months >= 6 ? 0.85 : months >= 3 ? 0.9 : 1;
  const calcPrice = (monthly: number) => Math.round((monthly * mul) / 1000) * 1000;

  async function startOrder(planId: "learner_books" | "learner_pro") {
    setBusy(planId);
    setError(null);
    try {
      const res = await api("/api/v2/auth/learner-billing/create-order", {
        method: "POST",
        data: { plan: planId, months },
      });
      setOrder(res);
    } catch (e) {
      setError(e);
    } finally {
      setBusy("");
    }
  }

  return (
    <div style={{ maxWidth: 1020, margin: "0 auto", padding: "12px 4px 48px" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Pill tone="green">🎓 ABITURIYENT VA O‘QUVCHI TARIFLARI</Pill>
        <h1 style={{ margin: "10px 0 8px", fontSize: "clamp(26px, 3.2vw, 38px)" }}>O‘zingizga mos obunani tanlang</h1>
        <p className="muted" style={{ maxWidth: 560, margin: "0 auto 18px" }}>
          Obuna davomida tanlangan barcha pullik kitob va IELTS/DTM testlari ochiq bo‘ladi. Alohida sotib olgan kitob va testlaringiz esa profilingizda umrbod qoladi.
        </p>

        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #dce5ea", borderRadius: 14, padding: 4, gap: 4 }}>
          {([
            [1, "1 oy"],
            [3, "3 oy (-10%)"],
            [6, "6 oy (-15%)"],
            [12, "12 oy (-20%)"],
          ] as const).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13.5,
                background: months === m ? "#162d3d" : "transparent",
                color: months === m ? "#fff" : "#334155",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!!error && <ErrorBox error={error} />}

      {order && !order.paid && (
        <div className="panel" style={{ maxWidth: 560, margin: "0 auto 24px", background: "#ecfdf5", borderColor: "#10b981" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ color: "#065744" }}>24/7 Avtomatik to‘lov — {order.plan_name} ({order.months} oy)</strong>
            <button type="button" className="btn ghost tiny" onClick={() => setOrder(null)}>Yopish</button>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#065744", margin: "8px 0" }}>
            {Number(order.unique_amount).toLocaleString("uz-UZ")} so‘m
          </div>
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
            Karta: <strong>{order.card_number}</strong> ({order.card_holder || order.bank_name})
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Click / Payme / Uzum orqali aynan <strong>{Number(order.unique_amount).toLocaleString("uz-UZ")} so‘m</strong> o‘tkazing — 5–15 soniyada obunangiz avtomatik yoqiladi!
          </p>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 20, alignItems: "stretch" }}>
        {/* 1. BEPUL */}
        <article className="panel" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 26, borderRadius: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Bepul</h2>
            {curPlan.id === "free" && <Pill tone="green">Joriy</Pill>}
          </div>
          <div>
            <strong style={{ fontSize: 32 }}>0 so‘m</strong> <span className="muted">/ oy</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Bepul mashq testlari va kutubxonadan foydalanish, kerakli kitob/testni alohida sotib olish.</p>
          <button type="button" className="btn secondary full" disabled>
            {curPlan.id === "free" ? "Joriy bepul tarif" : "Bepul rejim"}
          </button>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <li><Check size={15} color="#0c8066" /> Barcha bepul mashq testlari</li>
            <li><Check size={15} color="#0c8066" /> Barcha bepul elektron kitoblar</li>
            <li><Check size={15} color="#0c8066" /> Pullik kitoblardan 1-bob tanishuv</li>
            <li><Check size={15} color="#0c8066" /> Alohida sotib olinganlar umrbod qoladi</li>
          </ul>
        </article>

        {/* 2. KITOBXON PLUS */}
        <article className="panel" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 26, borderRadius: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Kitobxon Plus</h2>
            {curPlan.id === "learner_books" && <Pill tone="green">Faol</Pill>}
          </div>
          <div>
            <strong style={{ fontSize: 32 }}>{calcPrice(29000).toLocaleString("uz-UZ")} so‘m</strong> <span className="muted">/ oy</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>Elektron kutubxonadagi barcha pullik darslik va IELTS qo‘llanmalarini cheklovsiz o‘qish.</p>
          <button type="button" className="btn primary full" disabled={busy === "learner_books"} onClick={() => startOrder("learner_books")}>
            {busy === "learner_books" ? "Tayyorlanmoqda..." : "Kitobxon Plus ga o‘tish"}
          </button>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <li><Check size={15} color="#0c8066" /> <strong>Barcha pullik kitob va qo‘llanmalar ochiq</strong></li>
            <li><Check size={15} color="#0c8066" /> Barcha bepul mashq testlari</li>
            <li><Check size={15} color="#0c8066" /> Shaxsiy natijalar tarixi</li>
            <li><Check size={15} color="#0c8066" /> Istalgan qurilmadan sinxron kirish</li>
          </ul>
        </article>

        {/* 3. ABITURIYENT PRO */}
        <article className="panel" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 26, borderRadius: 22, border: "2px solid #0c8066", background: "linear-gradient(180deg, #f0fdf8 0%, #ffffff 35%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Abituriyent Pro</h2>
            <Pill tone="green">{curPlan.id === "learner_pro" ? "Faol" : "⚡ Eng ommabop"}</Pill>
          </div>
          <div>
            <strong style={{ fontSize: 32 }}>{calcPrice(59000).toLocaleString("uz-UZ")} so‘m</strong> <span className="muted">/ oy</span>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>IELTS Mock, DTM, Attestatsiya testlari va barcha pullik kitoblar to‘liq cheklovsiz.</p>
          <button type="button" className="btn primary full" style={{ background: "#0c8066" }} disabled={busy === "learner_pro"} onClick={() => startOrder("learner_pro")}>
            {busy === "learner_pro" ? "Tayyorlanmoqda..." : "Abituriyent Pro ga o‘tish"}
          </button>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <li><Check size={15} color="#0c8066" /> <strong>Barcha pullik IELTS / DTM testlari ochiq</strong></li>
            <li><Check size={15} color="#0c8066" /> <strong>Barcha pullik kitob va qo‘llanmalar ochiq</strong></li>
            <li><Check size={15} color="#0c8066" /> Cheksiz urinishlar va xatolar tahlili</li>
            <li><Check size={15} color="#0c8066" /> Rasmiy QR-kodli PDF sertifikatlar</li>
          </ul>
        </article>
      </div>
    </div>
  );
}

export function LearnerCabinetPage() {
  const data = useData("/api/v2/auth/learner-hub");
  const location = useLocation();
  const navigate = useNavigate();
  const [stCode, setStCode] = useState("");
  const section = location.pathname.split("/")[2] || "";

  if (data.loading) return <Busy />;
  if (data.error) {
    const err: any = data.error;
    if (err?.status === 401 || err?.status === 403) {
      return <Navigate to="/login" replace />;
    }
    return <div className="exam-join"><ErrorBox error={data.error} retry={data.reload} /></div>;
  }

  const { user, plan, has_books_access, has_tests_access, paid_books = [], paid_tests = [], test_history = [] } = data.data;

  // Qat’iy rol himoyasi: teacher bu yerga kira olmaydi!
  if (user?.scope === "owner") return <Navigate to="/owner" replace />;
  if (user?.account_type === "teacher") return <Navigate to="/studio" replace />;

  const avgPct = test_history.length
    ? Math.round(test_history.reduce((acc: number, x: any) => acc + Number(x.percentage || 0), 0) / test_history.length)
    : 0;

  function openStudentCode(e: FormEvent) {
    e.preventDefault();
    const cleaned = stCode.trim();
    if (!cleaned) return;
    navigate("/student/" + encodeURIComponent(cleaned));
  }

  async function logout() {
    try {
      await api("/api/v2/auth/logout", { method: "POST", data: {} });
      navigate("/");
    } catch {}
  }

  return (
    <div className="owner-layout">
      <aside className="owner-dock">
        <Link to="/" className="owner-logo">
          <img className="brand-logo" src="/logo.png" alt="Bilim UZ" />
          Bilim UZ <b>Abituriyent</b>
        </Link>
        <Pill tone="green"><GraduationCap size={13} /> {plan?.name || "Bepul"}</Pill>
        <nav>
          {LEARNER_NAV.map(([p, label, Icon]) => (
            <NavLink key={p} end={!p} to={"/learner" + (p ? "/" + p : "")}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <NavLink to="/pricing" style={{ marginTop: 10, border: "1px solid rgba(124,242,210,0.35)", borderRadius: 12 }}>
            <CreditCard size={18} />
            Tarifni yangilash
          </NavLink>
        </nav>
        <button className="btn secondary" onClick={() => void logout()}>
          <LogOut size={16} />
          Chiqish
        </button>
      </aside>

      <main className="owner-main">
        {section === "billing" ? (
          <Navigate to="/pricing" replace />
        ) : section === "books" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h1 style={{ margin: 0 }}>📚 Mening kitoblarim</h1>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {has_books_access
                    ? "Faol obunangiz tufayli kutubxonadagi barcha pullik kitoblar ochiq!"
                    : "Alohida sotib olgan kitoblaringiz profilingizda umrbod saqlanadi."}
                </p>
              </div>
              <Link to="/library" className="btn primary">Barcha kutubxona <ArrowRight size={15} /></Link>
            </div>
            {!paid_books.length ? (
              <div className="panel">
                <Empty
                  title={has_books_access ? "Barcha pullik kitoblar obuna orqali ochiq!" : "Hali alohida sotib olingan kitob yo‘q"}
                  text="Kutubxona bo‘limiga o‘tib kerakli darslik va IELTS qo‘llanmalarini o‘qishingiz mumkin."
                />
              </div>
            ) : (
              <div className="cards-grid">
                {paid_books.map((b: any) => (
                  <article className="panel" key={b.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Pill tone="green">✓ Umrbod ochiq</Pill>
                    <h3 style={{ margin: 0 }}>{b.title}</h3>
                    <small className="muted">{b.subject}</small>
                    <Link to={"/library/" + encodeURIComponent(b.id)} className="btn primary tiny" style={{ marginTop: "auto" }}>
                      Kitobni o‘qish <ArrowRight size={14} />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : section === "tests" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <h1 style={{ margin: 0 }}>🎯 Mening testlarim</h1>
                <p className="muted" style={{ margin: "4px 0 0" }}>
                  {has_tests_access
                    ? "Abituriyent Pro obunangiz faol — barcha IELTS/DTM pullik testlar ochiq!"
                    : "Alohida sotib olgan IELTS/DTM testlaringiz shu yerda umrbod saqlanadi."}
                </p>
              </div>
              <Link to="/practice" className="btn primary">Barcha testlar <ArrowRight size={15} /></Link>
            </div>
            {!paid_tests.length ? (
              <div className="panel">
                <Empty
                  title={has_tests_access ? "Barcha pullik testlar obuna orqali ochiq!" : "Hali alohida sotib olingan test yo‘q"}
                  text="Ochiq testlar katalogidan bepul yoki maxsus IELTS/DTM testlarini tanlab yeching."
                />
              </div>
            ) : (
              <div className="cards-grid">
                {paid_tests.map((t: any) => (
                  <article className="panel" key={t.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Pill tone="green">✓ Umrbod ochiq</Pill>
                    <h3 style={{ margin: 0 }}>{t.title}</h3>
                    <small className="muted">{t.slug}</small>
                    <Link to={"/practice/" + encodeURIComponent(t.slug)} className="btn primary tiny" style={{ marginTop: "auto" }}>
                      Testni boshlash <ArrowRight size={14} />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : section === "results" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <h1 style={{ margin: 0 }}>📊 Natijalarim</h1>
              <p className="muted" style={{ margin: "4px 0 0" }}>
                Jami yechilgan: <strong>{test_history.length}</strong> ta · O‘rtacha natija: <strong>{avgPct}%</strong>
              </p>
            </div>
            {!test_history.length ? (
              <div className="panel">
                <Empty title="Hali yechilgan testlar yo‘q" text="Ochiq testlardan birini yeching — barcha natijalaringiz avtomatik shu jadvalda saqlanadi." />
              </div>
            ) : (
              <div className="panel" style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Test nomi</th>
                      <th>Ball</th>
                      <th>Foiz</th>
                      <th>Holat</th>
                      <th>Amal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {test_history.map((h: any) => (
                      <tr key={h.id}>
                        <td><strong>{h.card_title}</strong></td>
                        <td>{h.score} / {h.max_score}</td>
                        <td><strong>{h.percentage}%</strong></td>
                        <td><Pill tone={h.passed ? "green" : "amber"}>{h.passed ? "O‘tdi" : "Qayta mashq"}</Pill></td>
                        <td><Link to={"/practice/" + encodeURIComponent(h.card_slug)} className="btn secondary tiny">Qayta yechish</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : section === "group" ? (
          <div className="panel" style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: 24, display: "inline-flex", alignItems: "center", gap: 8 }}>
              <UserCheck size={22} /> Maktab / Markaz guruhiga ulanish
            </h1>
            <p className="muted" style={{ margin: 0 }}>
              Agar o‘qituvchingiz sizga shaxsiy o‘quvchi kodi (masalan, <strong>ST-12345</strong>) bergan bo‘lsa, uni kiriting — Bilim Coin do‘koni, kunlik questlar va guruh reytingingiz ochiladi.
            </p>
            <form onSubmit={openStudentCode} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input value={stCode} onChange={(e) => setStCode(e.target.value)} placeholder="ST-12345" style={{ flex: 1, minWidth: 180 }} />
              <button type="submit" className="btn primary">Guruh kabinetiga kirish →</button>
            </form>
          </div>
        ) : (
          /* DASHBOARD */
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="panel" style={{ background: "linear-gradient(135deg, #162d3d 0%, #0f3a36 100%)", color: "#fff", borderRadius: 22, padding: "24px 26px" }}>
              <span style={{ color: "#7cf2d2", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>SHAXSIY TAYYORGARLIK MARKAZI</span>
              <h1 style={{ margin: "6px 0 4px", color: "#fff" }}>Salom, {user?.display_name}!</h1>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", fontSize: 14.5 }}>
                Joriy tarif: <strong style={{ color: "#7cf2d2" }}>{plan?.name || "Bepul"}</strong> · Sotib olingan kitoblar: <strong>{paid_books.length}</strong> · Testlar: <strong>{paid_tests.length}</strong> · O‘rtacha ball: <strong>{avgPct}%</strong>
              </p>
            </div>

            <div className="cards-grid">
              <Link to="/practice" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill tone="green"><ClipboardCheck size={13} /> TESTLAR</Pill>
                <h3 style={{ margin: 0 }}>IELTS / DTM va mashq testlari</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Barcha fanlar bo‘yicha test yeching va xatolaringizni tahlil qiling.</p>
              </Link>
              <Link to="/library" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill tone="blue"><BookOpen size={13} /> KUTUBXONA</Pill>
                <h3 style={{ margin: 0 }}>Elektron kitoblar va qo‘llanmalar</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Bepul va pullik darsliklarni bir joyda o‘qing.</p>
              </Link>
              <Link to="/chat" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill tone="green"><MessageCircle size={13} /> CHAT</Pill>
                <h3 style={{ margin: 0 }}>O‘quvchilar hamjamiyati</h3>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Savol-javoblar va muhokamalar.</p>
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
