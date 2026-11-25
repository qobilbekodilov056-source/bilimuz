import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
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
      navAuto(u.scope === "owner" ? "/owner" : "/studio", { replace: true });
    } else if (mode === "owner" && u.scope === "owner") {
      navAuto("/owner", { replace: true });
    }
  }, [me.data, mode, navAuto]);
  const [error, setError] = useState<unknown>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [challenge, setChallenge] = useState(""),
    [version, setVersion] = useState(0),
    [consent, setConsent] = useState(false),
    [phone, setPhone] = useState(false),
    [action, setAction] = useState(mode === "owner" ? "owner" : mode);
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
              workplace: data.workplace,
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
      if (mode === "login" || mode === "owner")
        navigate(mode === "owner" ? "/owner" : "/studio");
      else setMessage(result.message);
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
    (mode === "owner" || mode === "login" || cfg.email_enabled) &&
    (mode !== "register" || cfg.registration_open);
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
                  ? "Kamida 12 ta belgi ishlating."
                  : undefined
              }
            >
              <input
                name="password"
                type="password"
                required
                minLength={mode === "register" ? 12 : 1}
                maxLength={128}
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
                  ? "Workspace yaratish"
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
                minLength={12}
                maxLength={128}
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
