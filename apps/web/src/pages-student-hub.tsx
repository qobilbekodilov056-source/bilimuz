import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Flame,
  Lock,
  Target,
  Gamepad2,
  Home,
  LogOut,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Trophy,
  Upload,
  ExternalLink,
  Maximize2,
  Play,
  Search,
} from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Field, Modal, Pill, useData, useToast } from "./ui";
import { openCertificatePrint } from "./cert-pdf";
import {
  SHOP_CATALOG,
  RARITY_META,
  WEEKLY_REWARDS,
  avatarDisplay,
  titleDisplay,
  type ShopSlot,
} from "./shop-catalog";

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
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.8,
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

function ActivitySparkline({ tests, avg }: { tests: any[]; avg: number | null }) {
  const pts = tests.length
    ? tests.slice(0, 6).reverse().map((t) => Math.max(8, Math.min(100, Number(t.percentage || 0))))
    : [28, 42, 38, 65, 55, 76];
  const w = 240;
  const h = 76;
  const step = pts.length > 1 ? w / (pts.length - 1) : w;
  const coords = pts.map((v, i) => [Math.round(i * step), Math.round(h - (v / 100) * (h - 14) - 6)]);
  const lineD = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaD = `${lineD} L${w},${h} L0,${h} Z`;
  const peakIdx = pts.reduce((best, v, i, arr) => (v >= arr[best] ? i : best), 0);
  const [px, py] = coords[peakIdx] || [120, 24];
  const labelVal = avg !== null && avg !== undefined ? `${avg}%` : `${pts[peakIdx]}%`;

  return (
    <div className="mg-spark-wrap">
      <div className="mg-spark-bubble" style={{ left: `${Math.min(82, Math.max(14, (px / w) * 100))}%` }}>
        {labelVal}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="mg-spark-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="mgAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#mgAreaGrad)" />
        <path d={lineD} fill="none" stroke="#60a5fa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={px} cy={py} r="4.5" fill="#ffffff" stroke="#3b82f6" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

type NavTab = "dashboard" | "hw" | "tests" | "attendance" | "rating" | "shop" | "games";

const SESSION_KEY = "bilimuz_student_session";
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 soat

function readStudentSession(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed?.code && Number(parsed.exp) > Date.now()) {
      return String(parsed.code);
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("bilimuz_student_code");
  } catch {}
  return "";
}

function saveStudentSession(code: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ code, exp: Date.now() + SESSION_TTL_MS }));
    localStorage.setItem("bilimuz_student_code", code);
  } catch {}
}

function clearStudentSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("bilimuz_student_code");
  } catch {}
}

