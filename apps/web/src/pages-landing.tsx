import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  ClipboardList,
  Coins,
  FileText,
  Gamepad2,
  GraduationCap,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useConfig } from "./main";
import { DynamicLandingShowcase } from "./pages-landing-dynamic";

function LandingBrand() {
  return (
    <Link to="/" className="lp-brand">
      <img src="/logo.png" alt="Bilim UZ" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      <div>
        <strong>Bilim <span>UZ</span></strong>
        <small>O‘QITISH. BAHOLASH. RIVOJLANISH.</small>
      </div>
    </Link>
  );
}

export function LandingPage() {
  const cfg = useConfig();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [footerSlug, setFooterSlug] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cabinetPath, setCabinetPath] = useState("/studio");
  useEffect(() => {
    fetch("/api/v2/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        const u = d?.user;
        if (!u) return;
        setCabinetPath(u.scope === "owner" ? "/owner" : u.account_type === "learner" ? "/learner" : "/studio");
      })
      .catch(() => {});
  }, []);
  const [spotRole, setSpotRole] = useState<"teacher" | "student" | "parent">("teacher");

  function goToTest(raw: string) {
    const cleaned = raw.trim();
    if (!cleaned) return;
    const m = /^([A-Za-z]{2})[\s-]?(\d{5})$/.exec(cleaned);
    navigate("/t/" + encodeURIComponent(m ? `${m[1].toUpperCase()}-${m[2]}` : cleaned));
  }

  function onHeroSubmit(e: FormEvent) {
    e.preventDefault();
    goToTest(slug);
  }

  function onFooterSubmit(e: FormEvent) {
    e.preventDefault();
    goToTest(footerSlug);
  }

  const spotlightData = {
    teacher: {
      badge: "O‘QITUVCHILAR UCHUN",
      title: "Dars va baholash jarayonini 10 baravar tezlashtiring.",
      text: "Excel va Word fayllardan 1 bosishda test hamda kitob yuklang, 1–4 variantli oflayn A4 PDF chiqaring, kurs jurnalini yuriting va har bir o‘quvchining o‘sishini aniq tahlil qiling.",
      cta: "O‘qituvchi kabinetiga o‘tish",
      to: "/studio",
      stats: [
        ["1 bosishda", "Excel import & A4 PDF"],
        ["Anti-Cheat", "Adolatli nazorat tizimi"],
        ["QR Sertifikat", "Avtomatik PDF guvohnoma"],
      ],
    },
    student: {
      badge: "O‘QUVCHILAR UCHUN",
      title: "O‘qishni qiziqarli musobaqa va o‘yinga aylantiring.",
      text: "Shaxsiy kodingiz bilan kiring: kunlik questlar bajaring, test va vazifalardan Bilim Coin to‘plang, profilingizga banner va ramkalar sotib oling hamda guruh reytingida yetakchi bo‘ling.",
      cta: "O‘quvchi kabinetiga kirish",
      to: "/student",
      stats: [
        ["Bilim Coin", "Banner, ramka va avatarlar"],
        ["Kunlik Quest", "Har kuni yangi topshiriq"],
        ["Top-10 Reyting", "Guruh va sinf bellashuvi"],
      ],
    },
    parent: {
      badge: "OTA-ONALAR UCHUN",
      title: "Farzandingiz natijasi va davomatini istalgan payt kuzating.",
      text: "Ro‘yxatdan o‘tishsiz, faqat o‘quvchi kodi orqali darsga qatnashish, uyga vazifalar, test ballari hamda rasmiy QR-kodli sertifikatlarni bir oynada ko‘rib boring.",
      cta: "Ota-ona kabinetini ochish",
      to: "/parent",
      stats: [
        ["Shaffof davomat", "Har bir dars tarixi"],
        ["Test tahlili", "Aniq foiz va ballar"],
        ["1 bosishda PDF", "Sertifikatni yuklab olish"],
      ],
    },
  }[spotRole];

  return (
    <div className="lp-wrap lp-3screen">
      {/* ==================== 1-SAHIFA: HERO + HAMKORLAR ==================== */}
      <div className="lp-screen lp-screen-1">
        <div className="lp-screen-inner">
        {/* 1. CLEAN TOP DOCK NAVIGATION */}
        <header className="lp-header">
          <LandingBrand />

          <nav className="lp-nav">
            <Link to="/student">O‘quvchi kabineti</Link>
            {cfg.parent_enabled && <Link to="/parent">Ota-ona</Link>}
            {cfg.assignments_enabled && <Link to="/vazifalar">Vazifalar</Link>}
            {cfg.chat_enabled && <Link to="/chat">Chat</Link>}
            {cfg.library_enabled && <Link to="/library">Kutubxona</Link>}
            {cfg.store_enabled && <Link to="/store">Savollar do‘koni</Link>}
          </nav>

          <div className="lp-header-right">
            <Link to="/pricing" className="lp-pill-outline sm" style={{ borderColor: "#0c8066", color: "#0c8066" }}>
              <Zap size={14} color="#0c8066" /> Upgrade
            </Link>
            <Link to={cabinetPath} className="lp-pill-cta">
              Kabinetim <ArrowRight size={15} />
            </Link>
            <button
              type="button"
              className="lp-burger"
              aria-label="Menyu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="lp-mobile-nav">
            <Link to="/student" onClick={() => setMenuOpen(false)}>O‘quvchi kabineti</Link>
            {cfg.parent_enabled && <Link to="/parent" onClick={() => setMenuOpen(false)}>Ota-ona kabineti</Link>}
            {cfg.assignments_enabled && <Link to="/vazifalar" onClick={() => setMenuOpen(false)}>Vazifalar</Link>}
            {cfg.chat_enabled && <Link to="/chat" onClick={() => setMenuOpen(false)}>Jonli chat</Link>}
            {cfg.library_enabled && <Link to="/library" onClick={() => setMenuOpen(false)}>Kutubxona</Link>}
            {cfg.store_enabled && <Link to="/store" onClick={() => setMenuOpen(false)}>Savollar do‘koni</Link>}
            <Link to={cabinetPath} className="lp-pill-cta" onClick={() => setMenuOpen(false)}>
              Kabinetim <ArrowRight size={15} />
            </Link>
          </div>
        )}

        {/* 2. EDITORIAL SPLIT HERO */}
        <section className="lp-hero">
          <div className="lp-hero-left">
            <span className="lp-eyebrow">
              <span className="lp-eyebrow-dot" /> ZAMONAVIY TA’LIM EKOTIZIMI · BILIM UZ
            </span>
            <h1 className="lp-hero-title">
              Bilimni baholang.
              <br />
              <span>Imkoniyatni oching.</span>
            </h1>
            <p className="lp-hero-desc">
              Onlayn va oflayn testlar, kurs jurnali, raqamli kutubxona, jonli sinf chati va
              o‘quvchilarning interaktiv profili — barchasi bitta tezkor va tartibli platformada.
            </p>
            <div className="lp-hero-actions">
              <Link to="/studio" className="lp-pill-cta lg">
                Bepul boshlash <ArrowRight size={16} />
              </Link>
              {cfg.practice_enabled && (
                <Link to="/practice" className="lp-pill-outline lg">
                  Ochiq testlar
                </Link>
              )}
            </div>

            <div className="lp-trust-strip">
              <span><ShieldCheck size={15} /> Anti-cheat nazorat</span>
              <span><FileText size={15} /> Excel &amp; Word import</span>
              <span><Award size={15} /> QR-kodli PDF sertifikat</span>
            </div>
          </div>

          {/* RIGHT HERO: CLEAN TEST-CODE-ONLY CARD WITH FLOATING ORBS */}
          <div className="lp-hero-right">
            <div className="lp-hero-aura" aria-hidden="true" />
            <span className="lp-float-orb orb-1" aria-hidden="true"><Sparkles size={15} /></span>
            <span className="lp-float-orb orb-2" aria-hidden="true"><ShieldCheck size={15} /></span>
            <span className="lp-float-chip chip-1" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Award size={15} color="#d97706" /> QR Sertifikat</span>
            <span className="lp-float-chip chip-2">⚡ Tezkor tahlil</span>

            <div className="lp-test-card">
              <div className="lp-test-card-head">
                <span className="lp-test-icon">
                  <ClipboardList size={24} />
                </span>
                <div>
                  <small>IMTIHONGA KIRISH</small>
                  <h2>Testga tayyormisiz?</h2>
                </div>
              </div>
              <p className="lp-test-sub">
                O‘qituvchingiz bergan test kodini kiriting va sinovni boshlang.
              </p>
              <form onSubmit={onHeroSubmit} className="lp-test-form">
                <label>
                  <span>Test kodi</span>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="Masalan: KP-48291"
                    required
                    maxLength={80}
                  />
                </label>
                <button type="submit" className="lp-pill-cta full">
                  Testga kirish <ArrowRight size={16} />
                </button>
              </form>
              <small className="lp-test-foot">
                Test muddati, vaqt chegarasi va qoidalari kirishda ko‘rsatiladi.
              </small>
            </div>
          </div>
        </section>

        </div>
      </div>

      {/* ==================== 2-SAHIFA: BENTO + SPOTLIGHT ==================== */}
      <div className="lp-screen lp-screen-2">
        <div className="lp-screen-inner">
          <div className="lp-section-head">
            <span className="lp-eyebrow"><span className="lp-eyebrow-dot" /> IMKONIYATLAR</span>
            <h2>Barcha ta’lim vositalari — bir joyda</h2>
          </div>
        {/* 3. BENTO SHOWCASE ROW (2 Large White Cards + 8-Tile Dynamic Mosaic) */}
        <section className="lp-bento-row">
          <div className="lp-bento-card">
            <span className="lp-bento-ico"><GraduationCap size={20} /></span>
            <h3>O‘qituvchi Studiosi</h3>
            <p>
              Shaxsiy savollar bazasi, Excel’dan tayyor import, 1–4 variantli oflayn A4 test
              varaqasi, elektron jurnal va avtomatik analitika.
            </p>
            <Link to="/studio" className="lp-pill-outline sm">
              Studioni ochish
            </Link>
          </div>

          <div className="lp-bento-card">
            <span className="lp-bento-ico"><Coins size={20} /></span>
            <h3>O‘quvchi Profili &amp; Do‘kon</h3>
            <p>
              Test va vazifalardan Bilim Coin yig‘ing, kunlik questlarni bajaring, banner va
              ramkalar sotib oling hamda Top-10 reytingda bellashing.
            </p>
            <Link to="/student" className="lp-pill-outline sm">
              Profilga kirish
            </Link>
          </div>

          <div className="lp-mosaic">
            <Link to="/practice" className="lp-tile is-navy">
              <ShieldCheck size={20} />
              <strong>Anti-Cheat</strong>
              <small>Adolatli imtihon</small>
            </Link>
            <Link to="/studio" className="lp-tile is-slate">
              <FileText size={20} />
              <strong>A4 PDF</strong>
              <small>1–4 variant + kalit</small>
            </Link>
            <Link to="/parent" className="lp-tile is-light">
              <Award size={20} />
              <strong>QR Sertifikat</strong>
              <small>Rasmiy tekshiruv</small>
            </Link>
            <Link to="/student" className="lp-tile is-light">
              <Coins size={20} />
              <strong>Bilim Coin</strong>
              <small>Do‘kon &amp; Quest</small>
            </Link>
            <Link to={cfg.library_enabled ? "/library" : "/"} className="lp-tile is-soft">
              <BookOpen size={20} />
              <strong>Kutubxona</strong>
              <small>Word &amp; PDF kitob</small>
            </Link>
            <Link to={cfg.chat_enabled ? "/chat" : "/"} className="lp-tile is-light">
              <MessageCircle size={20} />
              <strong>Jonli Chat</strong>
              <small>Sinf guruhlari</small>
            </Link>
            <Link to="/studio" className="lp-tile is-mint">
              <BarChart3 size={20} />
              <strong>Kurs jurnali</strong>
              <small>Davomat &amp; Baho</small>
            </Link>
            <Link to="/student" className="lp-tile is-cosmic">
              <Gamepad2 size={20} />
              <strong>O‘yinlar</strong>
              <small>Bilim bellashuvi</small>
            </Link>
          </div>
        </section>

        {/* 4. SPLIT SPOTLIGHT + ANDROID APK SECTION */}
        <section className="lp-spotlight-row">
          <div className="lp-spot-visual">
            <div className="lp-spot-dark">
              <span className="lp-spot-eyebrow">{spotlightData.badge}</span>
              <h3>Bilim UZ bilan ta’lim yangi bosqichda</h3>
              <div className="lp-spot-stats">
                {spotlightData.stats.map(([k, v]) => (
                  <div key={k}>
                    <strong>{k}</strong>
                    <small>{v}</small>
                  </div>
                ))}
              </div>
              <Link to={spotlightData.to} className="lp-spot-pill">
                {spotlightData.cta} →
              </Link>
            </div>

            {cfg.apk_enabled && !/BilimUZApp/i.test(navigator.userAgent) ? (
              <a
                href="/api/v2/app/bilimuz.apk"
                download="BilimUZ.apk"
                className="lp-spot-apk"
              >
                <span className="lp-apk-badge">ANDROID ILOVA · BEPUL</span>
                <div className="lp-apk-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
                    <path d="M17.523 15.341a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7m-11.046 0a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7m11.405-6.02 1.9-3.29a.4.4 0 0 0-.146-.546.4.4 0 0 0-.546.146l-1.924 3.332A11.77 11.77 0 0 0 12 7.82a11.77 11.77 0 0 0-5.266 1.143L4.81 5.631a.4.4 0 0 0-.546-.146.4.4 0 0 0-.146.546l1.9 3.29C2.735 11.095.5 14.374.5 18.25h23c0-3.876-2.235-7.155-5.618-8.929" />
                  </svg>
                </div>
                <strong>Bilim UZ APK</strong>
                <small>~2.2 MB · 1 bosishda o‘rnatish</small>
                <span className="lp-apk-btn">
                  <ArrowDownToLine size={15} /> Yuklab olish
                </span>
              </a>
            ) : (
              <div className="lp-spot-apk is-static">
                <span className="lp-apk-badge">HAR QANDAY QURILMADA</span>
                <Users size={34} style={{ color: "#162d3d" }} />
                <strong>Telefon &amp; Kompyuter</strong>
                <small>O‘qituvchi, o‘quvchi va ota-onalar uchun moslashuvchan tizim</small>
              </div>
            )}
          </div>

          <div className="lp-spot-copy">
            <h2>{spotlightData.title}</h2>
            <p>{spotlightData.text}</p>
            <div className="lp-role-pills">
              <button
                type="button"
                className={spotRole === "teacher" ? "lp-role-btn is-active" : "lp-role-btn"}
                onClick={() => setSpotRole("teacher")}
              >
                O‘qituvchi
              </button>
              <button
                type="button"
                className={spotRole === "student" ? "lp-role-btn is-active" : "lp-role-btn"}
                onClick={() => setSpotRole("student")}
              >
                O‘quvchi
              </button>
              <button
                type="button"
                className={spotRole === "parent" ? "lp-role-btn is-active" : "lp-role-btn"}
                onClick={() => setSpotRole("parent")}
              >
                Ota-ona
              </button>
            </div>
          </div>
        </section>

        </div>
      </div>

      <DynamicLandingShowcase />

      {/* ==================== 3-SAHIFA: YAKUNIY CTA + FOOTER ==================== */}
      <div className="lp-screen lp-screen-3">
        <div className="lp-screen-inner">
          <div className="lp-final-cta">
            <span className="lp-eyebrow" style={{ color: "#7ce0bc" }}>
              <span className="lp-eyebrow-dot" style={{ background: "#7ce0bc" }} /> BEPUL BOSHLANG
            </span>
            <h2>Sinfingizni bugunoq raqamli bosqichga olib chiqing</h2>
            <p>
              Ro‘yxatdan o‘tish 1 daqiqa oladi. O‘qituvchi studiosi, o‘quvchi kabineti, jonli chat va QR-kodli sertifikatlar — barchasi tayyor.
            </p>
            <div className="lp-hero-actions" style={{ justifyContent: "center" }}>
              <Link to="/studio" className="lp-spot-pill" style={{ padding: "12px 26px", fontSize: 14 }}>
                O‘qituvchi sifatida kirish →
              </Link>
              <Link to="/student" className="lp-pill-outline lg" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}>
                O‘quvchi kabineti
              </Link>
            </div>
            <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
              <span className="lp-partners-label" style={{ display: "block", marginBottom: 10 }}>PLATFORMANI QO‘LLAB-QUVVATLOVCHI HAMKORLAR</span>
              <div className="lp-partners-list" style={{ justifyContent: "center" }}>
                <span><strong>SysOne</strong> Studio</span>
                <span><strong>Kelajak</strong> Dasturchilari</span>
                <span><strong>Bilim UZ</strong> Hamjamiyati</span>
                <span><strong>Cloudflare</strong> Edge</span>
                <span><strong>Firebase</strong> Realtime</span>
                <span><strong>O‘zbekiston</strong> Ustozlari</span>
              </div>
            </div>
          </div>
        {/* 5. ROUNDED MULTI-COLUMN FOOTER (Matching Reference Layout) */}
        <footer className="lp-footer-card">
          <div className="lp-footer-grid">
            <div className="lp-footer-col">
              <LandingBrand />
              <p className="lp-footer-about">
                Maktablar, o‘quv markazlari va mustaqil ustozlar uchun zamonaviy baholash,
                raqamli kutubxona va o‘quvchi motivatsiyasi platformasi.
              </p>
            </div>

            <div className="lp-footer-col">
              <h4>Platforma</h4>
              {cfg.practice_enabled && <Link to="/practice">Ochiq mashq testlari</Link>}
              {cfg.library_enabled && <Link to="/library">Raqamli kutubxona</Link>}
              {cfg.store_enabled && <Link to="/store">Savollar do‘koni</Link>}
              {cfg.chat_enabled && <Link to="/chat">Jonli guruh chati</Link>}
            </div>

            <div className="lp-footer-col">
              <h4>Kabinetlar</h4>
              <Link to="/studio">O‘qituvchi studiosi</Link>
              <Link to="/student">O‘quvchi kabineti</Link>
              {cfg.parent_enabled && <Link to="/parent">Ota-ona kabineti</Link>}
              {cfg.assignments_enabled && <Link to="/vazifalar">Uyga vazifalar</Link>}
            </div>

            <div className="lp-footer-col">
              <h4>Tezkor testga kirish</h4>
              <form onSubmit={onFooterSubmit} className="lp-footer-form">
                <input
                  value={footerSlug}
                  onChange={(e) => setFooterSlug(e.target.value)}
                  placeholder="Test kodi (KP-48291)"
                  maxLength={80}
                />
                <div className="lp-footer-form-row">
                  <Link to={cabinetPath} className="lp-pill-outline sm">Kirish</Link>
                  <button type="submit" className="lp-pill-cta sm">Boshlash</button>
                </div>
              </form>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <div className="lp-footer-legal">
              <Link to="/privacy">Maxfiylik va foydalanish qoidalari</Link>
              <span>·</span>
              <span>Powered by <strong>SysOne</strong></span>
            </div>
            <Link to="/owner/login" className="lp-owner-link">Owner kirishi</Link>
          </div>
        </footer>
        </div>
      </div>
    </div>
  );
}
