import { Link } from "react-router-dom";
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { api } from "./api";
import { AlertCircle, ArrowRight, Check, LoaderCircle, X, ArrowLeft,
} from "lucide-react";
export const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(t);
  }, [message]);
  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button aria-label="Yopish" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export function Busy() {
  return (
    <div className="busy" role="status">
      <LoaderCircle className="spin" size={25} />
      <span>Ma’lumot yuklanmoqda…</span>
    </div>
  );
}
export function ErrorBox({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>Amal bajarilmadi</strong>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        {retry && (
          <button className="btn secondary" onClick={retry}>
            Qayta urinish
          </button>
        )}
      </div>
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <ArrowRight size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={close} aria-label="Oynani yopish">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id: string;
              "aria-describedby"?: string;
            }>,
            { id, ...(hint ? { "aria-describedby": id + "-hint" } : {}) },
          )
        : children}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"pill " + tone}>{children}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}
export function useData<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
export function useDebounce(value: string, delay = 300) {
  const [v, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return v;
}

let _cachedHomePath: string | null = null;
let _cachedHomeAt = 0;

export function SmartBackLink({
  fallback = "/",
  label = "Orqaga",
  className = "back-link",
  style,
}: {
  fallback?: string;
  label?: string;
  className?: string;
  style?: import("react").CSSProperties;
}) {
  const [target, setTarget] = useState<string>(() => {
    try {
      const code = localStorage.getItem("bilimuz_student_code");
      if (code) return "/student/" + encodeURIComponent(code);
    } catch {}
    if (_cachedHomePath && Date.now() - _cachedHomeAt < 30_000) return _cachedHomePath;
    return fallback;
  });

  useEffect(() => {
    try {
      const code = localStorage.getItem("bilimuz_student_code");
      if (code) {
        setTarget("/student/" + encodeURIComponent(code));
        return;
      }
    } catch {}
    if (_cachedHomePath && Date.now() - _cachedHomeAt < 30_000) {
      setTarget(_cachedHomePath);
      return;
    }
    let alive = true;
    fetch("/api/v2/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!alive) return;
        const u = d?.user;
        const next = !u
          ? fallback
          : u.scope === "owner"
            ? "/owner"
            : u.account_type === "learner"
              ? "/learner"
              : "/studio";
        _cachedHomePath = next;
        _cachedHomeAt = Date.now();
        setTarget(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fallback]);

  return (
    <Link to={target} className={className} style={style}>
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
