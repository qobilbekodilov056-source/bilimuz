import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Clock3,
  CloudOff,
  Download,
  Flag,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { api, uuidToken, ApiError } from "./api";
import { openCertificatePrint } from "./cert-pdf";
import { Busy, ErrorBox, Field, Modal, Pill, useData } from "./ui";
type Answer = {
  position: number;
  selected: string[];
  revision: number;
  active_time_ms: number;
};
type ExamSession = { attempt_id: string; key: string };
export function ExamPage() {
  const { slug = "" } = useParams();
  const storageKey = "testlab:exam:" + slug;
  const [session, setSession] = useState<ExamSession | null>(() => {
      try {
        return JSON.parse(sessionStorage.getItem(storageKey) || "null");
      } catch {
        return null;
      }
    }),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const card = useData("/api/v2/public/cards/" + encodeURIComponent(slug));
  const [resumeKey] = useState(() => {
    const key = sessionStorage.getItem(storageKey + ":start") || uuidToken();
    sessionStorage.setItem(storageKey + ":start", key);
    return key;
  });
  async function start(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const form = Object.fromEntries(new FormData(e.currentTarget));
      const r = await api(
        "/api/v2/public/cards/" + encodeURIComponent(slug) + "/attempts",
        {
          method: "POST",
          data: {
            name: form.name,
            student_code: form.student_code || "",
            pin: form.pin || "",
            resume_key: resumeKey,
          },
        },
      );
      const s = { attempt_id: r.attempt_id, key: resumeKey };
      sessionStorage.setItem(storageKey, JSON.stringify(s));
      if (card.data?.card?.require_fullscreen && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      setSession(s);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (session)
    return (
      <ActiveExam
        session={session}
        slug={slug}
        leave={() => {
          sessionStorage.removeItem(storageKey);
          sessionStorage.removeItem(storageKey + ":start");
          location.assign("/t/" + encodeURIComponent(slug));
        }}
      />
    );
  return (
    <div className="exam-join">
      <Link to="/" className="back-link">
        <ArrowLeft size={17} />
        Bilim UZ
      </Link>
      {card.loading ? (
        <Busy />
      ) : card.error ? (
        <ErrorBox error={card.error} retry={card.reload} />
      ) : (
        <div className="exam-join-grid">
          <section>
            <span className="eyebrow">STUDENT EXAM</span>
            <h1>{card.data.card.title}</h1>
            <p>{card.data.card.description}</p>
            {card.data.card.reward && (
              <div className="reward-banner">
                <strong>🏆 Yutuq:</strong> {card.data.card.reward}
              </div>
            )}
            {card.data.card.anti_cheat && card.data.card.anti_cheat !== "off" && (
              <div className="anticheat-join-note">
                <strong>🛡 Imtihon nazorati yoqilgan:</strong>{" "}
                {card.data.card.anti_cheat === "strict"
                  ? `Boshqa tab/oynaga o‘tish, sichqonchani oynadan chiqarish yoki nusxalash qayd etiladi. ${card.data.card.max_violations || 3} marta qoidabuzarlikda test avtomatik yakunlanadi.`
                  : "Boshqa tab/oynaga o‘tish, sichqonchani oynadan chiqarish va nusxalash urinishlari o‘qituvchi hisobotida qayd etiladi."}
              </div>
            )}
            <div className="exam-rules">
              <span>
                <BookOpen />
                {card.data.card.question_count} ta savol
              </span>
              <span>
                <Clock3 />
                {card.data.card.duration_minutes} daqiqa
              </span>
              <span>
                <Flag />
                {card.data.card.pass_percent}% o‘tish chegarasi
              </span>
            </div>
            <div className="notice">
              <ShieldCheck size={20} />
              <p>
                Vaqt serverda hisoblanadi. Sahifa yangilansa test davom etadi.
                Javoblarning saqlanish holatiga e’tibor bering. Ismingiz va
                natijangiz o‘qituvchingizda saqlanadi.
              </p>
            </div>
            {card.data.card.starts_at && (
              <p>
                Boshlanish:{" "}
                {new Date(card.data.card.starts_at * 1000).toLocaleString(
                  "uz-UZ",
                )}
              </p>
            )}
            {card.data.card.ends_at && (
              <p>
                Tugash:{" "}
                {new Date(card.data.card.ends_at * 1000).toLocaleString(
                  "uz-UZ",
                )}
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Testga kirish</h2>
            {!!error && <ErrorBox error={error} />}
            <form onSubmit={start}>
              <Field label="Ism va familiya">
                <input
                  name="name"
                  autoComplete="name"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </Field>
              <Field
                label={
                  card.data.card.roster_required
                    ? "O‘quvchi kodi"
                    : "O‘quvchi kodi (ixtiyoriy)"
                }
              >
                <input
                  name="student_code"
                  required={card.data.card.roster_required}
                  placeholder="Masalan: K48291"
                  maxLength={64}
                  autoComplete="off"
                />
              </Field>
              {card.data.card.access_mode === "pin" && (
                <Field label="Test PIN kodi">
                  <input
                    name="pin"
                    type="password"
                    minLength={4}
                    maxLength={32}
                    required
                    autoComplete="off"
                  />
                </Field>
              )}
              <label className="check-field">
                <input type="checkbox" required />
                <span>
                  <Link to="/privacy" target="_blank">
                    Maxfiylik qoidalari
                  </Link>{" "}
                  va test tartibini o‘qidim.
                </span>
              </label>
              <button
                className="btn primary full"
                disabled={busy || card.data.card.status !== "active"}
              >
                {busy ? "Boshlanmoqda…" : "Testni boshlash"}
                <ArrowRight size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function ActiveExam({
  session,
  slug,
  leave,
}: {
  session: ExamSession;
  slug: string;
  leave: () => void;
}) {
  const endpoint = "/api/v2/public/attempts/" + session.attempt_id;
  const [data, setData] = useState<any>(null),
    [result, setResult] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [index, setIndex] = useState(0),
    [seconds, setSeconds] = useState(0),
    [saveState, setSaveState] = useState("saved"),
    [confirm, setConfirm] = useState(false),
    [finishing, setFinishing] = useState(false),
    [violations, setViolations] = useState(0),
    [alertBanner, setAlertBanner] = useState<{ text: string; count: number; needFs?: boolean } | null>(null);
  const pending = useRef<Record<number, Answer>>({}),
    snapshot = useRef<any>(null),
    running = useRef<Promise<boolean> | null>(null),
    clock = useRef({ server: 0, local: 0 }),
    activeSince = useRef(performance.now()),
    activeIndex = useRef(0),
    autoFinishing = useRef(false),
    mounted = useRef(true),
    violationsRef = useRef(0),
    lastLeaveRef = useRef(0),
    awayStartRef = useRef<number | null>(null),
    mouseTimerRef = useRef<any>(null);
  const pendingKey = "testlab:pending:" + session.attempt_id;
  function persist() {
    sessionStorage.setItem(pendingKey, JSON.stringify(pending.current));
  }
  function setSnapshot(value: any) {
    snapshot.current = value;
    setData(value);
  }
  async function load() {
    setError(null);
    try {
      const d = await api(endpoint, { token: session.key });
      clock.current = { server: d.server_time, local: performance.now() };
      let saved: Record<number, Answer> = {};
      try {
        saved = JSON.parse(sessionStorage.getItem(pendingKey) || "{}");
      } catch {
        saved = {};
      }
      if (d.attempt.status === "active") {
        for (const q of d.questions) {
          const p = saved[q.position];
          if (p && p.revision > q.revision) {
            q.answer = p.selected;
            q.revision = p.revision;
            q.active_time_ms = p.active_time_ms;
          } else delete saved[q.position];
        }
        pending.current = saved;
        setSaveState(Object.keys(saved).length ? "pending" : "saved");
      }
      setSnapshot(d);
      setSeconds(Math.max(0, d.attempt.expires_at - d.server_time));
      if (d.attempt.status === "submitted") {
        setResult(await api(endpoint + "/result", { token: session.key }));
        sessionStorage.removeItem(pendingKey);
      }
    } catch (e) {
      setError(e);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [session.attempt_id]);
  function queue(position: number, selected: string[], activeTime?: number) {
    const d = snapshot.current;
    if (!d || d.attempt.status !== "active") return;
    const q = d.questions.find((x: any) => x.position === position);
    const updated = {
      position,
      selected,
      revision: q.revision + 1,
      active_time_ms: activeTime ?? q.active_time_ms,
    };
    pending.current[position] = updated;
    q.answer = selected;
    q.revision = updated.revision;
    q.active_time_ms = updated.active_time_ms;
    setSnapshot({ ...d, questions: [...d.questions] });
    setSaveState("pending");
    persist();
  }
  async function flush() {
    if (running.current) return running.current;
    const items = Object.values(pending.current);
    if (!items.length) return true;
    const request = (async () => {
      try {
        setSaveState("saving");
        const r = await api(endpoint + "/answers", {
          method: "PUT",
          token: session.key,
          data: { answers: items },
        });
        for (const a of items) {
          const ack = r.revisions.find((x: any) => x.position === a.position);
          const revision = ack?.revision;
          if (
            revision > a.revision &&
            ack.selected_json !== JSON.stringify([...a.selected].sort())
          )
            void load();
          if (
            revision >= a.revision &&
            pending.current[a.position]?.revision === a.revision
          )
            delete pending.current[a.position];
        }
        persist();
        if (mounted.current)
          setSaveState(
            Object.keys(pending.current).length ? "pending" : "saved",
          );
        return true;
      } catch (e) {
        if (mounted.current) {
          setSaveState("offline");
          if (e instanceof ApiError && e.status === 409) {
            void load();
          } else setError(e);
        }
        return false;
      } finally {
        running.current = null;
      }
    })();
    running.current = request;
    return request;
  }
  function collectTime() {
    const d = snapshot.current;
    if (!d || d.attempt.status !== "active") return;
    const current = performance.now();
    const elapsed =
      document.visibilityState === "visible"
        ? Math.max(0, Math.min(current - activeSince.current, 30000))
        : 0;
    activeSince.current = current;
    if (elapsed > 0) {
      const q = d.questions[activeIndex.current];
      queue(q.position, q.answer, q.active_time_ms + Math.round(elapsed));
    }
  }
  useEffect(() => {
    const saveTimer = setInterval(() => {
      if (Object.keys(pending.current).length) void flush();
    }, 1800);
    const activityTimer = setInterval(collectTime, 15000);
    const online = () => void flush();
    const hide = () => {
      collectTime();
      persist();
    };
    window.addEventListener("online", online);
    window.addEventListener("pagehide", hide);
    const visibility = () => {
      activeSince.current = performance.now();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(saveTimer);
      clearInterval(activityTimer);
      window.removeEventListener("online", online);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [session.attempt_id]);
  async function finish(expired = false, autoSubmitted = false) {
    if (autoFinishing.current || finishing) return;
    autoFinishing.current = true;
    setFinishing(true);
    setError(null);
    collectTime();
    try {
      if (!expired) {
        const saved = await flush();
        if (!saved)
          throw Error(
            "Javoblar hali saqlanmadi. Internetni tekshirib, qayta urinib ko‘ring.",
          );
        if (Object.keys(pending.current).length && !(await flush()))
          throw Error("Oxirgi javobni saqlab bo‘lmadi. Qayta urinib ko‘ring.");
      }
      await api(endpoint + "/finish", {
        method: "POST",
        token: session.key,
        data: { auto_submitted: autoSubmitted },
      });
      await load();
      setConfirm(false);
    } catch (e) {
      setError(e);
    } finally {
      setFinishing(false);
      autoFinishing.current = false;
    }
  }
  useEffect(() => {
    if (!data || data.attempt.status !== "active") return;
    const acMode: string = data.card?.anti_cheat || "monitor";
    if (acMode === "off") return;
    const maxV = Number(data.card?.max_violations ?? 3);
    const reqFs = !!data.card?.require_fullscreen;
    const initialCount = Number(data.attempt?.violations_count || 0);
    if (initialCount > violationsRef.current) {
      violationsRef.current = initialCount;
      setViolations(initialCount);
    }

    const isExtended = Boolean((window.screen as any)?.isExtended);
    if (isExtended) {
      void api(endpoint + "/violation", {
        method: "POST",
        token: session.key,
        data: { type: "multi_screen_info", away_seconds: 0, multi_screen: true },
      }).catch(() => {});
    }

    const REASONS: Record<string, string> = {
      tab_switch: "Boshqa tab yoki dasturga o‘tish aniqlandi!",
      window_blur: "Imtihon oynasidan tashqariga (boshqa brauzer yoki ekranga) o‘tish aniqlandi!",
      mouse_leave: "Sichqoncha imtihon oynasidan tashqariga chiqib ketdi!",
      fullscreen_exit: "To‘liq ekran rejimidan chiqib ketdingiz!",
      copy_attempt: "Imtihon paytida nusxalash va o‘ng tugma menyusi taqiqlangan!",
      devtools: "Dasturchi vositalarini (DevTools) ochish taqiqlangan!",
      split_screen: "Oyna haddan tashqari kichraytirilgan (split-screen aniqlandi)!",
    };

    const report = (type: string, awaySec = 0) => {
      const nowMs = Date.now();
      // 1.5 soniya ichida ketma-ket tab_switch + window_blur dublikatini oldini olish
      if (
        (type === "tab_switch" || type === "window_blur" || type === "mouse_leave") &&
        nowMs - lastLeaveRef.current < 1500
      ) {
        return;
      }
      if (type === "tab_switch" || type === "window_blur" || type === "mouse_leave") {
        lastLeaveRef.current = nowMs;
      }
      const next = violationsRef.current + 1;
      violationsRef.current = next;
      setViolations(next);
      setAlertBanner({
        text: REASONS[type] || "Imtihon qoidasi buzildi!",
        count: next,
        needFs: reqFs && !document.fullscreenElement,
      });
      void api(endpoint + "/violation", {
        method: "POST",
        token: session.key,
        data: {
          type,
          away_seconds: Math.max(0, Math.round(awaySec)),
          multi_screen: isExtended,
        },
      }).catch(() => {});
      if (acMode === "strict" && next >= maxV && !autoFinishing.current) {
        void finish(true, true);
      }
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        awayStartRef.current = Date.now();
        report("tab_switch", 0);
      } else if (awayStartRef.current) {
        const diff = Math.round((Date.now() - awayStartRef.current) / 1000);
        awayStartRef.current = null;
        if (diff > 0) {
          void api(endpoint + "/violation", {
            method: "POST",
            token: session.key,
            data: { type: "multi_screen_info", away_seconds: diff, multi_screen: isExtended },
          }).catch(() => {});
        }
      }
    };

    const onBlur = () => {
      if (document.visibilityState === "visible") {
        awayStartRef.current = awayStartRef.current || Date.now();
        report("window_blur", 0);
      }
    };

    const onFocus = () => {
      if (awayStartRef.current) {
        const diff = Math.round((Date.now() - awayStartRef.current) / 1000);
        awayStartRef.current = null;
        if (diff > 0) {
          void api(endpoint + "/violation", {
            method: "POST",
            token: session.key,
            data: { type: "multi_screen_info", away_seconds: diff, multi_screen: isExtended },
          }).catch(() => {});
        }
      }
    };

    const onMouseLeave = () => {
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
      mouseTimerRef.current = setTimeout(() => {
        if (mounted.current && document.visibilityState === "visible") {
          report("mouse_leave", 2);
        }
      }, 2000);
    };

    const onMouseEnter = () => {
      if (mouseTimerRef.current) {
        clearTimeout(mouseTimerRef.current);
        mouseTimerRef.current = null;
      }
    };

    const onFsChange = () => {
      if (reqFs && !document.fullscreenElement) {
        report("fullscreen_exit", 0);
      } else if (document.fullscreenElement) {
        setAlertBanner((b) => (b ? { ...b, needFs: false } : null));
      }
    };

    const onCopyBlock = (e: Event) => {
      e.preventDefault();
      report("copy_attempt", 0);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        e.key === "F12" ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) ||
        ((e.ctrlKey || e.metaKey) && k === "u")
      ) {
        e.preventDefault();
        report("devtools", 0);
      } else if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "p"].includes(k)) {
        e.preventDefault();
        report("copy_attempt", 0);
      }
    };

    let lastResizeReport = 0;
    const onResize = () => {
      const isDesktop = window.screen.availWidth >= 1024;
      if (isDesktop && window.innerWidth < window.screen.availWidth * 0.72) {
        const nowMs = Date.now();
        if (nowMs - lastResizeReport > 6000) {
          lastResizeReport = nowMs;
          report("split_screen", 0);
        }
      }
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
    document.documentElement.addEventListener("mouseenter", onMouseEnter);
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("contextmenu", onCopyBlock);
    document.addEventListener("copy", onCopyBlock);
    document.addEventListener("cut", onCopyBlock);
    document.addEventListener("paste", onCopyBlock);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);

    return () => {
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.documentElement.removeEventListener("mouseleave", onMouseLeave);
      document.documentElement.removeEventListener("mouseenter", onMouseEnter);
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("contextmenu", onCopyBlock);
      document.removeEventListener("copy", onCopyBlock);
      document.removeEventListener("cut", onCopyBlock);
      document.removeEventListener("paste", onCopyBlock);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [data?.attempt?.status, data?.card?.anti_cheat, session.attempt_id]);

  useEffect(() => {
    if (!data || data.attempt.status !== "active") return;
    const timer = setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil(
          data.attempt.expires_at -
            clock.current.server -
            (performance.now() - clock.current.local) / 1000,
        ),
      );
      setSeconds(left);
      if (!left) void finish(true);
    }, 500);
    return () => clearInterval(timer);
  }, [data?.attempt.status, data?.attempt.expires_at]);
  function navigate(i: number) {
    collectTime();
    activeIndex.current = i;
    setIndex(i);
    activeSince.current = performance.now();
    void flush();
  }
  if (!data)
    return (
      <div className="exam-loading">
        {error ? (
          <>
            <ErrorBox error={error} retry={() => void load()} />
            <button className="btn secondary" onClick={leave}>
              Kirish sahifasiga qaytish
            </button>
          </>
        ) : (
          <Busy />
        )}
      </div>
    );
  if (result) return <ExamResult data={result} slug={slug} />;
  if (data.attempt.status === "submitted")
    return (
      <div className="exam-loading">
        <h1>Natija yuklanmoqda</h1>
        {error ? (
          <ErrorBox error={error} retry={() => void load()} />
        ) : (
          <Busy />
        )}
      </div>
    );
  const q = data.questions[index],
    answered = data.questions.filter((x: any) => x.answer.length > 0).length;
  const choose = (option: string) =>
    queue(
      q.position,
      q.kind === "multiple"
        ? q.answer.includes(option)
          ? q.answer.filter((x: string) => x !== option)
          : [...q.answer, option]
        : [option],
    );
  const acMode: string = data.card?.anti_cheat || "monitor";
  const maxV = Number(data.card?.max_violations ?? 3);
  return (
    <div className={"exam-page" + (acMode !== "off" ? " exam-protected" : "")}>
      {alertBanner && (
        <div className="anticheat-banner" role="alert">
          <div className="anticheat-banner-text">
            <strong>⚠️ OGOHLANTIRISH:</strong> {alertBanner.text}{" "}
            <span className="anticheat-count">
              {acMode === "strict"
                ? `Qoidabuzarlik: ${violations} / ${maxV}${maxV - violations === 1 ? " — yana 1 marta takrorlansa test avtomatik yakunlanadi!" : ""}`
                : `Qayd etilgan qoidabuzarliklar: ${violations}`}
            </span>
          </div>
          <div className="anticheat-banner-actions">
            {alertBanner.needFs && (
              <button
                type="button"
                className="btn tiny anticheat-fs-btn"
                onClick={() => {
                  document.documentElement.requestFullscreen?.().catch(() => {});
                }}
              >
                To‘liq ekranga qaytish
              </button>
            )}
            <button
              type="button"
              className="anticheat-close"
              aria-label="Yopish"
              onClick={() => setAlertBanner(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <header className="exam-header">
        <Link to="/" className="brand compact">
          <img className="brand-logo" src="/logo.png" alt="Bilim UZ" />
          <span>
            Bilim <b>UZ</b>
          </span>
        </Link>
        <span className="exam-student">{data.attempt.student_name}</span>
        <div
          className={"exam-timer " + (seconds < 60 ? "urgent" : "")}
          role="timer"
          aria-label="Qolgan vaqt"
        >
          <Clock3 size={19} />
          {String(Math.floor(seconds / 60)).padStart(2, "0")}:
          {String(seconds % 60).padStart(2, "0")}
        </div>
      </header>
      <div className="exam-body">
        <main className="exam-workspace">
          <div className="exam-context">
            <span>{data.card.title}</span>
            <Pill tone="blue">
              {index + 1} / {data.questions.length}
            </Pill>
          </div>
          <div className="exam-progress">
            <span
              style={{ width: (answered / data.questions.length) * 100 + "%" }}
            />
          </div>
          {!!error && (
            <ErrorBox
              error={error}
              retry={() => {
                setError(null);
                void flush();
              }}
            />
          )}
          <div className="question-top">
            <span className="eyebrow">SAVOL {index + 1}</span>
            <span>{q.points} ball</span>
          </div>
          <h1 className="exam-question">{q.title}</h1>
          {q.image_url && <img className="exam-q-image" src={q.image_url} alt="Savol rasmi" />}
          {q.code && <pre className="exam-code">{q.code}</pre>}
          <p className="muted">
            {q.kind === "multiple"
              ? "Bir nechta to‘g‘ri javobni belgilang."
              : "Bitta to‘g‘ri javobni belgilang."}
          </p>
          <fieldset className="exam-options">
            <legend className="sr-only">Javob variantlari</legend>
            {q.options.map((o: any) => (
              <label
                key={o.id}
                className={
                  "exam-option " + (q.answer.includes(o.id) ? "selected" : "")
                }
              >
                <input
                  type={q.kind === "multiple" ? "checkbox" : "radio"}
                  name={"question-" + q.position}
                  aria-label={o.id + ". " + o.text}
                  checked={q.answer.includes(o.id)}
                  onChange={() => choose(o.id)}
                  disabled={finishing}
                />
                <span className="option-letter">{o.id}</span>
                <span>{o.text}</span>
                {q.answer.includes(o.id) && <CheckCircle2 size={20} />}
              </label>
            ))}
          </fieldset>
          <div className="exam-navigation">
            <button
              className="btn secondary"
              disabled={index === 0 || finishing}
              onClick={() => navigate(index - 1)}
            >
              <ArrowLeft size={16} />
              Oldingi
            </button>
            <button
              className="btn ghost"
              disabled={!q.answer.length || finishing}
              onClick={() => queue(q.position, [])}
            >
              Javobni tozalash
            </button>
            {index < data.questions.length - 1 ? (
              <button
                className="btn primary"
                disabled={finishing}
                onClick={() => navigate(index + 1)}
              >
                Keyingi
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={finishing}
                onClick={() => setConfirm(true)}
              >
                Yakunlash
                <Flag size={16} />
              </button>
            )}
          </div>
          <div className={"save-state " + saveState} role="status">
            {saveState === "saved" ? (
              <CheckCircle2 size={15} />
            ) : saveState === "offline" ? (
              <CloudOff size={15} />
            ) : (
              <RotateCcw size={15} />
            )}{" "}
            {saveState === "saved"
              ? "Barcha javoblar saqlangan"
              : saveState === "saving"
                ? "Javoblar saqlanmoqda…"
                : saveState === "offline"
                  ? "Ulanish uzildi. Javoblar shu brauzerda saqlanmoqda."
                  : "Saqlash kutilmoqda…"}
          </div>
        </main>
        <aside className="exam-sidebar">
          <div className="panel">
            <h2>Savollar navigatori</h2>
            <p>
              {answered} / {data.questions.length} ta javob berilgan
            </p>
            <div className="question-navigator">
              {data.questions.map((r: any, i: number) => (
                <button
                  key={r.position}
                  aria-label={`${i + 1}-savol${r.answer.length ? ", javob berilgan" : ""}`}
                  aria-current={i === index ? "step" : undefined}
                  className={
                    (r.answer.length ? "answered " : "") +
                    (index === i ? "current" : "")
                  }
                  onClick={() => navigate(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="navigator-legend">
              <span>
                <i className="answered" />
                Javob berilgan
              </span>
              <span>
                <i />
                Javobsiz
              </span>
            </div>
            <button
              className="btn primary full"
              disabled={finishing}
              onClick={() => setConfirm(true)}
            >
              <Flag size={16} />
              Testni yakunlash
            </button>
            <p className="muted">Vaqt tugaganda test avtomatik yakunlanadi.</p>
          </div>
        </aside>
      </div>
      {confirm && (
        <Modal title="Testni yakunlaysizmi?" close={() => setConfirm(false)}>
          <p>
            {data.questions.length - answered} ta savol javobsiz qoldi.
            Yakunlangach javoblarni o‘zgartirib bo‘lmaydi.
          </p>
          {!!error && <ErrorBox error={error} />}
          <div className="modal-actions">
            <button
              className="btn secondary"
              disabled={finishing}
              onClick={() => setConfirm(false)}
            >
              Davom etish
            </button>
            <button
              className="btn primary"
              disabled={finishing}
              onClick={() => void finish()}
            >
              {finishing ? "Yakunlanmoqda…" : "Ha, yakunlash"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
type CertInfo = {
  studentName: string;
  subtitle?: string;
  testTitle: string;
  category?: string;
  percentage: number;
  score: number;
  maxScore: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  passed: boolean;
  reward?: string;
  dateText: string;
  certCode: string;
};

function escHtml(v: string) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}



function downloadCertificatePng(c: CertInfo) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1130;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const accent = c.passed ? "#0f5132" : "#1e3a8a";
  const gold = "#c89b3c";

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1600, 1130);

  // Outer & inner frames
  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  ctx.strokeRect(46, 46, 1508, 1038);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(68, 68, 1464, 994);

  // Top bar
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Bilim UZ", 120, 145);
  ctx.fillStyle = "#64748b";
  ctx.font = "18px sans-serif";
  ctx.fillText("ONLAYN TEST PLATFORMASI", 120, 174);

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748b";
  ctx.font = "18px sans-serif";
  ctx.fillText("Hujjat kodi", 1480, 138);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 24px monospace";
  ctx.fillText(c.certCode, 1480, 170);

  // Center content
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  ctx.font = "bold 74px Georgia, serif";
  ctx.fillText(c.passed ? "SERTIFIKAT" : "NATIJA VARAQASI", 800, 315);

  ctx.fillStyle = "#475569";
  ctx.font = "24px sans-serif";
  ctx.fillText("Ushbu hujjat quyidagi ishtirokchining test natijasini tasdiqlaydi:", 800, 378);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 56px sans-serif";
  ctx.fillText(c.studentName, 800, 470);

  ctx.strokeStyle = gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(460, 492);
  ctx.lineTo(1140, 492);
  ctx.stroke();

  let y = 540;
  if (c.subtitle) {
    ctx.fillStyle = "#64748b";
    ctx.font = "22px sans-serif";
    ctx.fillText(c.subtitle, 800, y);
    y += 50;
  }

  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(c.testTitle, 800, y + 10);
  y += 52;
  if (c.category) {
    ctx.fillStyle = "#64748b";
    ctx.font = "22px sans-serif";
    ctx.fillText("Yo‘nalish: " + c.category, 800, y);
    y += 40;
  }

  // Metric cards
  const boxY = Math.max(660, y + 20);
  const cards = [
    [c.percentage + "%", "Umumiy natija"],
    [c.score + " / " + c.maxScore, "To‘plangan ball"],
    [c.correct + " / " + (c.correct + c.incorrect + c.unanswered), "To‘g‘ri javoblar"],
  ];
  cards.forEach(([val, lbl], i) => {
    const bx = 300 + i * 355;
    ctx.fillStyle = "#f8fafc";
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.fillRect(bx, boxY, 290, 128);
    ctx.strokeRect(bx, boxY, 290, 128);
    ctx.fillStyle = accent;
    ctx.font = "bold 42px sans-serif";
    ctx.fillText(val, bx + 145, boxY + 66);
    ctx.fillStyle = "#64748b";
    ctx.font = "20px sans-serif";
    ctx.fillText(lbl, bx + 145, boxY + 104);
  });

  if (c.passed && c.reward) {
    ctx.fillStyle = "#78350f";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("Yutuq: " + c.reward, 800, boxY + 178);
  }

  // Footer
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(120, 965);
  ctx.lineTo(1480, 965);
  ctx.stroke();

  ctx.fillStyle = "#475569";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Sana: " + c.dateText, 120, 1015);
  ctx.textAlign = "center";
  ctx.fillText("bilimuz.dpdns.org", 800, 1015);
  ctx.textAlign = "right";
  ctx.fillText("Powered by SysOne", 1480, 1015);

  const link = document.createElement("a");
  link.download = (c.passed ? "sertifikat_" : "natija_") + c.studentName.replace(/[^a-zA-Z0-9_-]+/g, "_") + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function ExamResult({ data, slug }: { data: any; slug: string }) {
  const leaderboard = useData(
    "/api/v2/public/cards/" + encodeURIComponent(slug) + "/leaderboard",
  );
  if (data.hidden)
    return (
      <div className="result-page">
        <ShieldCheck size={44} />
        <h1>Test yakunlandi</h1>
        <p>{data.message}</p>
        <Link className="btn secondary" to="/">
          Bosh sahifa
        </Link>
      </div>
    );
  const r = data.result;
  return (
    <div className="result-page">
      <div className="result-hero">
        <CheckCircle2 size={40} />
        <span className="eyebrow">TEST YAKUNLANDI</span>
        <h1>{r.student_name}, natijangiz tayyor.</h1>
        <strong className="result-score">
          {r.percentage}
          <small>%</small>
        </strong>
        <Pill tone={r.passed ? "green" : "amber"}>
          {r.passed
            ? "O‘tish chegarasidan o‘tdingiz"
            : "Yana mashq qilish imkoniyati"}
        </Pill>
        <p>
          {r.score} / {r.max_score} ball · {Math.floor(r.duration_seconds / 60)}{" "}
          daqiqa {r.duration_seconds % 60} soniya
        </p>
        {r.passed && r.reward && (
          <div className="reward-banner">
            <strong>🏆 Tabriklaymiz! Yutuq:</strong> {r.reward}
          </div>
        )}
        {Number(r.earned_coins || 0) > 0 && (
          <div className="reward-banner" style={{ background: "#fef9e7", borderColor: "#f59e0b", color: "#92400e", marginTop: 10 }}>
            <strong>+{r.earned_coins} Bilim Coin</strong> hisobingizga qo‘shildi!{" "}
            <Link to="/student" style={{ fontWeight: 700, color: "#162d3d", marginLeft: 6 }}>Do‘konga o‘tish →</Link>
          </div>
        )}
        <div className="actions" style={{ justifyContent: "center", marginTop: 14 }}>
          <button
            type="button"
            className="btn primary"
            onClick={() =>
              openCertificatePrint({
                studentName: r.student_name,
                testTitle: r.card_title || "Onlayn test (" + slug + ")",
                category: r.card_category || "",
                percentage: r.percentage,
                score: r.score,
                maxScore: r.max_score,
                correct: r.correct_count,
                incorrect: r.incorrect_count,
                unanswered: r.unanswered_count,
                passed: !!r.passed,
                reward: r.reward || "",
                dateText: new Date((r.submitted_at ? Number(r.submitted_at) * 1000 : Date.now())).toLocaleDateString("uz-UZ"),
                certCode: "BUZ-" + String(r.id || slug).slice(0, 8).toUpperCase(),
              })
            }
          >
            <Award size={16} />
            {r.passed ? "Sertifikat (PDF)" : "Natija varaqasi (PDF)"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              downloadCertificatePng({
                studentName: r.student_name,
                testTitle: r.card_title || "Onlayn test (" + slug + ")",
                category: r.card_category || "",
                percentage: r.percentage,
                score: r.score,
                maxScore: r.max_score,
                correct: r.correct_count,
                incorrect: r.incorrect_count,
                unanswered: r.unanswered_count,
                passed: !!r.passed,
                reward: r.reward || "",
                dateText: new Date((r.submitted_at ? Number(r.submitted_at) * 1000 : Date.now())).toLocaleDateString("uz-UZ"),
                certCode: "BUZ-" + String(r.id || slug).slice(0, 8).toUpperCase(),
              })
            }
          >
            <Download size={16} />
            Rasm (PNG)
          </button>
        </div>
      </div>
      <div className="result-stats">
        <span>
          <strong>{r.correct_count}</strong>To‘g‘ri
        </span>
        <span>
          <strong>{r.incorrect_count}</strong>Xato
        </span>
        <span>
          <strong>{r.unanswered_count}</strong>Javobsiz
        </span>
        {r.rank !== null && (
          <span>
            <strong>
              {r.rank}/{r.participants}
            </strong>
            Reyting
          </span>
        )}
      </div>
      <section className="panel">
        <h2>Savollar tahlili</h2>
        <p className="muted">
          O‘rtacha {r.average_question_seconds.toFixed(1)} sek. · Median{" "}
          {r.median_question_seconds.toFixed(1)} sek. {r.telemetry_notice}
        </p>
        {r.questions.length > 0 && !r.questions.some((q: any) => q.correct) && (
          <p className="notice">
            Ushbu test kartasida to‘g‘ri javoblar va izohlarni ko‘rsatish o‘qituvchi tomonidan o‘chirilgan.
          </p>
        )}
        {r.questions.map((q: any) => (
          <article className="result-question" key={q.position}>
            <span>{q.position}</span>
            <div>
              <h3>{q.title}</h3>
              <Pill
                tone={q.is_correct ? "green" : q.answered ? "red" : "neutral"}
              >
                {q.is_correct ? "To‘g‘ri" : q.answered ? "Xato" : "Javobsiz"}
              </Pill>
              {q.image_url && <img className="exam-q-image review-img" src={q.image_url} alt="Savol rasmi" />}
              {q.code && <pre className="code-block">{q.code}</pre>}
              {q.correct && (
                <div className="review-detail">
                  <div className="review-meta">
                    <span>
                      <strong>Sizning javobingiz:</strong>{" "}
                      {q.answer?.length ? q.answer.join(", ") : "Belgilanmagan"}
                    </span>
                    <span>
                      <strong>To‘g‘ri javob:</strong> {q.correct.join(", ")}
                    </span>
                  </div>
                  <div className="review-options">
                    {q.options.map((o: any) => {
                      const picked = (q.answer || []).includes(o.id);
                      const right = q.correct.includes(o.id);
                      const cls = right
                        ? "review-opt is-correct"
                        : picked
                          ? "review-opt is-wrong"
                          : "review-opt";
                      return (
                        <div className={cls} key={o.id}>
                          <strong>{o.id}.</strong> <span>{o.text}</span>
                          {right && picked && <em>✓ Sizning to‘g‘ri javobingiz</em>}
                          {right && !picked && <em>✓ To‘g‘ri javob</em>}
                          {!right && picked && <em>✕ Siz tanlagan javob</em>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="review-explain">
                      <strong>Izoh:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              )}
            </div>
            <small>{(q.active_time_ms / 1000).toFixed(1)} sek.</small>
          </article>
        ))}
      </section>
      {r.rank !== null && leaderboard.data && (
        <section className="panel">
          <h2>Test reytingi</h2>
          <table>
            <thead>
              <tr>
                <th>O‘rin</th>
                <th>O‘quvchi</th>
                <th>Natija</th>
                <th>Vaqt</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.data.items.map((x: any) => (
                <tr key={x.rank}>
                  <td>{x.rank}</td>
                  <td>{x.name}</td>
                  <td>{x.percentage}%</td>
                  <td>{x.duration_seconds} sek.</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {r.anti_cheat !== "off" && (
        <section className={"panel ac-result-panel" + ((r.violations_count || 0) > 0 ? " has-issues" : "")}>
          <div className="ac-result-head">
            <h2>🛡 Imtihon nazorati hisoboti</h2>
            {r.auto_submitted ? (
              <Pill tone="red">Avtomatik yakunlandi ({r.violations_count || 0} ta qoidabuzarlik)</Pill>
            ) : (r.violations_count || 0) > 0 ? (
              <Pill tone="amber">{r.violations_count} ta qoidabuzarlik qayd etildi</Pill>
            ) : (
              <Pill tone="green">Toza — qoidabuzarlik aniqlanmadi</Pill>
            )}
          </div>
          <div className="ac-result-meta">
            <span>
              <strong>Qoidabuzarliklar:</strong> {r.violations_count || 0} ta
            </span>
            <span>
              <strong>Oynadan tashqarida:</strong> {r.away_seconds || 0} soniya
            </span>
            {r.multi_screen && (
              <span className="ac-flag">2-ekran ulangan holatda topshirilgan</span>
            )}
          </div>
          {Array.isArray(r.violation_log) && r.violation_log.length > 0 && (
            <ul className="ac-result-log">
              {r.violation_log.map((ev: any, idx: number) => {
                const labels: Record<string, string> = {
                  tab_switch: "Boshqa tab yoki dasturga o‘tish",
                  window_blur: "Boshqa oyna / ekranga o‘tish",
                  mouse_leave: "Sichqoncha imtihon oynasidan chiqib ketishi",
                  fullscreen_exit: "To‘liq ekran rejimidan chiqish",
                  copy_attempt: "Nusxalash yoki o‘ng tugma urinishi",
                  devtools: "Dasturchi vositalarini (DevTools) ochish urinishi",
                  split_screen: "Oynani kichraytirish (split-screen)",
                };
                const timeText = ev.at
                  ? new Date(Number(ev.at) * 1000).toLocaleTimeString("uz-UZ")
                  : "";
                return (
                  <li key={idx}>
                    <span className="ac-log-time">{timeText}</span>
                    <span>{labels[ev.type] || ev.type}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      <ExamFeedbackBox
        slug={slug}
        studentName={r.student_name}
        scorePercent={r.percentage}
      />
      <Link className="btn secondary" to="/">
        Bosh sahifaga qaytish
      </Link>
    </div>
  );
}

export function PracticeCatalog() {
  const data = useData("/api/v2/public/practice");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("");
  const items: any[] = data.data?.items || [];
  const categories = Array.from(
    new Set(items.map((x) => x.category).filter(Boolean)),
  );
  const filtered = items.filter((x) => {
    if (category && x.category !== category) return false;
    if (
      search &&
      !(x.title + " " + (x.category || "") + " " + x.slug)
        .toLowerCase()
        .includes(search.toLowerCase())
    )
      return false;
    return true;
  });
  return (
    <div className="exam-join">
      <Link to="/" className="back-link">
        <ArrowLeft size={17} />
        Bosh sahifa
      </Link>
      <div className="panel" style={{ marginBottom: 20 }}>
        <span className="eyebrow">RO‘YXATDAN O‘TMASDAN MASHQ</span>
        <h1>Ochiq test kartochkalari</h1>
        <p className="muted">
          O‘zingizga yoqqan testni tanlab ro‘yxatdan o‘tmasdan yechib ko‘ring.
          Ma’lumotlaringiz va natijangiz bazada saqlanmaydi — faqat o‘zingizga ko‘rinadi.
        </p>
        <div className="manual-filters" style={{ marginTop: 14 }}>
          <input
            placeholder="Test nomi yoki kodi bo‘yicha qidirish…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Barcha fanlar</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      {data.loading ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !filtered.length ? (
        <div className="panel">
          <p className="muted">Hozircha ochiq test kartochkalari topilmadi.</p>
        </div>
      ) : (
        <div className="cards-grid">
          {filtered.map((c: any) => (
            <article className="panel test-card" key={c.slug}>
              <div className="test-card-top">
                <Pill tone={Number(c.price_uzs) > 0 ? "amber" : "green"}>
                  {Number(c.price_uzs) > 0 ? `🔒 ${Number(c.price_uzs).toLocaleString("uz-UZ")} so‘m` : (c.category || "Ochiq test")}
                </Pill>
                <small className="muted">{c.slug}</small>
              </div>
              <h2>{c.title}</h2>
              <p>{c.description || "Ro‘yxatdan o‘tmasdan mashq testi"}</p>
              {c.reward && <div className="card-reward">🏆 Yutuq: {c.reward}</div>}
              <div className="test-card-details">
                <span>
                  <BookOpen size={15} />
                  {c.question_count} savol
                </span>
                <span>
                  <Clock3 size={15} />
                  {c.duration_minutes} daqiqa
                </span>
                <span>
                  <Flag size={15} />
                  {c.pass_percent}%
                </span>
              </div>
              <Link
                className="btn primary full"
                to={"/practice/" + encodeURIComponent(c.slug)}
              >
                Testni boshlash
                <ArrowRight size={17} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const UZ_REGIONS = [
  "Toshkent shahri",
  "Toshkent viloyati",
  "Farg‘ona viloyati",
  "Andijon viloyati",
  "Namangan viloyati",
  "Samarqand viloyati",
  "Buxoro viloyati",
  "Qashqadaryo viloyati",
  "Surxondaryo viloyati",
  "Navoiy viloyati",
  "Jizzax viloyati",
  "Sirdaryo viloyati",
  "Xorazm viloyati",
  "Qoraqalpog‘iston Respublikasi",
];

function ExamFeedbackBox({
  slug,
  studentName,
  scorePercent,
}: {
  slug: string;
  studentName: string;
  scorePercent: number;
}) {
  const storageSent = "testlab:commented:" + slug;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(() => sessionStorage.getItem(storageSent) === "1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const list = useData(`/api/v2/public/cards/${encodeURIComponent(slug)}/comments`);

  async function submitComment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/v2/public/cards/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        data: {
          author_name: studentName || "Ishtirokchi",
          rating,
          comment: comment.trim(),
          score_percent: scorePercent,
        },
      });
      sessionStorage.setItem(storageSent, "1");
      setSent(true);
      setComment("");
      list.reload();
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel feedback-panel">
      <div className="feedback-head">
        <h2>💬 Test haqida fikringizni bildiring</h2>
        {list.data && (
          <small className="muted">
            👥 {list.data.market_solves || 0} marta yechilgan
            {list.data.avg_rating ? ` · ★ ${list.data.avg_rating} (${list.data.count} ta fikr)` : ""}
          </small>
        )}
      </div>
      {!!err && <ErrorBox error={err} />}
      {sent ? (
        <p className="notice" style={{ marginBottom: 14 }}>
          Rahmat! Fikringiz va bahoingiz saqlandi.
        </p>
      ) : (
        <form onSubmit={(e) => void submitComment(e)} className="feedback-form">
          <div className="star-picker" role="radiogroup" aria-label="Baho">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={"star-btn" + (n <= rating ? " active" : "")}
                onClick={() => setRating(n)}
              >
                ★
              </button>
            ))}
            <span className="muted" style={{ fontSize: 13 }}>{rating} / 5</span>
          </div>
          <textarea
            rows={2}
            maxLength={400}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Test savollari haqida fikringiz yoki taklifingizni yozing (ixtiyoriy)…"
          />
          <button className="btn primary tiny" disabled={busy}>
            {busy ? "Yuborilmoqda…" : "Fikrni yuborish"}
          </button>
        </form>
      )}
      {list.data?.items?.length > 0 && (
        <div className="comments-list" style={{ marginTop: 14 }}>
          {list.data.items.slice(0, 10).map((cm: any) => (
            <div className="comment-card" key={cm.id}>
              <div className="comment-head">
                <div>
                  <strong>{cm.author_name}</strong>
                  {cm.score_percent !== null && cm.score_percent !== undefined && (
                    <span className="comment-score"> · {cm.score_percent}%</span>
                  )}
                  <span className="comment-stars"> · {"★".repeat(cm.rating)}{"☆".repeat(5 - cm.rating)}</span>
                </div>
                <small className="muted">
                  {new Date(Number(cm.created_at) * 1000).toLocaleDateString("uz-UZ")}
                </small>
              </div>
              {cm.comment && <p className="comment-text">{cm.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PracticeExam() {
  const { slug = "" } = useParams();
  const savedTestTok = typeof localStorage !== "undefined" ? localStorage.getItem("bilimuz_test_unlock_" + slug) || "" : "";
  const [testOrder, setTestOrder] = useState<any>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const pack = useData("/api/v2/public/practice/" + encodeURIComponent(slug) + (savedTestTok ? "?token=" + encodeURIComponent(savedTestTok) : ""));
  useEffect(() => {
    if (!testOrder || testOrder.paid) return;
    const t = setInterval(async () => {
      try {
        const st = await api("/api/v2/public/practice/order/" + encodeURIComponent(testOrder.order_id) + "/status");
        if (st?.paid && st.unlock_token) {
          localStorage.setItem("bilimuz_test_unlock_" + slug, st.unlock_token);
          setTestOrder({ ...testOrder, paid: true });
          pack.reload();
        }
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [testOrder, slug]);
  async function startTestBuy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBuyBusy(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await api("/api/v2/public/practice/" + encodeURIComponent(slug) + "/buy", {
        method: "POST",
        data: {
          buyer_name: String(fd.get("buyer_name") || ""),
          buyer_phone: String(fd.get("buyer_phone") || ""),
          promo_code: String(fd.get("promo_code") || ""),
        },
      });
      if (res?.paid && res?.unlock_token) {
        localStorage.setItem("bilimuz_test_unlock_" + slug, res.unlock_token);
        pack.reload();
        return;
      }
      setTestOrder(res);
    } catch (err) {
      setError(err);
    } finally {
      setBuyBusy(false);
    }
  }
  const [guest, setGuest] = useState<{
    name: string;
    region: string;
    district: string;
    school: string;
    grade: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    region: "",
    district: "",
    school: "",
    grade: "",
  });
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!guest || result || !pack.data) return;
    const totalSec = (pack.data.card.duration_minutes || 20) * 60;
    const id = setInterval(() => {
      const rem = Math.max(0, totalSec - Math.floor((Date.now() - startedAt) / 1000));
      setLeft(rem);
      if (rem === 0) {
        clearInterval(id);
        void submitPractice();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [guest, result, startedAt, pack.data]);

  async function submitPractice() {
    if (busy || !pack.data) return;
    setBusy(true);
    setError(null);
    try {
      const duration = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
      const r = await api(
        "/api/v2/public/practice/" + encodeURIComponent(slug) + "/grade",
        {
          method: "POST",
          data: {
            answers,
            order: pack.data.questions.map((q: any) => q.version_id),
            duration_seconds: duration,
            student_code: (() => {
              try {
                const c = localStorage.getItem("bilimuz_student_code");
                if (c) return c;
                const raw = localStorage.getItem("bilimuz_student_session");
                return raw ? JSON.parse(raw)?.code || "" : "";
              } catch { return ""; }
            })(),
          },
        },
      );
      setResult(r.result);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (pack.loading) return <Busy />;
  if (pack.error)
    return (
      <div className="exam-join">
        <Link to="/practice" className="back-link">
          <ArrowLeft size={17} />
          Ochiq testlar
        </Link>
        <ErrorBox error={pack.error} retry={pack.reload} />
      </div>
    );

  const card = pack.data.card;
  const questions: any[] = pack.data.questions || [];

  if (card?.auth_required) {
    return (
      <div className="exam-join">
        <Link to="/practice" className="back-link">
          <ArrowLeft size={17} />
          Ochiq testlar
        </Link>
        <div className="panel" style={{ maxWidth: 520, margin: "16px auto", textAlign: "center", display: "flex", flexDirection: "column", gap: 14, padding: "32px 24px" }}>
          <Pill tone="blue">🔐 RO‘YXATDAN O‘TISH TALAB ETILADI</Pill>
          <h1 style={{ margin: 0 }}>{card.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {Number(card.price_uzs || 0) > 0
              ? `Bu pullik test (${Number(card.price_uzs).toLocaleString("uz-UZ")} so‘m). Uni alohida sotib olish yoki «Ustoz Pro / Ultra» obunasi orqali ochish uchun avval tizimga kiring.`
              : "Bepul mashq testini yechish va natijalaringizni saqlash uchun 1 daqiqada tizimga kiring."}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
            <Link className="btn primary" to="/login">Kirish</Link>
            <Link className="btn secondary" to="/register">Ro‘yxatdan o‘tish</Link>
          </div>
        </div>
      </div>
    );
  }

  if (card?.locked) {
    return (
      <div className="exam-join">
        <Link to="/practice" className="back-link">
          <ArrowLeft size={17} />
          Ochiq testlar
        </Link>
        <div className="panel" style={{ maxWidth: 540, margin: "16px auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <Pill tone="amber">🔒 PULLIK MAXSUS TEST</Pill>
          <h1 style={{ margin: 0 }}>{card.title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {card.description || "To‘liq savollar, vaqt nazorati, batafsil tahlil va rasmiy QR sertifikat."}
          </p>
          <div className="test-card-details">
            <span>{card.question_count} ta savol</span>
            <span>{card.duration_minutes} daqiqa</span>
            <span><strong>{Number(card.price_uzs || 0).toLocaleString("uz-UZ")} so‘m</strong></span>
          </div>
          {!!error && <ErrorBox error={error} />}
          {!testOrder ? (
            <form onSubmit={startTestBuy} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label>
                Ism-familiyangiz
                <input name="buyer_name" required placeholder="Masalan: Azizbek Karimov" />
              </label>
              <label>
                Telefon raqam (ixtiyoriy)
                <input name="buyer_phone" placeholder="+998 90 123 45 67" />
              </label>
              <label>
                Promokod (bo‘lsa — chegirma yoki bepul)
                <input name="promo_code" placeholder="Masalan: IELTS50" style={{ textTransform: "uppercase" }} />
              </label>
              <button type="submit" className="btn primary full" disabled={buyBusy}>
                {buyBusy ? "Tayyorlanmoqda..." : `Alohida sotib olish — ${Number(card.price_uzs || 0).toLocaleString("uz-UZ")} so‘m`}
              </button>
              <Link to="/studio/billing" className="btn secondary full" style={{ textAlign: "center" }}>
                ⚡ Obuna bilan barcha pullik test va kitoblarni ochish (49 000 so‘m/oy)
              </Link>
            </form>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="panel" style={{ background: "#ecfdf5", borderColor: "#10b981" }}>
                <small className="muted">ANIQ O‘TKAZILADIGAN SUMMA</small>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#065744" }}>
                  {Number(testOrder.unique_amount).toLocaleString("uz-UZ")} so‘m
                </div>
                {testOrder.card_number && (
                  <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                    Karta: <strong>{testOrder.card_number}</strong> ({testOrder.card_holder || testOrder.bank_name})
                  </p>
                )}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
                Click / Payme / Uzum orqali aynan <strong>{Number(testOrder.unique_amount).toLocaleString("uz-UZ")} so‘m</strong> o‘tkazing — tizim 5–15 soniyada avtomatik tasdiqlab testni ochib beradi!
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (result && guest) {
    return (
      <div className="result-page">
        <div className="result-hero">
          <CheckCircle2 size={40} />
          <span className="eyebrow">SHAXSIY NATIJA · BAZADA SAQLANMAYDI</span>
          <h1>{guest.name}, natijangiz tayyor.</h1>
          <p className="muted">
            {guest.region}, {guest.district} · {guest.school} · {guest.grade}
          </p>
          <strong className="result-score">
            {result.percentage}
            <small>%</small>
          </strong>
          <Pill tone={result.passed ? "green" : "amber"}>
            {result.passed
              ? "O‘tish chegarasidan o‘tdingiz"
              : "Yana mashq qilish imkoniyati"}
          </Pill>
          <p>
            {result.score} / {result.max_score} ball ·{" "}
            {Math.floor(result.duration_seconds / 60)} daqiqa{" "}
            {result.duration_seconds % 60} soniya
          </p>
          {result.passed && result.reward && (
            <div className="reward-banner">
              <strong>🏆 Tabriklaymiz! Yutuq:</strong> {result.reward}
            </div>
          )}
          <div className="actions" style={{ justifyContent: "center", marginTop: 14 }}>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                openCertificatePrint({
                  studentName: guest.name,
                  subtitle: [guest.region, guest.district, guest.school, guest.grade].filter(Boolean).join(" · "),
                  testTitle: card.title,
                  category: card.category || "",
                  percentage: result.percentage,
                  score: result.score,
                  maxScore: result.max_score,
                  correct: result.correct_count,
                  incorrect: result.incorrect_count,
                  unanswered: result.unanswered_count,
                  passed: !!result.passed,
                  reward: result.reward || "",
                  dateText: new Date().toLocaleDateString("uz-UZ"),
                  certCode: "PR-" + slug.toUpperCase(),
                })
              }
            >
              <Award size={16} />
              {result.passed ? "Sertifikat (PDF)" : "Natija varaqasi (PDF)"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                downloadCertificatePng({
                  studentName: guest.name,
                  subtitle: [guest.school, guest.region].filter(Boolean).join(" · "),
                  testTitle: card.title,
                  category: card.category || "",
                  percentage: result.percentage,
                  score: result.score,
                  maxScore: result.max_score,
                  correct: result.correct_count,
                  incorrect: result.incorrect_count,
                  unanswered: result.unanswered_count,
                  passed: !!result.passed,
                  reward: result.reward || "",
                  dateText: new Date().toLocaleDateString("uz-UZ"),
                  certCode: "PR-" + slug.toUpperCase(),
                })
              }
            >
              <Download size={16} />
              Rasm (PNG)
            </button>
            <button
              className="btn secondary"
              onClick={() => {
                setResult(null);
                setAnswers({});
                setIndex(0);
                setStartedAt(Date.now());
                setLeft((card.duration_minutes || 20) * 60);
              }}
            >
              Qayta yechish
            </button>
            <Link to="/practice" className="btn secondary">
              Boshqa testlar
            </Link>
          </div>
        </div>
        <div className="result-stats">
          <span>
            <strong>{result.correct_count}</strong>To‘g‘ri
          </span>
          <span>
            <strong>{result.incorrect_count}</strong>Xato
          </span>
          <span>
            <strong>{result.unanswered_count}</strong>Javobsiz
          </span>
        </div>
        <section className="panel">
          <h2>Savollar tahlili</h2>
          {result.questions.map((q: any) => (
            <article className="result-question" key={q.position}>
              <span>{q.position}</span>
              <div>
                <h3>{q.title}</h3>
                <Pill tone={q.is_correct ? "green" : q.answered ? "red" : "neutral"}>
                  {q.is_correct ? "To‘g‘ri" : q.answered ? "Xato" : "Javobsiz"}
                </Pill>
                {q.image_url && <img className="exam-q-image review-img" src={q.image_url} alt="Savol rasmi" />}
              {q.code && <pre className="code-block">{q.code}</pre>}
                <div className="review-detail">
                  <div className="review-meta">
                    <span>
                      <strong>Sizning javobingiz:</strong>{" "}
                      {q.answer?.length ? q.answer.join(", ") : "Belgilanmagan"}
                    </span>
                    <span>
                      <strong>To‘g‘ri javob:</strong> {q.correct.join(", ")}
                    </span>
                  </div>
                  <div className="review-options">
                    {q.options.map((o: any) => {
                      const picked = (q.answer || []).includes(o.id);
                      const right = q.correct.includes(o.id);
                      const cls = right
                        ? "review-opt is-correct"
                        : picked
                          ? "review-opt is-wrong"
                          : "review-opt";
                      return (
                        <div className={cls} key={o.id}>
                          <strong>{o.id}.</strong> <span>{o.text}</span>
                          {right && picked && <em>✓ Sizning to‘g‘ri javobingiz</em>}
                          {right && !picked && <em>✓ To‘g‘ri javob</em>}
                          {!right && picked && <em>✕ Siz tanlagan javob</em>}
                        </div>
                      );
                    })}
                  </div>
                  {q.explanation && (
                    <div className="review-explain">
                      <strong>Izoh:</strong> {q.explanation}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
        <ExamFeedbackBox
          slug={slug}
          studentName={guest.name}
          scorePercent={result.percentage}
        />
      </div>
    );
  }

  if (!guest) {
    return (
      <div className="exam-join">
        <Link to="/practice" className="back-link">
          <ArrowLeft size={17} />
          Ochiq testlar
        </Link>
        <div className="exam-join-grid">
          <section>
            <span className="eyebrow">RO‘YXATDAN O‘TMASDAN MASHQ</span>
            <h1>{card.title}</h1>
            <p>{card.description}</p>
            {card.reward && (
              <div className="reward-banner">
                <strong>🏆 Yutuq:</strong> {card.reward}
              </div>
            )}
            <div className="exam-rules">
              <span>
                <BookOpen />
                {questions.length} ta savol
              </span>
              <span>
                <Clock3 />
                {card.duration_minutes} daqiqa
              </span>
              <span>
                <Flag />
                {card.pass_percent}% o‘tish chegarasi
              </span>
            </div>
            <div className="notice">
              <ShieldCheck size={20} />
              <p>
                Ro‘yxatdan o‘tish talab qilinmaydi. Kiritilgan ma’lumotlaringiz va
                test natijangiz bazada saqlanmaydi — faqat o‘zingiz uchun ekranda ko‘rsatiladi.
              </p>
            </div>
          </section>
          <section className="panel">
            <h2>Ma’lumotlaringizni kiriting</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setGuest({
                  name: form.name.trim(),
                  region: form.region.trim(),
                  district: form.district.trim(),
                  school: form.school.trim(),
                  grade: form.grade.trim(),
                });
                setStartedAt(Date.now());
                setLeft((card.duration_minutes || 20) * 60);
              }}
            >
              <Field label="Ism va familiya">
                <input
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Masalan: Ali Valiyev"
                />
              </Field>
              <div className="form-grid">
                <Field label="Viloyat">
                  <select
                    required
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                  >
                    <option value="">Viloyatni tanlang</option>
                    {UZ_REGIONS.map((rg) => (
                      <option key={rg} value={rg}>
                        {rg}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tuman / shahar">
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value })}
                    placeholder="Masalan: Marg‘ilon shahri"
                  />
                </Field>
              </div>
              <div className="form-grid">
                <Field label="Maktab / o‘quv muassasasi">
                  <input
                    required
                    minLength={2}
                    maxLength={120}
                    value={form.school}
                    onChange={(e) => setForm({ ...form, school: e.target.value })}
                    placeholder="Masalan: 15-maktab"
                  />
                </Field>
                <Field label="Sinf / kurs">
                  <input
                    required
                    minLength={1}
                    maxLength={40}
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value })}
                    placeholder="Masalan: 9-A sinf"
                  />
                </Field>
              </div>
              <button className="btn primary full">
                Testni boshlash
                <ArrowRight size={17} />
              </button>
            </form>
          </section>
        </div>
      </div>
    );
  }

  const q = questions[index];
  const selected = answers[q.version_id] || [];
  const choose = (oid: string) => {
    setAnswers((prev) => {
      const cur = prev[q.version_id] || [];
      const next =
        q.kind === "multiple"
          ? cur.includes(oid)
            ? cur.filter((x) => x !== oid)
            : [...cur, oid]
          : [oid];
      return { ...prev, [q.version_id]: next };
    });
  };
  const answeredCount = questions.filter(
    (x) => (answers[x.version_id] || []).length > 0,
  ).length;
  const mins = String(Math.floor(left / 60)).padStart(2, "0");
  const secs = String(left % 60).padStart(2, "0");

  return (
    <div className="exam-page">
      <header className="exam-header">
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="Bilim UZ" />
          Bilim <b>UZ</b>
        </div>
        <div className="exam-student">
          {guest.name} · {guest.school}
        </div>
        <div className="exam-timer">
          <Clock3 size={18} />
          {mins}:{secs}
        </div>
      </header>
      <div className="exam-body">
        <main className="panel exam-workspace">
          <div className="exam-context">
            <span>{card.title}</span>
            <Pill tone="blue">
              {index + 1} / {questions.length}
            </Pill>
          </div>
          <div className="exam-progress">
            <span
              style={{
                width: Math.round(((index + 1) / (questions.length || 1)) * 100) + "%",
              }}
            />
          </div>
          {!!error && <ErrorBox error={error} />}
          <div className="question-top">
            <span className="eyebrow">SAVOL {index + 1}</span>
            <span>{q.points} ball</span>
          </div>
          <h1 className="exam-question">{q.title}</h1>
          {q.image_url && <img className="exam-q-image" src={q.image_url} alt="Savol rasmi" />}
          {q.code && <pre className="exam-code">{q.code}</pre>}
          <p className="muted">
            {q.kind === "multiple"
              ? "Bir nechta to‘g‘ri javobni belgilang."
              : "Bitta to‘g‘ri javobni belgilang."}
          </p>
          <fieldset className="exam-options">
            <legend className="sr-only">Javob variantlari</legend>
            {q.options.map((o: any) => (
              <label
                key={o.id}
                className={
                  "exam-option " + (selected.includes(o.id) ? "selected" : "")
                }
              >
                <input
                  type={q.kind === "multiple" ? "checkbox" : "radio"}
                  name={"practice-q-" + q.position}
                  checked={selected.includes(o.id)}
                  onChange={() => choose(o.id)}
                  disabled={busy}
                />
                <span className="option-letter">{o.id}</span>
                <span>{o.text}</span>
              </label>
            ))}
          </fieldset>
          <div className="exam-navigation">
            <button
              className="btn secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ArrowLeft size={16} />
              Oldingi
            </button>
            <button
              className="btn ghost"
              onClick={() =>
                setAnswers((prev) => ({ ...prev, [q.version_id]: [] }))
              }
            >
              Javobni tozalash
            </button>
            {index < questions.length - 1 ? (
              <button
                className="btn primary"
                onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
              >
                Keyingi
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void submitPractice()}
              >
                <Flag size={16} />
                {busy ? "Tekshirilmoqda…" : "Testni yakunlash"}
              </button>
            )}
          </div>
        </main>
        <aside className="exam-sidebar">
          <div className="panel">
            <h3>Savollar navigatori</h3>
            <p className="muted">
              {answeredCount} / {questions.length} ta javob berilgan
            </p>
            <div className="question-navigator">
              {questions.map((item: any, idx: number) => (
                <button
                  key={item.version_id}
                  className={
                    (idx === index ? "current " : "") +
                    ((answers[item.version_id] || []).length ? "answered" : "")
                  }
                  onClick={() => setIndex(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <button
              className="btn primary full"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => void submitPractice()}
            >
              <Flag size={16} />
              {busy ? "Tekshirilmoqda…" : "Testni yakunlash"}
            </button>
            <small className="muted" style={{ display: "block", marginTop: 10 }}>
              Natija bazada saqlanmaydi, faqat sizga ko‘rinadi.
            </small>
          </div>
        </aside>
      </div>
    </div>
  );
}
