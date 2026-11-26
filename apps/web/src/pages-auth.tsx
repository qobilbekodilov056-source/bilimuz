import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  LockKeyhole,
  Presentation,
  Send,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";
import { Busy, ErrorBox, Field, useData } from "./ui";
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}
export function Challenge({
  siteKey,
  action,
  onToken,
  version,
}: {
  siteKey: string;
  action: string;
  onToken: (s: string) => void;
  version: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  callback.current = onToken;
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let widget = "",
      disposed = false;
    const render = () => {
      if (disposed || !ref.current || !window.turnstile) return;
      widget = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        action,
        theme: "light",
        callback: (v: string) => callback.current(v),
        "expired-callback": () => callback.current(""),
        "error-callback": () => callback.current(""),
      });
    };
    let script = document.querySelector<HTMLScriptElement>("#turnstile-script");
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.id = "turnstile-script";
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.append(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      disposed = true;
      script?.removeEventListener("load", render);
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, action, version]);
  return (
    <div className="challenge" ref={ref} aria-label="Xavfsizlik tekshiruvi" />
  );
}
export function AuthPage({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "owner";
}) {
  const config = useData("/api/v2/config");
  const me = useData("/api/v2/auth/me");
  const navAuto = useNavigate();
  useEffect(() => {
    const u = me.data?.user;
    if (!u) return;
    if (mode === "login" || mode === "register") {
      navAuto(u.scope === "owner" ? "/owner" : u.account_type === "learner" ? "/learner" : "/studio", { replace: true });
    } else if (mode === "owner" && u.scope === "owner") {
      navAuto("/owner", { replace: true });
    }
  }, [me.data, mode, navAuto]);
  const [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [challenge, setChallenge] = useState(""),
    [version, setVersion] = useState(0),
    [accountType, setAccountType] = useState<"teacher" | "learner">("learner"),
    [roleChosen, setRoleChosen] = useState(false),
    [consent, setConsent] = useState(false),
    [phone, setPhone] = useState(false),
    [action, setAction] = useState(mode === "owner" ? "owner" : mode);
  useEffect(() => {
    setAction(mode === "owner" ? "owner" : mode);
    setRoleChosen(false);
    setError(null);
    setMessage("");
  }, [mode]);
  const form = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const title = {
    login: "Yana xush kelibsiz.",
    register: "Yangi imkoniyatlar shu yerdan.",
    forgot: "Hisobingizni tiklang.",
    owner: "Owner OS — xavfsiz kirish.",
  }[mode];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const path = mode === "owner" ? "owner-login" : mode;
      const payload =
        mode === "register"
          ? {
              email: data.email,
              password: data.password,
              display_name: data.display_name,
              workplace: data.workplace || "",
              account_type: accountType,
              consent,
              turnstile_token: challenge,
            }
          : mode === "forgot"
            ? { email: data.email, turnstile_token: challenge }
            : {
                email: data.email,
                password: data.password,
                ...(mode === "owner" ? { otp: data.otp } : {}),
                turnstile_token: challenge,
              };
      const result = await api("/api/v2/auth/" + path, {
        method: "POST",
        data: payload,
      });
      if (mode === "owner") {
        navigate("/owner");
      } else if (mode === "login" || result?.auto_logged_in) {
        navigate(result?.account_type === "learner" ? "/learner" : "/studio");
      } else {
        setMessage(result.message);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setChallenge("");
      setVersion((v) => v + 1);
    }
  }
  async function telegram() {
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/v2/auth/telegram/start", {
        method: "POST",
        data: { consent, phone_consent: phone, turnstile_token: challenge },
      });
      window.location.assign(result.url);
    } catch (e) {
      setError(e);
      setBusy(false);
      setChallenge("");
      setVersion((v) => v + 1);
    }
  }
  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const email = String(new FormData(form.current!).get("email"));
      const r = await api("/api/v2/auth/resend", {
        method: "POST",
        data: { email, turnstile_token: challenge },
      });
      setMessage(r.message);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setChallenge("");
      setVersion((v) => v + 1);
    }
  }
  if (config.loading) return <Busy />;
  if (config.error)
    return <ErrorBox error={config.error} retry={config.reload} />;
  const cfg = config.data;
  const canSubmit =
    !!challenge &&
    !busy &&
    action !== "telegram" &&
    action !== "resend" &&
    (mode !== "register" || consent) &&
    (mode !== "forgot" || cfg.email_enabled) &&
    (mode !== "register" || cfg.registration_open);
  if (mode === "register" && !roleChosen) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(145deg, #0f2432 0%, #162d3d 55%, #0c5243 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 18px" }}>
        <div style={{ maxWidth: 820, width: "100%", textAlign: "center" }}>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#fff", textDecoration: "none", marginBottom: 20, fontWeight: 700, fontSize: 18 }}>
            <img src="/logo.png" alt="Bilim UZ" style={{ width: 38, height: 38, borderRadius: 10 }} />
            Bilim UZ
          </Link>
          <h1 style={{ color: "#fff", margin: "0 0 10px", fontSize: "clamp(26px, 4vw, 40px)" }}>
            Siz kim sifatida ro‘yxatdan o‘tasiz?
          </h1>
          <p style={{ color: "rgba(255,255,255,0.78)", maxWidth: 520, margin: "0 auto 30px", fontSize: 15.5 }}>
            O‘qituvchi va O‘quvchi/Abituriyent kabinetlari hamda tariflari alohida tuzilgan. O‘zingizga mos yo‘nalishni tanlang:
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 20, textAlign: "left" }}>
            <button
              type="button"
              onClick={() => { setAccountType("learner"); setRoleChosen(true); }}
              style={{ background: "#fff", border: "2px solid transparent", borderRadius: 22, padding: 28, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 20px 44px rgba(0,0,0,0.22)" }}
            >
              <span style={{ width: 54, height: 54, borderRadius: 16, background: "#ecfdf5", color: "#0c8066", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><GraduationCap size={28} /></span>
              <strong style={{ fontSize: 22, color: "#11191e" }}>O‘quvchi / Abituriyent</strong>
              <p style={{ margin: 0, color: "#475569", fontSize: 14.5, lineHeight: 1.55 }}>
                IELTS, DTM, fan testlarini yechish, elektron kitob va qo‘llanmalarni o‘qish, natijalarni kuzatish hamda shaxsiy kutubxona yig‘ish uchun.
              </p>
              <span style={{ marginTop: "auto", paddingTop: 10, color: "#0c8066", fontWeight: 700, fontSize: 14.5 }}>
                Abituriyent sifatida davom etish →
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setAccountType("teacher"); setRoleChosen(true); }}
              style={{ background: "#fff", border: "2px solid transparent", borderRadius: 22, padding: 28, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 20px 44px rgba(0,0,0,0.22)" }}
            >
              <span style={{ width: 54, height: 54, borderRadius: 16, background: "#eef2f6", color: "#162d3d", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Presentation size={28} /></span>
              <strong style={{ fontSize: 22, color: "#11191e" }}>O‘qituvchi / O‘quv markazi</strong>
              <p style={{ margin: 0, color: "#475569", fontSize: 14.5, lineHeight: 1.55 }}>
                Shaxsiy workspace yaratish, Excel’dan 100 ta test yuklash, guruhlar, kurs jurnali, vazifalar va ota-ona Telegram botini boshqarish uchun.
              </p>
              <span style={{ marginTop: "auto", paddingTop: 10, color: "#162d3d", fontWeight: 700, fontSize: 14.5 }}>
                O‘qituvchi sifatida davom etish →
              </span>
            </button>
          </div>
          <p style={{ marginTop: 24, color: "rgba(255,255,255,0.75)", fontSize: 14 }}>
            Allaqachon hisobingiz bormi? <Link to="/login" style={{ color: "#7cf2d2", fontWeight: 700 }}>Kirish</Link>
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <Link to="/" className="back-link">
          <ArrowLeft size={17} />
          Bosh sahifa
        </Link>
        <div>
          <span className="eyebrow">BILIM UZ</span>
          <h1>
            Har bir savol —<br />
            yangi imkoniyat.
          </h1>
          <p>
            Tartibli savollar bazasi. Xotirjam o‘tadigan imtihon. Tushunarli
            natijalar.
          </p>
          <div className="auth-seal">
            <ShieldCheck size={25} />
            <span>
              Shaxsiy workspace
              <br />
              <small>Ma’lumotlaringiz o‘zingizga tegishli</small>
            </span>
          </div>
        </div>
        <span>O‘QITUVCHINING ISHONCHLI ISH MAYDONI</span>
      </section>
      <section className="auth-form">
        <div className="auth-brand">
          <img className="brand-logo" src="/logo.png" alt="Bilim UZ" />
          Bilim <b>UZ</b>
        </div>
        <h2>{title}</h2>
        <p>
          {mode === "register"
            ? "O‘z savollaringiz, guruhlaringiz va testlaringiz uchun shaxsiy maydon yarating."
            : mode === "owner"
              ? "Platforma egasi uchun parol va bir martalik MFA kodi."
              : "Davom etish uchun hisobingizni tasdiqlang."}
        </p>
        {message && (
          <div className="success-box" role="status">
            <CheckCircle2 />
            {message}
          </div>
        )}
        {!!error && <ErrorBox error={error} />}
        <form ref={form} onSubmit={submit}>
          {mode === "register" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <button
                type="button"
                onClick={() => setAccountType("learner")}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: accountType === "learner" ? "2px solid #0c8066" : "1.5px solid #d5e0e5",
                  background: accountType === "learner" ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "#11191e", display: "inline-flex", alignItems: "center", gap: 6 }}><GraduationCap size={16} color="#0c8066" /> O‘quvchi / Abituriyent</div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>Testlar, IELTS/DTM va kutubxona</div>
              </button>
              <button
                type="button"
                onClick={() => setAccountType("teacher")}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: accountType === "teacher" ? "2px solid #0c8066" : "1.5px solid #d5e0e5",
                  background: accountType === "teacher" ? "#ecfdf5" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: "#11191e", display: "inline-flex", alignItems: "center", gap: 6 }}><Presentation size={16} color="#162d3d" /> O‘qituvchi / Markaz</div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>Workspace, guruhlar va jurnal</div>
              </button>
            </div>
          )}
          {mode === "register" && (
            <>
              <Field label="Ism va familiya">
                <input
                  name="display_name"
                  required
                  minLength={3}
                  maxLength={120}
                  autoComplete="name"
                />
              </Field>
              <Field label="Ish joyi (ixtiyoriy)">
                <input
                  name="workplace"
                  maxLength={160}
                  autoComplete="organization"
                />
              </Field>
            </>
          )}
          <Field label="Email manzil">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="siz@example.com"
            />
          </Field>
          {mode !== "forgot" && (
            <Field
              label="Parol"
              hint={
                mode === "register"
                  ? "8–16 ta belgi (kamida 8 ta belgi ishlating."
                  : undefined
              }
            >
              <input
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 8 : 1}
                maxLength={mode === "register" ? 16 : 128}
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
              />
            </Field>
          )}
          {mode === "owner" && (
            <Field label="MFA kodi (ixtiyoriy)">
              <input
                name="otp"
                inputMode="numeric"
                pattern="([0-9]{6})?"
                maxLength={6}
                placeholder="Bo‘sh qoldirish mumkin"
                autoComplete="one-time-code"
              />
            </Field>
          )}
          {(mode === "register" || mode === "login") && (
            <>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  <Link to="/privacy" target="_blank">
                    Maxfiylik va foydalanish qoidalari
                  </Link>
                  ga roziman.
                </span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={phone}
                  onChange={(e) => setPhone(e.target.checked)}
                />
                <span>
                  Telegramdan tasdiqlangan telefonimni ulashishga roziman
                  (ixtiyoriy).
                </span>
              </label>
            </>
          )}
          {!cfg.turnstile_site_key && (
            <p className="notice">
              Kirish xizmati hali ochilmagan. Keyinroq qayta urinib ko‘ring.
            </p>
          )}
          <Challenge
            siteKey={cfg.turnstile_site_key}
            action={action}
            onToken={setChallenge}
            version={version}
          />
          {action !== "telegram" && action !== "resend" && (
            <button className="btn primary full" disabled={!canSubmit}>
              {busy
                ? "Kutilmoqda…"
                : mode === "register"
                  ? accountType === "learner"
                    ? "Abituriyent kabinetini ochish"
                    : "Workspace yaratish"
                  : mode === "forgot"
                    ? "Tiklash havolasini yuborish"
                    : "Hisobga kirish"}
              <ArrowRight size={17} />
            </button>
          )}
          {(mode === "login" || mode === "register") && (
            <>
              <div className="form-divider">yoki</div>
              <button
                type="button"
                className="btn telegram full"
                disabled={
                  busy ||
                  !cfg.telegram_enabled ||
                  (mode === "register" && !consent) ||
                  !challenge
                }
                onClick={() => void telegram()}
              >
                <Send size={18} />
                {busy
                  ? "Telegramga o‘tilmoqda…"
                  : !challenge
                    ? "Tekshirilmoqda…"
                    : "Telegram orqali kirish"}
              </button>
            </>
          )}
          {action === "resend" && (
            <button
              type="button"
              className="btn secondary full"
              disabled={!challenge || busy}
              onClick={() => void resend()}
            >
              Tasdiqlash xatini qayta yuborish
            </button>
          )}
        </form>
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <Link to="/register">Yangi hisob yaratish</Link>
              <Link to="/forgot-password">Parolni unutdingizmi?</Link>
              <button
                onClick={() => {
                  setAction("resend");
                  setChallenge("");
                }}
              >
                Tasdiqlash xatini qayta yuborish
              </button>
            </>
          ) : (
            <Link to="/login">Kirishga qaytish</Link>
          )}
        </div>
        <div className="secure-note">
          <LockKeyhole size={14} />
          Sessiya xavfsiz cookie bilan himoyalangan
        </div>
      </section>
    </div>
  );
}
export function TokenPage({ mode }: { mode: "verify" | "reset" }) {
  const [raw] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );
  const [message, setMessage] = useState(""),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    history.replaceState(null, "", window.location.pathname);
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/v2/auth/" + mode, {
        method: "POST",
        data: {
          token: raw,
          ...(mode === "reset"
            ? { password: new FormData(e.currentTarget).get("password") }
            : {}),
        },
      });
      setMessage(
        mode === "verify"
          ? "Email tasdiqlandi. Endi kirishingiz mumkin."
          : "Parol yangilandi. Qaytadan kiring.",
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="token-page">
      <ShieldCheck size={40} />
      <h1>
        {mode === "verify" ? "Emailni tasdiqlash" : "Yangi parol o‘rnatish"}
      </h1>
      {!!error && <ErrorBox error={error} />}{" "}
      {message ? (
        <div className="success-box">
          {message}
          <Link to="/login">Kirish</Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          {mode === "reset" && (
            <Field label="Yangi parol">
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={16}
                required
                autoComplete="new-password"
              />
            </Field>
          )}
          <button className="btn primary" disabled={!raw || busy}>
            {busy ? "Kutilmoqda…" : "Tasdiqlash"}
          </button>
        </form>
      )}
      <Link to="/login">Kirishga qaytish</Link>
    </div>
  );
}
