import { Link } from "react-router-dom";
import {
  ArrowLeft,
  GraduationCap,
  Presentation,
  ShieldCheck,
} from "lucide-react";
import { Busy, Pill, useData } from "./ui";
import { TeacherBillingPage } from "./pages-billing";
import { LearnerBillingStandalone } from "./pages-learner";

export function StandalonePricingPage() {
  const me = useData("/api/v2/auth/me");
  const user = me.data?.user;
  const isLoggedIn = !me.loading && !me.error && !!user;
  const isLearner = isLoggedIn && user.account_type === "learner";
  const isTeacher = isLoggedIn && user.account_type !== "learner";
  const backPath = isLearner ? "/learner" : isTeacher ? "/studio" : "/";

  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f8", padding: "24px 16px 64px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <Link to={backPath} className="btn secondary tiny" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowLeft size={15} /> {isLoggedIn ? "Kabinetga qaytish" : "Bosh sahifa"}
          </Link>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", color: "#11191e", fontWeight: 800, fontSize: 17 }}>
            <img src="/logo.png" alt="Bilim UZ" style={{ width: 32, height: 32, borderRadius: 8 }} />
            Bilim UZ
          </Link>
          <div style={{ minWidth: 110, textAlign: "right" }}>
            {isLoggedIn ? (
              <Pill tone="green">{isLearner ? <><GraduationCap size={13} color="#0c8066" /> Abituriyent</> : <><Presentation size={13} color="#162d3d" /> O‘qituvchi</>}</Pill>
            ) : (
              <Link to="/login" className="btn primary tiny">Kirish</Link>
            )}
          </div>
        </header>

        {me.loading ? (
          <Busy />
        ) : isLearner ? (
          <LearnerBillingStandalone />
        ) : isTeacher ? (
          <TeacherBillingPage />
        ) : (
          <div className="panel" style={{ maxWidth: 620, margin: "40px auto", textAlign: "center", padding: "36px 26px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Pill tone="green"><ShieldCheck size={14} /> SHAXSIY TARIFLAR</Pill>
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 32px)" }}>Tariflarni ko‘rish uchun tizimga kiring</h1>
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>
              <strong>O‘qituvchilar</strong> va <strong>O‘quvchi / Abituriyentlar</strong> uchun tariflar alohida tuzilgan. O‘z rolingiz bilan ro‘yxatdan o‘ting yoki kiring — sizga faqat o‘zingizga mos tariflar ko‘rsatiladi.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
              <Link to="/register" className="btn primary">
                <GraduationCap size={16} /> Ro‘yxatdan o‘tish
              </Link>
              <Link to="/login" className="btn secondary">
                Kirish
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