export function StudentCabinetPage() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const sessionCode = typeof localStorage !== "undefined" ? readStudentSession() : "";
  const [inputCode, setInputCode] = useState(code || sessionCode);

  useEffect(() => {
    const c = code.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (c) {
      saveStudentSession(c);
    } else {
      const activeSess = readStudentSession();
      if (activeSess) {
        navigate("/student/" + encodeURIComponent(activeSess), { replace: true });
      }
    }
  }, [code, navigate]);
  const [tab, setTab] = useState<NavTab>("dashboard");
  const [activeGame, setActiveGame] = useState<any>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#daily-quests") {
      setTab("dashboard");
      setTimeout(() => {
        document.getElementById("daily-quests")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
    }
  }, [code]);
  const [shopCat, setShopCat] = useState<ShopSlot>("banner");
  const [shopBusy, setShopBusy] = useState<string>("");
  const [showCodeModal, setShowCodeModal] = useState(false);
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
  const shopData = useData(
    activeCode
      ? `/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}`
      : "/api/v2/public/assignments/shop/__empty__",
  );

  function onLookup(e: FormEvent) {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase().replace(/[\s-]+/g, "");
    if (!cleaned) return;
    saveStudentSession(cleaned);
    setShowCodeModal(false);
    navigate("/student/" + encodeURIComponent(cleaned));
  }

  function setThisMonth() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    setFromDate(`${y}-${m}-01`);
    setToDate(now.toISOString().slice(0, 10));
  }

  const st = hwData.data?.student || parentData.data?.student;
  const hwItems: any[] = hwData.data?.items || [];
  const hwSum = hwData.data?.summary;
  const pData = parentData.data;
  const lb = lbData.data;
  const shop = shopData.data;
  const badges = st ? computeBadges(pData, hwSum, lb) : [];
  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const loadingAny = activeCode && hwData.loading && parentData.loading;

  const equipped = shop?.equipped || { banner: "default_navy", frame: "none", avatar: "initials", title: "" };
  const ownedList: string[] = shop?.owned || [];
  const customItems: any[] = shop?.custom_items || lb?.custom_items || [];
  const customMap: Record<string, any> = {};
  for (const ci of customItems) customMap[ci.id] = ci;
  const allCatalog = [
    ...SHOP_CATALOG,
    ...customItems.map((ci: any) => ({
      id: ci.id,
      slot: ci.slot as ShopSlot,
      name: ci.name,
      price: Number(ci.price || 0),
      rarity: (ci.rarity || "rare") as any,
      imageUrl: ci.image_url || "",
      titleText: ci.title_text || "",
      desc: ci.description || "Maxsus Bilim UZ packi",
    })),
  ];
  const equippedBannerCustom = customMap[equipped.banner];
  const equippedAvatarCustom = customMap[equipped.avatar];
  const equippedFrameCustom = customMap[equipped.frame];
  const equippedTitleText = customMap[equipped.title]?.title_text || titleDisplay(equipped.title);
  const coinBalance = Number(shop?.balance ?? 0);
  const myXp = Number(lb?.me?.xp ?? shop?.xp ?? 0);
  const myLevel = Math.floor(myXp / 100) + 1;
  const levelPct = Math.min(100, myXp % 100);
  const todayLabel = new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" }).format(new Date());

  async function handleBuy(itemId: string) {
    if (!activeCode || shopBusy) return;
    setShopBusy(itemId);
    try {
      await api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/buy`, {
        method: "POST",
        data: { item_id: itemId },
      });
      toast("Buyum sotib olindi va profilga taqildi!");
      shopData.reload();
      lbData.reload();
    } catch (e: any) {
      toast(e?.message || "Sotib olishda xatolik");
    } finally {
      setShopBusy("");
    }
  }

  async function handleEquip(slot: ShopSlot, itemId: string) {
    if (!activeCode || shopBusy) return;
    setShopBusy(itemId || "clear_" + slot);
    try {
      await api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/equip`, {
        method: "POST",
        data: { slot, item_id: itemId },
      });
      toast("Profil ko‘rinishi yangilandi!");
      shopData.reload();
      lbData.reload();
    } catch (e: any) {
      toast(e?.message || "Yangilashda xatolik");
    } finally {
      setShopBusy("");
    }
  }

  async function handleCheckin() {
    if (!activeCode || shopBusy) return;
    setShopBusy("checkin");
    try {
      const res = await api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/checkin`, {
        method: "POST",
        data: {},
      });
      toast(`+${res.reward} Bilim Coin olindi! (${res.streak_days}-kun ketma-ket)`);
      shopData.reload();
    } catch (e: any) {
      toast(e?.message || "Sovg‘ani olishda xatolik");
    } finally {
      setShopBusy("");
    }
  }

  async function handleClaimQuest(questId: string) {
    if (!activeCode || shopBusy) return;
    setShopBusy(questId);
    try {
      const res = await api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/quest-claim`, {
        method: "POST",
        data: { quest_id: questId },
      });
      toast(`Quest bajarildi! +${res.reward} Bilim Coin qo‘shildi!`);
      shopData.reload();
    } catch (e: any) {
      toast(e?.message || "Quest mukofotini olishda xatolik");
    } finally {
      setShopBusy("");
    }
  }

  const lookupError = activeCode && (hwData.error || parentData.error);

  // Entry screen when no student code is active yet
  if (!activeCode) {
    return (
      <div className="mg-backdrop">
        <div className="mg-login-card">
          <Link to="/" className="mg-back-pill">
            <ArrowLeft size={15} /> Bosh sahifa
          </Link>
          <div className="mg-brand-hero">
            <span className="mg-logo-orb">B</span>
            <div>
              <small>BILIM UZ · GAMER PROFIL</small>
              <h1>O‘quvchi kabineti</h1>
            </div>
          </div>
          <p className="mg-muted">
            O‘qituvchingiz bergan shaxsiy kodni (masalan: <code>K48291</code>) kiriting — kunlik questlar, Bilim Coin do‘koni, vazifalar va reyting sizni kutmoqda.
          </p>
          <form onSubmit={onLookup} className="mg-login-form">
            <input
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="O‘quvchi kodi (masalan: K48291)"
              required
              maxLength={40}
            />
            <button className="mg-glow-btn">
              Kabinetga kirish <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: NavTab; label: string; Icon: any; badge?: number }> = [
    { id: "dashboard", label: "Boshqaruv", Icon: Home },
    { id: "hw", label: "Vazifalarim", Icon: ClipboardList, badge: hwItems.length },
    { id: "tests", label: "Natijalarim", Icon: Award, badge: pData?.tests?.items?.length || 0 },
    { id: "attendance", label: "Davomatim", Icon: CalendarDays },
    { id: "rating", label: "Reyting", Icon: Trophy },
    { id: "shop", label: "Do‘kon", Icon: ShoppingBag },
  ];

  return (
    <div className="mg-backdrop">
      <div className="mg-shell">
        {/* LEFT ORB SIDEBAR (exact G.Take style) */}
        <aside className="mg-sidebar">
          <Link to="/" className="mg-brand">
            <span className="mg-brand-icon">
              <Sparkles size={17} />
            </span>
            <strong>BILIM.UZ</strong>
          </Link>

          <nav className="mg-nav">
            {navItems.map(({ id, label, Icon, badge }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={active ? "mg-nav-item is-active" : "mg-nav-item"}
                  onClick={() => setTab(id)}
                >
                  <span className="mg-nav-orb">
                    <Icon size={17} />
                  </span>
                  <span className="mg-nav-label">{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className="mg-nav-count">{badge}</span>
                  )}
                </button>
              );
            })}
            <Link to={"/chat/" + encodeURIComponent(activeCode)} className="mg-nav-item">
              <span className="mg-nav-orb">
                <MessageCircle size={17} />
              </span>
              <span className="mg-nav-label">Guruh chati</span>
            </Link>
          </nav>

          <div className="mg-sidebar-foot">
            <Link to="/library" className="mg-nav-item">
              <span className="mg-nav-orb">
                <BookOpen size={16} />
              </span>
              <span className="mg-nav-label">Kutubxona</span>
            </Link>
            <button
              type="button"
              className={"mg-nav-item" + (tab === "games" ? " is-active" : "")}
              onClick={() => {
                setTab("games");
                setActiveGame(null);
              }}
            >
              <span className="mg-nav-orb">
                <Gamepad2 size={16} />
              </span>
              <span className="mg-nav-label">O‘yinlar</span>
            </button>
            <button
              type="button"
              className="mg-nav-item"
              onClick={() => setShowCodeModal(true)}
            >
              <span className="mg-nav-orb">
                <LogOut size={16} />
              </span>
              <span className="mg-nav-label">Kod almashtirish</span>
            </button>
          </div>
        </aside>

        {/* MAIN WORKSPACE */}
        <div className="mg-body">
          {/* TOP BAR */}
          <header className="mg-topbar">
            <div className="mg-breadcrumb">
              <Link to="/">Bosh sahifa</Link>
              <span>/</span>
              <strong>Kabinet</strong>
              <span>/</span>
              <span className="mg-date-pill"><CalendarDays size={13} /> {todayLabel}</span>
            </div>

            <div className="mg-topbar-right">
              {lb?.top10?.length > 0 && (
                <button
                  type="button"
                  className="mg-peers-pill"
                  onClick={() => setTab("rating")}
                  title="Guruh reytingi"
                >
                  <div className="mg-peers-stack">
                    {lb.top10.slice(0, 3).map((p: any) => (
                      <span key={p.id} className="mg-peer-dot">
                        {avatarDisplay(p.cosmetics?.avatar || "initials", p.name)}
                      </span>
                    ))}
                  </div>
                  <span>Top-{lb.top10.length}</span>
                </button>
              )}

              <button
                type="button"
                className="mg-coin-top"
                onClick={() => setTab("shop")}
              >
                <Coins size={14} /> {coinBalance}
              </button>

              {st && (
                <button
                  type="button"
                  className="mg-user-top"
                  onClick={() => setTab("shop")}
                  title="Profilni bezash"
                >
                  <span className={`mini-avatar-ring frame-${equipped.frame || "none"}`}>
                    <span className="mini-avatar-core">
                      {avatarDisplay(equipped.avatar || "initials", st.name)}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </header>

          {loadingAny ? (
            <div style={{ padding: 40 }}><Busy /></div>
          ) : lookupError && !st ? (
            <div style={{ padding: 24 }}>
              <ErrorBox error={lookupError} retry={() => { hwData.reload(); parentData.reload(); lbData.reload(); }} />
            </div>
          ) : st ? (
            <div className="mg-grid">
              {/* CENTER COLUMN */}
              <main className="mg-center">
                {/* GREETING HERO */}
                <div className="mg-hero-head">
                  <div>
                    <h1 className="mg-gradient-title">Salom, {st.name.split(" ")[0]}!</h1>
                    <p className="mg-hero-sub">
                      {st.group_name || "Umumiy"} · Kod: <strong>{st.student_code}</strong>
                      {equipped.title ? ` · ${titleDisplay(equipped.title)}` : ""}
                      {pData?.student?.center_name ? ` · ${pData.student.center_name}` : ""}
                    </p>
                  </div>
                </div>

                {/* VIEW 1: DASHBOARD (Featured Blue Glow Card + Equipped Banner + Badges + Recent HW) */}
                {tab === "dashboard" && (
                  <div className="mg-stack">
                    {/* Equipped Banner & Gamer Identity Featured Glow Card */}
                    <div className={`mg-card mg-card-featured ${equippedBannerCustom?.image_url ? "" : "banner-" + (equipped.banner || "default_navy")}`} style={equippedBannerCustom?.image_url ? { backgroundImage: `url(${equippedBannerCustom.image_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                      <div className="mg-featured-overlay">
                        <div className="mg-card-top-row">
                          <span className="mg-tag-dot">● LVL {myLevel} · Faol o‘quvchi</span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <span className="mg-mini-badge"><Coins size={12} /> {coinBalance} Coin</span>
                            {lb?.my_rank && <span className="mg-mini-badge"><Trophy size={12} /> #{lb.my_rank}</span>}
                          </div>
                        </div>

                        <div className="mg-featured-mid">
                          <div className={`gamer-avatar-ring ${equippedFrameCustom?.image_url ? "" : "frame-" + (equipped.frame || "none")}`} style={{ width: 72, height: 72, position: "relative" }}>
                            <div className="gamer-avatar-core" style={{ fontSize: 26, overflow: "hidden" }}>
                              {equippedAvatarCustom?.image_url ? (
                                <img src={equippedAvatarCustom.image_url} alt={st.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                avatarDisplay(equipped.avatar || "initials", st.name)
                              )}
                            </div>
                            {equippedFrameCustom?.image_url && (
                              <img src={equippedFrameCustom.image_url} alt="" className="custom-frame-overlay" />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <h2 style={{ margin: 0, fontSize: 19, color: "#fff" }}>{st.name}</h2>
                              {equippedTitleText && (
                                <span className="gamer-title-badge">{equippedTitleText}</span>
                              )}
                            </div>
                            <p className="mg-card-desc" style={{ margin: "4px 0 0" }}>
                              Vazifalar: <strong>{hwSum ? `${hwSum.submitted}/${hwSum.total}` : "0/0"}</strong> ·
                              O‘rtacha test: <strong>{pData?.tests?.avg_percent ?? "—"}%</strong> ·
                              Davomat: <strong>{pData?.attendance?.percent ?? "—"}%</strong>
                            </p>
                          </div>
                        </div>

                        {/* Striped Blue Progress Bar (exact match to Design System card) */}
                        <div className="mg-progress-row">
                          <div className="mg-tags-wrap">
                            <span className="mg-soft-tag">{st.group_name || "Umumiy"}</span>
                            <span className="mg-soft-tag">{myXp} XP</span>
                            <span className="mg-soft-tag">{unlockedCount}/{badges.length} Nishon</span>
                          </div>
                          <div className="mg-striped-wrap">
                            <small>LVL {myLevel + 1}:</small>
                            <div className="mg-striped-bar">
                              <div className="mg-striped-fill" style={{ width: `${Math.max(8, levelPct)}%` }} />
                            </div>
                            <span className="mg-pct-pill">%{levelPct}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Badges Glass Card */}
                    <div className="mg-card">
                      <div className="mg-card-top-row" style={{ marginBottom: 12 }}>
                        <strong style={{ color: "#fff", fontSize: 15 }}>Yutuq nishonlari (Badges)</strong>
                        <span className="mg-mini-badge">{unlockedCount} / {badges.length} ochilgan</span>
                      </div>
                      <div className="mg-badges-grid">
                        {badges.map((b) => (
                          <div key={b.id} className={"mg-badge-item" + (b.unlocked ? " is-unlocked" : "")} title={b.desc}>
                            <span className="mg-badge-ico">{b.icon}</span>
                            <div>
                              <strong>{b.title}</strong>
                              <small>{b.desc}</small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent Homework Preview Card */}
                    <div className="mg-card">
                      <div className="mg-card-top-row" style={{ marginBottom: 10 }}>
                        <strong style={{ color: "#fff", fontSize: 15 }}>Faol vazifalar</strong>
                        <button type="button" className="mg-link-btn" onClick={() => setTab("hw")}>
                          Barchasi ({hwItems.length}) →
                        </button>
                      </div>
                      {!hwItems.length ? (
                        <p className="mg-muted" style={{ margin: 0 }}>Hozircha faol uyga vazifalar yo‘q.</p>
                      ) : (
                        <div className="mg-hw-mini-list">
                          {hwItems.slice(0, 3).map((a: any) => (
                            <div key={a.id} className="mg-hw-mini-row">
                              <div>
                                <strong>{a.title}</strong>
                                <small style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock size={13} color="#64748b" /> {fmtDateTime(a.due_at)} · Maks: {a.max_score} ball</small>
                              </div>
                              <button
                                type="button"
                                className="mg-small-btn"
                                onClick={() => setActiveHw(a)}
                              >
                                {a.submission ? "Ko‘rish" : "Topshirish"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW 2: VAZIFALARIM */}
                {tab === "hw" && (
                  hwData.loading ? <Busy /> : !hwItems.length ? (
                    <div className="mg-card"><Empty title="Hozircha vazifalar yo‘q" text="O‘qituvchingiz yangi vazifa berganda shu yerda chiqadi." /></div>
                  ) : (
                    <div className="mg-stack">
                      {hwItems.map((a: any) => {
                        const km = KIND_META[a.kind] || KIND_META.text;
                        const sub = a.submission;
                        const overdue = a.due_at && a.due_at < Date.now() / 1000 && !sub;
                        return (
                          <div className={"mg-card" + (!sub && a.status === "active" ? " mg-card-glow-subtle" : "")} key={a.id}>
                            <div className="mg-card-top-row">
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <span className="mg-soft-tag">{km.label}</span>
                                {sub ? (
                                  <span className="mg-mini-badge is-green">
                                    {sub.status === "graded" ? `Baholandi: ${sub.score}/${a.max_score}` : "Topshirildi ✓"}
                                  </span>
                                ) : overdue ? (
                                  <span className="mg-mini-badge is-red">Muddati o‘tgan</span>
                                ) : (
                                  <span className="mg-mini-badge">Kutilmoqda</span>
                                )}
                              </div>
                              <small className="mg-muted">Maks: {a.max_score} ball</small>
                            </div>
                            <h3 style={{ margin: "10px 0 6px", color: "#fff" }}>{a.title}</h3>
                            {a.description && <p className="mg-card-desc">{a.description}</p>}
                            <div className="mg-card-foot-row">
                              <small className="mg-muted"><Clock size={13} /> {fmtDateTime(a.due_at)}</small>
                              <div style={{ display: "flex", gap: 8 }}>
                                {a.kind === "test" && a.linked_card_slug && (
                                  <Link to={"/t/" + encodeURIComponent(a.linked_card_slug)} className="mg-small-btn is-primary">
                                    Testga o‘tish <ArrowRight size={13} />
                                  </Link>
                                )}
                                {a.status === "active" && (
                                  <button type="button" className="mg-small-btn is-primary" onClick={() => setActiveHw(a)}>
                                    <Upload size={13} /> {sub ? "Yangilash" : "Topshirish"}
                                  </button>
                                )}
                              </div>
                            </div>
                            {sub?.teacher_feedback && (
                              <div className="mg-feedback-box">
                                <strong>O‘qituvchi izohi:</strong> {sub.teacher_feedback}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {/* VIEW 3: TEST NATIJALARIM + QR PDF CERTIFICATE */}
                {tab === "tests" && (
                  parentData.loading ? <Busy /> : (
                    <div className="mg-card">
                      <div className="mg-card-top-row" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                        <strong style={{ color: "#fff", fontSize: 16 }}>Test natijalarim</strong>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <input type="date" className="mg-date-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                          <input type="date" className="mg-date-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                          <button type="button" className="mg-small-btn" onClick={setThisMonth}>Shu oy</button>
                          {(fromDate || toDate) && (
                            <button type="button" className="mg-small-btn" onClick={() => { setFromDate(""); setToDate(""); }}>Tozalash</button>
                          )}
                        </div>
                      </div>
                      {!pData?.tests?.items?.length ? (
                        <Empty title="Test natijalari hali yo‘q" text="Test topshirganingizdan so‘ng barcha natijalaringiz shu yerda chiqadi." />
                      ) : (
                        <div className="table-scroll">
                          <table className="mg-table">
                            <thead>
                              <tr>
                                <th>Test nomi</th>
                                <th>Sana</th>
                                <th>Ball</th>
                                <th>Natija</th>
                                <th>Sertifikat</th>
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
                                  <td>
                                    <button
                                      type="button"
                                      className="mg-small-btn is-primary"
                                      onClick={() =>
                                        openCertificatePrint({
                                          studentName: pData?.student?.name || st.name || "O‘quvchi",
                                          studentCode: activeCode,
                                          groupName: pData?.student?.group_name || st.group_name || "",
                                          tenantName: pData?.student?.center_name || pData?.student?.tenant_name || "",
                                          testTitle: t.card_title || "Onlayn test",
                                          category: t.card_category || "",
                                          percentage: Number(t.percentage || 0),
                                          score: Number(t.score || 0),
                                          maxScore: Number(t.max_score || 0),
                                          passed: !!t.passed || Number(t.percentage || 0) >= 70,
                                          reward: t.reward || "",
                                          dateText: new Date(Number(t.submitted_at || Date.now() / 1000) * 1000).toLocaleDateString("uz-UZ"),
                                          certCode: "BUZ-" + String(activeCode || "CERT").slice(0, 6) + "-" + String(idx + 1).padStart(2, "0"),
                                        })
                                      }
                                    >
                                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Award size={14} color="#0c8066" /> PDF</span>
                                    </button>
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

                {/* VIEW 4: DAVOMATIM */}
                {tab === "attendance" && (
                  parentData.loading ? <Busy /> : (
                    <div className="mg-card">
                      <div className="mg-card-top-row" style={{ marginBottom: 14 }}>
                        <strong style={{ color: "#fff", fontSize: 16 }}>Davomat tarixi</strong>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <span className="mg-mini-badge is-green">Keldi: {pData?.attendance?.present || 0}</span>
                          <span className="mg-mini-badge">Kechikdi: {pData?.attendance?.late || 0}</span>
                          <span className="mg-mini-badge is-red">Kelmadi: {pData?.attendance?.absent || 0}</span>
                        </div>
                      </div>
                      {!pData?.attendance?.items?.length ? (
                        <Empty title="Davomat yozuvlari yo‘q" text="O‘qituvchi kurs jurnalida davomat belgilaganda shu yerda chiqadi." />
                      ) : (
                        <div className="mg-att-grid">
                          {pData.attendance.items.map((a: any, i: number) => {
                            const m = ATT_LABEL[a.status] || { text: a.status, tone: "blue" as const };
                            return (
                              <div className="mg-att-item" key={i}>
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

                {/* VIEW 5: GURUH REYTINGI (TOP-10) */}
                {tab === "rating" && (
                  lbData.loading ? <Busy /> : !lb?.top10?.length ? (
                    <div className="mg-card"><Empty title="Reyting hali shakllanmagan" text="Testlar va vazifalar bajarilgani sari Top-10 reyting shu yerda chiqadi." /></div>
                  ) : (
                    <div className="mg-card">
                      <div className="mg-card-top-row" style={{ marginBottom: 14 }}>
                        <div>
                          <strong style={{ color: "#fff", fontSize: 16 }}>{lb.group_name} — Top-10 reyting</strong>
                          <small className="mg-muted" style={{ display: "block" }}>Test, davomat va vazifalar asosida jonli reyting</small>
                        </div>
                      </div>
                      <div className="table-scroll">
                        <table className="mg-table">
                          <thead>
                            <tr>
                              <th>O‘rin</th>
                              <th>O‘quvchi</th>
                              <th>Test</th>
                              <th>Vazifa</th>
                              <th>XP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lb.top10.map((r: any) => {
                              const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`;
                              return (
                                <tr key={r.id} className={r.is_me ? "mg-row-me" : ""}>
                                  <td><strong>{medal}</strong></td>
                                  <td>
                                    <div className="student-name-cell">
                                      <span className={`mini-avatar-ring frame-${r.cosmetics?.frame || "none"}`}>
                                        <span className="mini-avatar-core">
                                          {avatarDisplay(r.cosmetics?.avatar || "initials", r.name)}
                                        </span>
                                      </span>
                                      <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                          <strong>{r.name}</strong>
                                          {r.cosmetics?.title && (
                                            <span className="mini-title-pill">{titleDisplay(r.cosmetics.title)}</span>
                                          )}
                                          {r.is_me && <span className="mg-mini-badge is-green">Siz</span>}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td>{r.avg_test !== null ? `${r.avg_test}%` : "—"}</td>
                                  <td>{r.hw_done} ta</td>
                                  <td><strong style={{ color: "#60a5fa" }}>{r.xp} XP</strong></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}

                {/* VIEW 6: BILIM DO‘KONI */}
                {tab === "shop" && (
                  <div className="mg-card">
                    <div className="shop-header">
                      <div>
                        <h2 style={{ margin: 0, color: "#fff", fontSize: 18 }}>Bilim Do‘koni</h2>
                        <p className="mg-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                          Bilim Coinlaringizga banner, ramka, avatar va unvonlar sotib oling!
                        </p>
                      </div>
                      <div className="shop-wallet-box">
                        <small>Balansingiz</small>
                        <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Coins size={16} /> {coinBalance} Coin</strong>
                      </div>
                    </div>

                    <div className="shop-cat-tabs">
                      {([
                        ["banner", "Bannerlar"],
                        ["frame", "✨ Ramkalar"],
                        ["avatar", "Avatarlar"],
                        ["title", "🏷 Unvonlar"],
                      ] as [ShopSlot, string][]).map(([slot, label]) => (
                        <button
                          key={slot}
                          type="button"
                          className={shopCat === slot ? "shop-cat-btn is-active" : "shop-cat-btn"}
                          onClick={() => setShopCat(slot)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div className="shop-grid">
                      {allCatalog.filter((item: any) => item.slot === shopCat).map((item: any) => {
                        const isOwned = item.price === 0 || ownedList.includes(item.id);
                        const isEquipped = (equipped[item.slot] || "") === item.id;
                        const canAfford = coinBalance >= item.price;
                        const rm = RARITY_META[item.rarity as keyof typeof RARITY_META] || RARITY_META.rare;
                        const busyThis = shopBusy === item.id || shopBusy === "clear_" + item.slot;
                        return (
                          <div key={item.id || "empty"} className={"shop-item-card" + (isEquipped ? " is-equipped" : "")}>
                            <div className="shop-item-preview">
                              {item.slot === "banner" && (item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="shop-prev-banner" style={{ objectFit: "cover" }} /> : <div className={`shop-prev-banner banner-${item.id}`} />)}
                              {item.slot === "frame" && (
                                <div className={`gamer-avatar-ring ${item.imageUrl ? "" : "frame-" + item.id}`} style={{ width: 62, height: 62, position: "relative" }}>
                                  <div className="gamer-avatar-core" style={{ fontSize: 20 }}>
                                    {avatarDisplay(equipped.avatar || "initials", st.name)}
                                  </div>
                                  {item.imageUrl && <img src={item.imageUrl} alt="" className="custom-frame-overlay" />}
                                </div>
                              )}
                              {item.slot === "avatar" && (
                                <div className="gamer-avatar-ring frame-none" style={{ width: 62, height: 62 }}>
                                  <div className="gamer-avatar-core" style={{ fontSize: 24, overflow: "hidden" }}>
                                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (item.id === "initials" ? avatarDisplay("initials", st.name) : item.emoji)}
                                  </div>
                                </div>
                              )}
                              {item.slot === "title" && (
                                <span className="gamer-title-badge" style={{ fontSize: 13, padding: "6px 12px" }}>
                                  {item.titleText || "Unvonsiz"}
                                </span>
                              )}
                            </div>

                            <div className="shop-item-meta">
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                                <strong>{item.name}</strong>
                                <span className="shop-rarity-tag" style={{ color: rm.color, borderColor: rm.color + "55" }}>
                                  {rm.label}
                                </span>
                              </div>
                              <small>{item.desc}</small>
                            </div>

                            <div className="shop-item-foot">
                              {isEquipped ? (
                                <button type="button" className="shop-btn is-done" disabled>✓ Taqilgan</button>
                              ) : isOwned ? (
                                <button type="button" className="shop-btn is-equip" disabled={busyThis} onClick={() => handleEquip(item.slot, item.id)}>
                                  {busyThis ? "Saqlanmoqda…" : "Taqish"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={canAfford ? "shop-btn is-buy" : "shop-btn is-locked"}
                                  disabled={!canAfford || busyThis}
                                  onClick={() => handleBuy(item.id)}
                                >
                                  {busyThis ? "…" : canAfford ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Coins size={13} /> {item.price} — Olish</span> : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Lock size={13} /> {item.price} Coin</span>}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === "games" && (
                  <StudentInlineGamesArena
                    studentCode={activeCode}
                    activeGame={activeGame}
                    setActiveGame={setActiveGame}
                    onGameStart={() => {
                      if (activeCode) {
                        api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/quest-visit`, {
                          method: "POST",
                          data: { quest_id: "q_game" },
                        }).catch(() => {});
                      }
                    }}
                  />
                )}
              </main>

              {/* RIGHT WIDGET RAIL (matching Today note + My files + Activity) */}
              <aside className="mg-right">
                {/* 1. BRIGHT LUMINOUS TOP CARD: 7-Day Weekly Streak */}
                {shop && (
                  <div className="mg-widget mg-widget-luminous">
                    <div className="mg-widget-head">
                      <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flame size={15} /> Kunlik sovg‘a</strong>
                      <span className="mg-luminous-pill">{shop.streak_days || 0} kun</span>
                    </div>
                    <p className="mg-luminous-desc">
                      Har kuni profilga kiring va 7-kuni <strong>+30 Coin</strong> jackpot oling!
                    </p>
                    <div className="mg-days-mini">
                      {WEEKLY_REWARDS.map((amt, i) => {
                        const d = i + 1;
                        const streakMod = shop.streak_days > 0 ? ((shop.streak_days - 1) % 7) + 1 : 0;
                        const past = shop.checked_in_today ? d <= streakMod : d <= (shop.streak_days % 7);
                        const cur = !shop.checked_in_today && d === (shop.streak_days % 7) + 1;
                        return (
                          <span key={d} className={"mg-day-dot" + (past ? " is-past" : "") + (cur ? " is-cur" : "")} title={`${d}-kun: +${amt} Coin`}>
                            {past ? "✓" : `+${amt}`}
                          </span>
                        );
                      })}
                    </div>
                    <div className="mg-widget-foot">
                      <small style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>7-kun: <Coins size={12} color="#d97706" /> 30</small>
                      <button
                        type="button"
                        className="mg-luminous-btn"
                        disabled={shop.checked_in_today || shopBusy === "checkin"}
                        onClick={handleCheckin}
                      >
                        {shop.checked_in_today
                          ? "✓ Bugun olindi"
                          : shopBusy === "checkin"
                            ? "…"
                            : `Olish (+${shop.next_reward} Coin)`}
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. MIDDLE DARK GLASS CARD: Daily Personalized Quests */}
                {shop?.daily_quests?.length > 0 && (
                  <div id="daily-quests" className="mg-widget">
                    <div className="mg-widget-head">
                      <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Target size={15} /> Kunlik questlar</strong>
                      <small className="mg-muted">{shop.subject_label || "Umumiy"}</small>
                    </div>
                    <div className="mg-quest-stack">
                      {shop.daily_quests.map((q: any) => (
                        <div key={q.id} className={"mg-quest-item" + (q.claimed ? " is-done" : "")}>
                          <div className="mg-quest-top">
                            <span>{q.icon}</span>
                            <strong>{q.title}</strong>
                          </div>
                          <div className="mg-quest-bot">
                            {q.id === "q_game" ? (
                              <button
                                type="button"
                                className="mg-quest-go"
                                style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                                onClick={() => {
                                  if (activeCode) {
                                    api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/quest-visit`, { method: "POST", data: { quest_id: "q_game" } }).catch(() => {});
                                  }
                                  setTab("games");
                                  setActiveGame(null);
                                }}
                              >
                                {q.link_label} ↗
                              </button>
                            ) : (
                              <Link to={q.link + (q.link.includes("?") ? "&" : "?") + "from=quest&code=" + encodeURIComponent(activeCode)} className="mg-quest-go" onClick={() => { if (activeCode && q.id === "q_book") { api(`/api/v2/public/assignments/shop/${encodeURIComponent(activeCode)}/quest-visit`, { method: "POST", data: { quest_id: "q_book" } }).catch(() => {}); } }}>{q.link_label} ↗</Link>
                            )}
                            {q.claimed ? (
                              <span className="mg-quest-ok" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><CheckCircle2 size={13} color="#059669" /> +{q.reward} <Coins size={12} color="#d97706" /></span>
                            ) : (
                              <button
                                type="button"
                                className="mg-quest-claim"
                                disabled={shopBusy === q.id}
                                onClick={() => handleClaimQuest(q.id)}
                              >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>+{q.reward} <Coins size={12} color="#d97706" /></span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. BOTTOM DARK GLASS CARD: Activity Area Sparkline Chart */}
                <div className="mg-widget">
                  <div className="mg-widget-head">
                    <div>
                      <strong>Faollik</strong>
                      <small className="mg-muted" style={{ display: "block" }}>
                        {(pData?.tests?.items?.length || 0) + (hwSum?.submitted || 0)} ta bajarilgan ish
                      </small>
                    </div>
                    <button type="button" className="mg-report-pill" onClick={() => setTab("tests")}>
                      Natijalar <span className="mg-report-arrow">↗</span>
                    </button>
                  </div>
                  <ActivitySparkline tests={pData?.tests?.items || []} avg={pData?.tests?.avg_percent ?? null} />
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </div>

      {/* Code Switcher Modal */}
      {showCodeModal && (
        <Modal title="O‘quvchi kodini almashtirish" close={() => setShowCodeModal(false)}>
          <form onSubmit={onLookup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Yangi o‘quvchi kodi">
              <input
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="Masalan: K48291"
                required
                maxLength={40}
              />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" style={{ flex: 1 }}>Kabinetga kirish</button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  clearStudentSession();
                  setInputCode("");
                  setShowCodeModal(false);
                  navigate("/student", { replace: true });
                  toast("Profildan chiqildi");
                }}
              >
                Profildan chiqish
              </button>
            </div>
          </form>
        </Modal>
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
            shopData.reload();
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
  const existing = assignment.submission;
  const [contentText, setContentText] = useState(existing?.content_text || "");
  const [contentUrl, setContentUrl] = useState(existing?.content_url || "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("content_text", contentText);
      fd.set("content_url", contentUrl);
      if (file) {
        const prepared = assignment.kind === "image" ? await compressImage(file) : file;
        fd.set("file", prepared);
      }
      await api(`/api/v2/public/assignments/student/${encodeURIComponent(code)}/submit/${encodeURIComponent(assignment.id)}`, {
        method: "POST", form: fd,
      });
      onSubmitted();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={assignment.title} close={close}>
      {assignment.description && <p className="muted" style={{ marginTop: 0 }}>{assignment.description}</p>}
      {!!error && <ErrorBox error={error} />}
      <form onSubmit={onSubmit}>
        {(assignment.kind === "text" || assignment.kind === "test") && (
          <Field label="Javobingiz (matn yoki kod)">
            <textarea rows={6} value={contentText} onChange={(e) => setContentText(e.target.value)} required={assignment.kind === "text"} maxLength={10000} placeholder="Javobingizni shu yerga yozing…" />
          </Field>
        )}
        {assignment.kind === "link" && (
          <>
            <Field label="Havola (GitHub, Figma, Google Docs va h.k.)">
              <input type="url" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} required placeholder="https://..." />
            </Field>
            <Field label="Izoh (ixtiyoriy)">
              <textarea rows={3} value={contentText} onChange={(e) => setContentText(e.target.value)} maxLength={2000} />
            </Field>
          </>
        )}
        {(assignment.kind === "image" || assignment.kind === "file") && (
          <>
            <Field label={assignment.kind === "image" ? "Rasm / Skrinshot tanlang (avtomatik siqiladi)" : "Fayl tanlang (maks. 5 MB)"}>
              <input
                type="file"
                accept={assignment.kind === "image" ? "image/*" : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,image/*"}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required={!existing?.file_key}
              />
              {file && <small className="muted">{file.name} ({fmtBytes(file.size)})</small>}
            </Field>
            <Field label="Izoh (ixtiyoriy)">
              <textarea rows={3} value={contentText} onChange={(e) => setContentText(e.target.value)} maxLength={2000} />
            </Field>
          </>
        )}
        <button className="btn primary full" disabled={busy}>
          <CheckCircle2 size={16} /> {busy ? "Yuklanmoqda…" : existing ? "Javobni yangilash" : "Vazifani topshirish"}
        </button>
      </form>
    </Modal>
  );
}

const GAME_MODES = [
  ["", "Barchasi"],
  ["duel", "1 vs 1 Duel"],
  ["team", "Jamoaviy"],
  ["multiplayer", "Multiplayer"],
  ["solo", "Yakka o‘yin"],
] as const;

function buildArenaGameUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".vercel.app") && !u.searchParams.has("embed")) {
      u.searchParams.set("embed", "1");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function StudentInlineGamesArena({
  studentCode,
  activeGame,
  setActiveGame,
  onGameStart,
}: {
  studentCode: string;
  activeGame: any;
  setActiveGame: (g: any) => void;
  onGameStart: () => void;
}) {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  const gamesRes = useData(
    `/api/v2/games?q=${encodeURIComponent(search)}&mode=${encodeURIComponent(mode)}&student_code=${encodeURIComponent(studentCode)}`,
  );
  const items: any[] = gamesRes.data?.items || [];

  function launchGame(g: any) {
    fetch(
      `/api/v2/games/${encodeURIComponent(g.id)}/play?student_code=${encodeURIComponent(studentCode)}`,
      { method: "POST" },
    ).catch(() => {});
    onGameStart();
    if (g.open_mode === "newtab") {
      window.open(g.url, "_blank", "noopener,noreferrer");
      return;
    }
    setActiveGame(g);
  }

  function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {});
    }
  }

  if (activeGame) {
    const finalUrl = buildArenaGameUrl(activeGame.url);
    return (
      <div className="mg-game-stage" ref={stageRef}>
        <div className="mg-game-stage-bar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button
              type="button"
              className="mg-game-btn-ghost"
              onClick={() => setActiveGame(null)}
            >
              <ArrowLeft size={15} /> O‘yinlar
            </button>
            <strong className="mg-game-stage-title">{activeGame.title}</strong>
            <span className="mg-game-mode-pill">{activeGame.category || "Arena"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="mg-game-btn-ghost" onClick={toggleFullscreen}>
              <Maximize2 size={14} /> To‘liq ekran
            </button>
            <a
              href={activeGame.url}
              target="_blank"
              rel="noreferrer"
              className="mg-game-btn-ghost"
              title="Alohida oynada ochish"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
        <iframe
          className="mg-game-iframe"
          src={finalUrl}
          title={activeGame.title}
          allow="fullscreen; autoplay; gamepad; microphone"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="mg-games-wrap">
      <div className="mg-games-hero">
        <div className="mg-games-hero-top">
          <div>
            <span className="mg-games-eyebrow">
              <Gamepad2 size={14} /> O‘YINLAR ARENASI
            </span>
            <h2 className="mg-games-title">Bilim bellashuvi va interaktiv o‘yinlar</h2>
            <p className="mg-games-sub">
              O‘yinni tanlang — u shu kabinetning o‘zida ochiladi va kunlik quest uchun bonus Coin beradi.
            </p>
          </div>
          <div className="mg-games-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="O‘yin qidirish…"
            />
          </div>
        </div>
        <div className="mg-games-modes">
          {GAME_MODES.map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={"mg-game-filter" + (mode === v ? " is-active" : "")}
              onClick={() => setMode(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {gamesRes.loading ? (
        <Busy />
      ) : gamesRes.error ? (
        <ErrorBox error={gamesRes.error} retry={gamesRes.reload} />
      ) : !items.length ? (
        <div className="mg-game-empty">
          <Gamepad2 size={32} color="#60a5fa" />
          <strong>Hozircha o‘yinlar qo‘shilmagan</strong>
          <p>Tez orada yangi ta’limiy o‘yinlar va 1 vs 1 duellar shu yerda paydo bo‘ladi.</p>
        </div>
      ) : (
        <div className="mg-games-grid">
          {items.map((g: any, idx: number) => {
            const palettes = [
              "linear-gradient(135deg, #1e3a8a 0%, #7c3aed 100%)",
              "linear-gradient(135deg, #065f46 0%, #0284c7 100%)",
              "linear-gradient(135deg, #7c2d12 0%, #d97706 100%)",
              "linear-gradient(135deg, #312e81 0%, #db2777 100%)",
            ];
            const bg = palettes[idx % palettes.length];
            const modeLabel = GAME_MODES.find(([k]) => k === g.mode)?.[1] || g.mode || "O‘yin";
            return (
              <article className="mg-game-card" key={g.id}>
                <div
                  className="mg-game-cover"
                  style={
                    g.cover_url
                      ? { backgroundImage: `linear-gradient(180deg, rgba(13,21,38,0.15), rgba(13,21,38,0.85)), url(${g.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }
                      : { background: bg }
                  }
                >
                  <span className="mg-game-mode-pill">{modeLabel}</span>
                  {!g.cover_url && <Gamepad2 size={34} color="rgba(255,255,255,0.85)" />}
                </div>
                <div className="mg-game-body">
                  <div className="mg-game-meta">
                    <span>{g.category || "Viktorina"}</span>
                    <span>{Number(g.plays_count || 0)} marta o‘ynalgan</span>
                  </div>
                  <h3>{g.title}</h3>
                  {g.description && <p>{g.description}</p>}
                  <button
                    type="button"
                    className="mg-game-play-btn"
                    onClick={() => launchGame(g)}
                  >
                    <Play size={15} fill="currentColor" /> O‘ynash
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
