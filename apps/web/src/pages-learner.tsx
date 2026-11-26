import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Crown,
  Gamepad2,
  GraduationCap,
  LogOut,
  MessageCircle,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Pill, useData, useToast } from "./ui";

export function LearnerCabinetPage() {
  const data = useData("/api/v2/auth/learner-hub");
  const navigate = useNavigate();
  const toast = useToast();
  const [stCode, setStCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (data.loading) return <Busy />;
  if (data.error) {
    const err: any = data.error;
    if (err?.status === 401 || err?.status === 403) {
      return <Navigate to="/login" replace />;
    }
    return <div className="exam-join"><ErrorBox error={data.error} retry={data.reload} /></div>;
  }

  const { user, plan, has_pro_access, paid_books = [], paid_tests = [] } = data.data;

  function openStudentCode(e: FormEvent) {
    e.preventDefault();
    const cleaned = stCode.trim();
    if (!cleaned) return;
    navigate("/student/" + encodeURIComponent(cleaned));
  }

  async function switchToTeacher() {
    setBusy(true);
    try {
      await api("/api/v2/auth/account-type", { method: "POST", data: { account_type: "teacher" } });
      toast("O‘qituvchi studiosiga o‘tildi!");
      navigate("/studio");
    } catch (e: any) {
      toast(e?.message || "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api("/api/v2/auth/logout", { method: "POST", data: {} });
      navigate("/");
    } catch {}
  }

  return (
    <div className="exam-join" style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 64px" }}>
      <div className="panel" style={{ background: "linear-gradient(135deg, #162d3d 0%, #0f3a36 100%)", color: "#fff", borderRadius: 24, padding: "26px 28px", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#7cf2d2" }}>
              <GraduationCap size={15} /> O‘QUVCHI VA ABITURIYENT KABINETI
            </span>
            <h1 style={{ margin: "6px 0 4px", color: "#fff", fontSize: "clamp(24px, 3vw, 32px)" }}>
              Xush kelibsiz, {user?.display_name || "Abituriyent"}!
            </h1>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.78)", fontSize: 14.5 }}>
              {user?.email} · Tarif: <strong style={{ color: "#7cf2d2" }}>{plan?.name || "Start (Bepul)"}</strong>
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!has_pro_access && (
              <Link to="/studio/billing" className="btn primary" style={{ background: "#7cf2d2", color: "#0b241d" }}>
                <Crown size={15} /> Obuna bilan hammasini ochish
              </Link>
            )}
            <button type="button" className="btn secondary" style={{ background: "rgba(255,255,255,0.12)", color: "#fff", borderColor: "rgba(255,255,255,0.2)" }} disabled={busy} onClick={switchToTeacher}>
              O‘qituvchi rejimi
            </button>
            <button type="button" className="btn secondary" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.22)" }} onClick={logout}>
              <LogOut size={15} /> Chiqish
            </button>
          </div>
        </div>
      </div>

      {/* Tezkor tayyorgarlik bo‘limlari */}
      <div className="cards-grid" style={{ marginBottom: 24 }}>
        <Link to="/practice" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
          <Pill tone="green"><ClipboardCheck size={13} /> TESTLAR</Pill>
          <h3 style={{ margin: 0 }}>Ochiq va IELTS / DTM testlari</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Fanlar bo‘yicha mashq qiling, vaqt nazoratida ishlang va natijangizni tahlil qiling.</p>
          <span style={{ color: "#0c8066", fontWeight: 700, fontSize: 13.5, marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>Testlarga o‘tish <ArrowRight size={14} /></span>
        </Link>
        <Link to="/library" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
          <Pill tone="blue"><BookOpen size={13} /> KUTUBXONA</Pill>
          <h3 style={{ margin: 0 }}>Darsliklar va qo‘llanmalar</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Bepul va premium elektron kitoblar, IELTS qo‘llanmalar va PDF materiallar.</p>
          <span style={{ color: "#0c8066", fontWeight: 700, fontSize: 13.5, marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>Kutubxonani ochish <ArrowRight size={14} /></span>
        </Link>
        <Link to="/games" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
          <Pill tone="amber"><Gamepad2 size={13} /> O‘YINLAR</Pill>
          <h3 style={{ margin: 0 }}>Bilim o‘yinlari markazi</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Tezkor fikrlash va mantiqiy mashqlar bilan bilimingizni mustahkamlang.</p>
          <span style={{ color: "#0c8066", fontWeight: 700, fontSize: 13.5, marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>O‘ynash <ArrowRight size={14} /></span>
        </Link>
        <Link to="/chat" className="panel" style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 8 }}>
          <Pill tone="green"><MessageCircle size={13} /> HAMJAMIYAT</Pill>
          <h3 style={{ margin: 0 }}>Jonli o‘quvchilar chati</h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Savol-javoblar, muhokamalar va tengdoshlar bilan fikr almashish.</p>
          <span style={{ color: "#0c8066", fontWeight: 700, fontSize: 13.5, marginTop: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>Chatga kirish <ArrowRight size={14} /></span>
        </Link>
      </div>

      {/* Mening sotib olgan kitoblarim va testlarim */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 20, marginBottom: 24 }}>
        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>📚 Mening kitoblarim ({paid_books.length})</h2>
            {has_pro_access && <Pill tone="green"><Sparkles size={12} /> Barcha pullik kitoblar ochiq</Pill>}
          </div>
          {!paid_books.length ? (
            <Empty
              title={has_pro_access ? "Obunangiz faol — hamma kitoblar ochiq!" : "Hali sotib olingan kitob yo‘q"}
              text={has_pro_access ? "Kutubxonadagi istalgan pullik qo‘llanmani bepul o‘qishingiz mumkin." : "Kutubxonadan kerakli kitobni tanlab alohida sotib oling yoki obuna orqali hammasini oching."}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {paid_books.map((b: any) => (
                <Link key={b.id} to={"/library/" + encodeURIComponent(b.id)} className="panel" style={{ padding: 12, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <strong>{b.title}</strong>
                    <div className="muted" style={{ fontSize: 12.5 }}>{b.subject}</div>
                  </div>
                  <span style={{ color: "#0c8066", fontWeight: 700, fontSize: 13 }}>O‘qish →</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 19 }}>🎯 Mening pullik testlarim ({paid_tests.length})</h2>
            {has_pro_access && <Pill tone="green"><Sparkles size={12} /> Barcha testlar ochiq</Pill>}
          </div>
          {!paid_tests.length ? (
            <Empty
              title={has_pro_access ? "Obunangiz faol — hamma testlar ochiq!" : "Hali sotib olingan test yo‘q"}
              text={has_pro_access ? "Ochiq testlar bo‘limidagi barcha IELTS/DTM testlarni bemalol yechishingiz mumkin." : "Pullik IELTS yoki DTM testlarini sotib olsangiz, ular doimiy shu yerda saqlanadi."}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {paid_tests.map((t: any) => (
                <Link key={t.id} to={"/practice/" + encodeURIComponent(t.slug)} className="panel" style={{ padding: 12, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <strong>{t.title}</strong>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t.slug}</div>
                  </div>
                  <span style={{ color: "#0c8066", fontWeight: 700, fontSize: 13 }}>Yechish →</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Maktab / o‘quv markaz kodi (ST-...) ulash */}
      <div className="panel" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div>
          <h3 style={{ margin: "0 0 4px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <UserCheck size={17} /> O‘qituvchingiz bergan guruh kodingiz bormi?
          </h3>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            Maktab yoki o‘quv markaz kodingiz (ST-...) ni kiritsangiz, Bilim Coin do‘koni, kunlik questlar va guruh reytingiga o‘tasiz.
          </p>
        </div>
        <form onSubmit={openStudentCode} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={stCode}
            onChange={(e) => setStCode(e.target.value)}
            placeholder="Masalan: ST-12345"
            style={{ width: 170 }}
          />
          <button type="submit" className="btn primary">Guruh kabineti →</button>
        </form>
      </div>
    </div>
  );
}
