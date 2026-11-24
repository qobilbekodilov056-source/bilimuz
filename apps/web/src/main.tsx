import React, { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BookMarked,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Grid2X2,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import { Busy, ErrorBox, ToastProvider, useData } from "./ui";
import { AuthPage, TokenPage } from "./pages-auth";
import {
  Dashboard,
  Questions,
  GroupsStudents,
  Cards,
  Analytics,
  ImportPage,
  StorePage,
  SupportPage,
  SettingsPage,
  JournalPage,
} from "./pages-teacher";
import { ExamPage, PracticeCatalog, PracticeExam } from "./pages-exam";
import { LibraryCatalog, LibraryBookReader, LibraryStudio } from "./pages-library";
import { GamesCatalogPage, GamePlayPage } from "./pages-games";
import { StudentAssignmentsPage, TeacherAssignmentsPage } from "./pages-assignments";
import { StudentCabinetPage } from "./pages-student-hub";
import { ParentPortal } from "./pages-parent";
import { OwnerPage } from "./pages-owner";
import "./style.css";
const DEFAULT_FLAGS = {
  store_enabled: true,
  games_enabled: true,
  library_enabled: true,
  assignments_enabled: true,
  journal_enabled: true,
  parent_enabled: true,
  practice_enabled: true,
  apk_enabled: true,
};
export const ConfigContext = createContext<typeof DEFAULT_FLAGS>(DEFAULT_FLAGS);
export const useConfig = () => useContext(ConfigContext);

function FeatureGate({ enabled, title, children }: { enabled: boolean; title: string; children: any }) {
  if (enabled) return children;
  return (
    <div className="policy-page" style={{ textAlign: "center", padding: "64px 20px" }}>
      <h1>{title} vaqtincha yopiq</h1>
      <p className="muted">Ushbu bo‘lim platforma administratori tomonidan vaqtincha o‘chirib qo‘yilgan.</p>
      <Link to="/" className="btn primary" style={{ marginTop: 14, display: "inline-flex" }}>
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
}

export const AccountContext = createContext<any>(null);
export const useAccount = () => useContext(AccountContext);
const nav = [
  ["", "Boshqaruv", Grid2X2],
  ["questions", "Savollar bazasi", BookOpen],
  ["imports", "Import markazi", ArrowDownToLine],
  ["cards", "Test kartalari", ClipboardList],
  ["groups", "Guruhlar", FolderOpen],
  ["students", "O‘quvchilar", Users],
  ["journal", "Kurs jurnali", CalendarDays],
  ["assignments", "Vazifalar", ClipboardList],
  ["library", "Kutubxona", BookMarked],
  ["analytics", "Analitika", BarChart3],
  ["store", "Savollar do‘koni", Store],
] as const;
function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link className={"brand " + (inverse ? "inverse" : "")} to="/">
      <img className="brand-logo" src="/logo.png" alt="Bilim UZ" />
      <span>
        Bilim <b>UZ</b>
        <small>O‘QITISH. BAHOLASH. RIVOJLANISH.</small>
      </span>
    </Link>
  );
}
function StudioShell() {
  const cfg = useConfig();
  const account = useData("/api/v2/auth/me");
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState("");
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLButtonElement>(".dock .mobile-only")?.focus();
    return () => previous?.focus();
  }, [open]);
  if (account.loading) return <Busy />;
  if (account.error) {
    if ((account.error as any).status === 401)
      return <Navigate to="/login" replace />;
    return <ErrorBox error={account.error} retry={account.reload} />;
  }
  if (account.data?.user.scope !== "teacher")
    return <Navigate to="/owner" replace />;
  const current = nav.find(
    (x) => location.pathname === "/studio" + (x[0] ? "/" + x[0] : ""),
  );
  const title =
    current?.[1] ||
    (location.pathname.endsWith("support") ? "Bilim UZ Support" : "Sozlamalar");
  async function logout() {
    await api("/api/v2/auth/logout", { method: "POST", data: {} });
    navigate("/login");
  }
  return (
    <AccountContext.Provider
      value={{ ...account.data, reload: account.reload }}
    >
      <a className="skip-link" href="#main-content">
        Asosiy mazmunga o‘tish
      </a>
      <div
        className={"drawer-backdrop " + (open ? "visible" : "")}
        onClick={() => setOpen(false)}
      />
      <aside
        className={"dock " + (open ? "open" : "")}
        aria-label="Asosiy navigatsiya"
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (e.key === "Tab") {
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>(
                "a[href],button:not([disabled])",
              ),
            );
            const first = items[0],
              last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="dock-brand">
          <Brand inverse />
          <button
            className="icon-btn mobile-only"
            aria-label="Menyuni yopish"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <Link
          className="support-cta"
          to="/studio/support"
          onClick={() => setOpen(false)}
        >
          <LifeBuoy size={18} />
          <span>
            Bilim UZ Support<small>Yordam doim yoningizda</small>
          </span>
          <ChevronRight size={15} />
        </Link>
        <div className="nav-caption">ISH MAYDONI</div>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={"/studio" + (path ? "/" + path : "")}
              end={!path}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path === "imports" && <small>UZ</small>}
            </NavLink>
          ))}
        </nav>
        <div className="dock-bottom">
          <NavLink to="/studio/settings" onClick={() => setOpen(false)}>
            <Settings size={19} />
            Sozlamalar
          </NavLink>
          <button onClick={() => void logout()}>
            <LogOut size={19} />
            Chiqish
          </button>
          <div className="dock-profile">
            <span className="avatar">{account.data.user.display_name[0]}</span>
            <span>
              <strong>{account.data.user.display_name}</strong>
              <small>Shaxsiy workspace</small>
            </span>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      <div className="studio">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-only"
              aria-label="Menyuni ochish"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="header-tools">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate("/studio/questions?q=" + encodeURIComponent(search));
              }}
            >
              <Search size={17} />
              <input
                aria-label="Savollarni qidirish"
                placeholder="Savol qidirish…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <kbd>↵</kbd>
            </form>
            <Link
              to="/studio/support"
              className="icon-btn"
              aria-label="Murojaatlar va javoblar"
            >
              <Bell size={20} />
            </Link>
            <Link to="/studio/settings" className="workspace-selector">
              <span className="avatar mini">
                {account.data.user.display_name[0]}
              </span>
              <span>{account.data.tenant.name}</span>
              <ChevronDown size={14} />
            </Link>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <MaintenanceBanner />
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>Bilim UZ · Powered by SysOne</span>
          <span>
            <ShieldCheck size={13} />
            Ma’lumotlaringiz shaxsiy workspace ichida
          </span>
          <Link to="/privacy">Maxfiylik</Link>
        </footer>
      </div>
    </AccountContext.Provider>
  );
}
function MaintenanceBanner() {
  const config = useData("/api/v2/config");
  return config.data?.maintenance ? (
    <div className="notice" role="status">
      {config.data.maintenance}
    </div>
  ) : null;
}
function Home() {
  const [slug, setSlug] = useState("");
  const cfg = useConfig();
  const [entryMode, setEntryMode] = useState<"test" | "hw" | "parent">("test");
  const me = useData("/api/v2/auth/me");
  const loggedUser = me.data?.user;
  const cabinetPath = loggedUser?.scope === "owner" ? "/owner" : "/studio";
  const navigate = useNavigate();
  return (
    <div className="public-page">
      <header className="public-header">
        <Brand />
        <nav>
          {cfg.parent_enabled && <Link to="/parent">Ota-ona kabineti</Link>}
          <Link to="/student">O‘quvchi kabineti</Link>
          {cfg.assignments_enabled && <Link to="/vazifalar">Vazifalar</Link>}
          {cfg.games_enabled && <Link to="/games">O‘yinlar</Link>}
          {cfg.library_enabled && <Link to="/library">Kutubxona</Link>}
          {cfg.store_enabled && <Link to="/store">Savollar do‘koni</Link>}
          {loggedUser ? (
            <Link className="btn primary" to={cabinetPath}>
              Kabinetim <ArrowRight size={16} />
            </Link>
          ) : (
            <Link className="btn secondary" to="/login">
              Kirish <ArrowRight size={16} />
            </Link>
          )}
        </nav>
      </header>
      <main className="landing">
        <div className="landing-copy">
          <span className="landing-label">
            <span />
            O‘QITUVCHILAR UCHUN SHAXSIY PLATFORMA
          </span>
          <h1>
            Bilimni baholang.
            <br />
            <em>Imkoniyatni oching.</em>
          </h1>
          <p>
            Savollaringiz, guruhlaringiz va natijalaringiz — barchasi o‘zingizga
            tegishli, bitta tartibli ish maydonida.
          </p>
          <div className="actions">
            {loggedUser ? (
              <Link to={cabinetPath} className="btn primary">
                Kabinetga o‘tish <ArrowRight size={18} />
              </Link>
            ) : (
              <Link to="/register" className="btn primary">
                Workspace yaratish <ArrowRight size={18} />
              </Link>
            )}
            {cfg.practice_enabled && (
              <Link to="/practice" className="btn secondary">
                Ochiq testlar
              </Link>
            )}
            {cfg.library_enabled && (
              <Link to="/library" className="btn secondary">
                Kutubxona
              </Link>
            )}
            {cfg.games_enabled && (
              <Link to="/games" className="btn secondary">
                O‘yinlar
              </Link>
            )}
            {cfg.store_enabled && (
              <Link to="/store" className="btn secondary">
                Savollarni ko‘rish
              </Link>
            )}

          </div>
          {cfg.apk_enabled && !/BilimUZApp/i.test(navigator.userAgent) && (
          <a
            href="/api/v2/app/bilimuz.apk"
            download="BilimUZ.apk"
            className="apk-download-card"
          >
            <span className="apk-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M17.523 15.341a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7m-11.046 0a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7m11.405-6.02 1.9-3.29a.4.4 0 0 0-.146-.546.4.4 0 0 0-.546.146l-1.924 3.332A11.77 11.77 0 0 0 12 7.82a11.77 11.77 0 0 0-5.266 1.143L4.81 5.631a.4.4 0 0 0-.546-.146.4.4 0 0 0-.146.546l1.9 3.29C2.735 11.095.5 14.374.5 18.25h23c0-3.876-2.235-7.155-5.618-8.929" />
              </svg>
            </span>
            <span className="apk-card-copy">
              <small>RASMIY ANDROID ILOVA · BEPUL</small>
              <strong>Bilim UZ mobil ilovasini yuklab olish</strong>
              <span>Android uchun APK · ~2.2 MB · 1 bosishda o‘rnatish</span>
            </span>
            <span className="apk-card-cta">
              <ArrowDownToLine size={16} />
              Yuklab olish
            </span>
          </a>
          )}
          <div className="landing-features">
            <span>
              <ShieldCheck />
              Shaxsiy savollar bazasi
            </span>
            <span>
              <ArrowDownToLine />
              O‘zbekcha Excel import
            </span>
            <span>
              <BarChart3 />
              Aniq test natijalari
            </span>
          </div>
        </div>
        <div className="join-card">
          <div className="join-icon">
            <ClipboardList size={30} />
          </div>
          <span className="eyebrow">O‘QUVCHI UCHUN</span>
          <h2>Testga tayyormisiz?</h2>
          <p>O‘qituvchingiz bergan test kodini kiriting.</p>
          <div className="tabs-bar" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={entryMode === "test" ? "btn primary tiny" : "btn secondary tiny"}
              onClick={() => {
                setEntryMode("test");
                setSlug("");
              }}
            >
              Testga kirish
            </button>
            <button
              type="button"
              className={entryMode === "hw" ? "btn primary tiny" : "btn secondary tiny"}
              onClick={() => {
                setEntryMode("hw");
                setSlug("");
              }}
            >
              O‘quvchi kabineti
            </button>
            <button
              type="button"
              className={entryMode === "parent" ? "btn primary tiny" : "btn secondary tiny"}
              onClick={() => {
                setEntryMode("parent");
                setSlug("");
              }}
            >
              Ota-ona / Natija
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (entryMode === "parent" || entryMode === "hw") {
                const cleaned = slug.trim().toUpperCase().replace(/[\s-]+/g, "");
                navigate((entryMode === "hw" ? "/student/" : "/parent/") + encodeURIComponent(cleaned));
              } else {
                const m = /^([A-Za-z]{2})[\s-]?(\d{5})$/.exec(slug.trim());
                navigate("/t/" + encodeURIComponent(m ? `${m[1].toUpperCase()}-${m[2]}` : slug.trim()));
              }
            }}
          >
            <label className="field">
              <span>{entryMode === "test" ? "Test kodi" : "O‘quvchi kodi"}</span>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={entryMode === "test" ? "Masalan: KP-48291" : "Masalan: K48291"}
                required
                maxLength={80}
              />
            </label>
            <button className="btn primary full">
              {entryMode === "parent" ? "Natijalarni ko‘rish" : entryMode === "hw" ? "Kabinetga kirish" : "Testga kirish"}{" "}
              <ArrowRight size={18} />
            </button>
          </form>
          <small>
            {entryMode === "parent"
              ? "Farzandingiz davomati, test natijalari va yutuqlari ro‘yxatdan o‘tishsiz ko‘rinadi."
              : "Test muddati va qoidalari kirishda ko‘rsatiladi."}
          </small>
        </div>
      </main>
      <footer className="public-footer">
        <Brand />
        <Link to="/privacy">Maxfiylik va foydalanish qoidalari</Link>
        <span className="powered-by">Powered by <strong>SysOne</strong></span>
        <Link to="/owner/login">Owner kirishi</Link>
      </footer>
    </div>
  );
}
function Privacy() {
  return (
    <div className="policy-page">
      <Brand />
      <h1>Maxfiylik va foydalanish qoidalari</h1>
      <p>
        O‘qituvchining savollari, guruhlari, o‘quvchilari va natijalari uning
        shaxsiy workspace doirasida saqlanadi. Ular boshqa o‘qituvchilarga
        berilmaydi.
      </p>
      <h2>Qanday ma’lumot olinadi?</h2>
      <p>
        Ism, email va ish joyi. Telegram orqali faqat rozilik bo‘lsa
        tasdiqlangan telefon olinadi. O‘quvchidan test uchun ism yoki o‘qituvchi
        bergan kod, javoblar va taxminiy faol vaqt olinadi.
      </p>
      <h2>Natijalar va ochiq savollar</h2>
      <p>
        Natijalar o‘qituvchi siyosatiga binoan ko‘rsatiladi. Ochiq reytingda ism
        qisqartiriladi. Savol faqat muallif roziligi va Owner tasdiqlashidan
        so‘ng CC BY 4.0 litsenziyasi bilan do‘konda chiqadi. Do‘kondagi javoblar
        ommaga ochiq bo‘ladi.
      </p>
      <h2>Saqlash va o‘chirish</h2>
      <p>
        Natijalar odatda 365 kun saqlanadi; platforma sozlamasi 30–730 kun.
        Shifrlangan backup 7 kungacha qolishi mumkin. Sozlamalarda ma’lumot
        eksporti va hisobni o‘chirish mavjud. Voyaga yetmagan o‘quvchi
        ma’lumotini kiritishda o‘qituvchi zarur rozilik va huquqiy asosni
        ta’minlaydi.
      </p>
      <h2>Xavfsizlik va yordam</h2>
      <p>
        Sessiya uchun zarur cookie ishlatiladi. Spamni oldini olish uchun
        Cloudflare Turnstile, kirish uchun Telegram va xatlar uchun tasdiqlangan
        email xizmati qo‘llanadi. Yordam uchun ilovadagi Bilim UZ Supportdan
        foydalaning. Hech qanday reklama kuzatuvchisi qo‘llanmaydi.
      </p>
      <Link className="btn secondary" to="/">
        Bosh sahifa
      </Link>
    </div>
  );
}
function App() {
  const [cfg, setCfg] = useState(DEFAULT_FLAGS);
  useEffect(() => {
    fetch("/api/v2/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCfg({ ...DEFAULT_FLAGS, ...d });
      })
      .catch(() => {});
  }, []);
  return (
    <ToastProvider>
      <ConfigContext.Provider value={cfg}><BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
          <Route path="/owner/login" element={<AuthPage mode="owner" />} />
          <Route path="/verify-email" element={<TokenPage mode="verify" />} />
          <Route path="/reset-password" element={<TokenPage mode="reset" />} />
          <Route path="/t/:slug" element={<ExamPage />} />
          <Route path="/practice" element={<FeatureGate enabled={cfg.practice_enabled} title="Ochiq testlar"><PracticeCatalog /></FeatureGate>} />
          <Route path="/practice/:slug" element={<FeatureGate enabled={cfg.practice_enabled} title="Ochiq testlar"><PracticeExam /></FeatureGate>} />
          <Route path="/library" element={<FeatureGate enabled={cfg.library_enabled} title="Kutubxona"><LibraryCatalog /></FeatureGate>} />
          <Route path="/library/:id" element={<FeatureGate enabled={cfg.library_enabled} title="Kutubxona"><LibraryBookReader /></FeatureGate>} />
          <Route path="/games" element={<FeatureGate enabled={cfg.games_enabled} title="O‘yinlar markazi"><GamesCatalogPage /></FeatureGate>} />
          <Route path="/games/:id" element={<FeatureGate enabled={cfg.games_enabled} title="O‘yinlar markazi"><GamePlayPage /></FeatureGate>} />
          <Route path="/parent" element={<FeatureGate enabled={cfg.parent_enabled} title="Ota-ona kabineti"><ParentPortal /></FeatureGate>} />
          <Route path="/parent/:code" element={<FeatureGate enabled={cfg.parent_enabled} title="Ota-ona kabineti"><ParentPortal /></FeatureGate>} />
          <Route path="/vazifalar" element={<FeatureGate enabled={cfg.assignments_enabled} title="Vazifalar"><StudentAssignmentsPage /></FeatureGate>} />
          <Route path="/student" element={<StudentCabinetPage />} />
          <Route path="/student/:code" element={<StudentCabinetPage />} />
          <Route path="/vazifalar/:code" element={<FeatureGate enabled={cfg.assignments_enabled} title="Vazifalar"><StudentAssignmentsPage /></FeatureGate>} />
          <Route path="/store" element={<FeatureGate enabled={cfg.store_enabled} title="Savollar do‘koni"><StorePage publicView /></FeatureGate>} />
          <Route path="/studio" element={<StudioShell />}>
            <Route index element={<Dashboard />} />
            <Route path="questions" element={<Questions />} />
            <Route path="imports" element={<ImportPage />} />
            <Route path="groups" element={<GroupsStudents />} />
            <Route path="students" element={<GroupsStudents students />} />
            <Route path="journal" element={<JournalPage />} />
            <Route path="assignments" element={<TeacherAssignmentsPage />} />
            <Route path="library" element={<LibraryStudio />} />
            <Route path="cards" element={<Cards />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="store" element={<StorePage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/owner/*" element={<OwnerPage />} />
          <Route path="/admin/*" element={<Navigate to="/studio" replace />} />
          <Route
            path="*"
            element={
              <div className="policy-page">
                <h1>Sahifa topilmadi</h1>
                <Link to="/">Bosh sahifaga qaytish</Link>
              </div>
            }
          />
        </Routes>
      </BrowserRouter></ConfigContext.Provider>
    </ToastProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
