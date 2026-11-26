import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Crown,
  Database,
  FileSpreadsheet,
  Lock,
  Package,
  FolderOpen,
  Gift,
  Mail,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  UploadCloud,
  Users,
  Zap, Award, FileText, Printer, RefreshCw, Shield, Trophy } from "lucide-react";
import {
  kindNames,
  levelNames,
  questionSchema,
  cardSchema,
  type Question,
  type CardSettings,
} from "../../../packages/shared/schema";
import { api } from "./api";
import { openCertificatePrint } from "./cert-pdf";
import {
  Busy,
  Empty,
  ErrorBox,
  Field,
  Modal,
  PageTitle,
  Pill,
  useData,
  useDebounce,
  useToast, SmartBackLink } from "./ui";
import { useAccount, usePlan } from "./main";
const base = "/api/v2/teacher";
const date = (n: number) =>
  new Intl.DateTimeFormat("uz-UZ", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(n * 1000));
const statusName: Record<string, string> = {
  active: "Faol",
  draft: "Qoralama",
  closed: "Yopilgan",
  archived: "Arxiv",
  submitted: "Yakunlangan",
  pending: "Ko‘rib chiqilmoqda",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
  changes_requested: "Tahrir kerak",
  revoked: "Bekor qilingan",
};
function Pagination({
  offset,
  setOffset,
  count,
  total,
}: {
  offset: number;
  setOffset: (n: number) => void;
  count: number;
  total?: number;
}) {
  return (
    <div className="pagination">
      <span>
        {total === undefined
          ? `${offset + count} ta ko‘rsatildi`
          : `Jami ${total} ta`}
      </span>
      <div>
        <button
          className="btn tiny secondary"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 30))}
        >
          Oldingi
        </button>
        <button
          className="btn tiny secondary"
          disabled={total !== undefined ? offset + count >= total : count < 30}
          onClick={() => setOffset(offset + 30)}
        >
          Keyingi
        </button>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  Icon,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  Icon: any;
  note: string;
  tone: string;
}) {
  return (
    <div className="metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={"metric-icon " + tone}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
export function Dashboard() {
  const { data, error, loading, reload } = useData(base + "/overview"),
    billing = useData(base + "/billing/status"),
    referral = useData(base + "/referral"),
    toast = useToast(),
    account = useAccount();
  if (loading) return <Busy />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const s = data.stats;
  return (
    <>
      <PageTitle
        eyebrow="SHAXSIY ISH MAYDONINGIZ"
        title="Bilim sari navbatdagi qadam."
        description={`Xush kelibsiz, ${account.user.display_name.split(" ")[0]}. O‘quv jarayoningiz bir qarashda.`}
        actions={
          <>
            <Link className="btn secondary" to="/studio/imports">
              <UploadCloud size={16} />
              Import qilish
            </Link>
          </>
        }
      />
      {billing.data?.plan && (() => {
        const pl = billing.data.plan;
        const exp = Number(pl.expires_at || 0);
        const daysLeft = exp > 0 ? Math.max(0, Math.ceil((exp - Date.now() / 1000) / 86400)) : 0;
        const isPaid = pl.id !== "free";
        return (
          <div className="panel" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: isPaid ? "linear-gradient(135deg, #f0fdf9 0%, #eff6ff 100%)" : "#f8fafc", borderColor: isPaid ? "#7ce0bc" : "var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Pill tone={isPaid ? "green" : "neutral"}>{pl.name}</Pill>
              <span style={{ fontSize: 13.5 }}>
                {isPaid && exp > 0 ? (
                  <>
                    Amal qilish muddati: <strong>{new Date(exp * 1000).toLocaleDateString("uz-UZ")} gacha</strong>{" "}
                    <span className="muted">({daysLeft} kun qoldi)</span>
                  </>
                ) : (
                  <>Bepul tarif · Guruh va o‘quvchilar limitini oshirish uchun tarifni yangilang</>
                )}
              </span>
            </div>
            {(!isPaid || daysLeft <= 5) && (
              <Link to="/pricing" className="btn primary tiny" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {isPaid ? "Tarifni uzaytirish" : <><Zap size={14} /> Upgrade (Pro)</>}
              </Link>
            )}
          </div>
        );
      })()}
      {referral.data?.ref_link && (
        <div
          className="panel"
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            background: "linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)",
            borderColor: "#bbf7d0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Gift size={18} color="#059669" />
            <div>
              <strong style={{ display: "block", fontSize: 14, color: "#065f46" }}>
                Hamkasbingizni taklif qiling — +15 kun Ustoz Pro bepul!
              </strong>
              <small className="muted">
                Taklif havolangiz orqali ro‘yxatdan o‘tib emailini tasdiqlagan har bir o‘qituvchi uchun +15 kun Pro beriladi
                {referral.data.rewarded_count > 0 ? ` · Tasdiqlangan: ${referral.data.rewarded_count} ta (+${referral.data.total_days_earned} kun)` : ""}.
              </small>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn secondary tiny"
              onClick={() => {
                navigator.clipboard?.writeText(referral.data.ref_link).then(() => toast("Taklif havolasi nusxalandi!"));
              }}
            >
              <Copy size={14} /> Havolani nusxalash
            </button>
            <a
              className="btn primary tiny"
              href={`https://t.me/share/url?url=${encodeURIComponent(referral.data.ref_link)}&text=${encodeURIComponent("Bilim UZ — o‘qituvchilar uchun test, jurnal va raqamli kutubxona platformasi! Bepul ro‘yxatdan o‘ting:")}`}
              target="_blank"
              rel="noreferrer"
            >
              <Send size={14} /> Telegram’da ulashish
            </a>
          </div>
        </div>
      )}
      <div className="metrics">
        <Metric
          label="Savollar bazasi"
          value={s.questions}
          Icon={BookOpen}
          note="Faqat sizning savollaringiz"
          tone="blue"
        />
        <Metric
          label="Faol testlar"
          value={s.active_cards}
          Icon={Zap}
          note={`${s.cards} ta jami test kartasi`}
          tone="green"
        />
        <Metric
          label="O‘quvchilar"
          value={s.students}
          Icon={Users}
          note={`${s.groups} ta shaxsiy guruh`}
          tone="amber"
        />
        <Metric
          label="O‘rtacha natija"
          value={`${s.average}%`}
          Icon={BarChart3}
          note={`${s.completed} ta yakunlangan urinish`}
          tone="violet"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-title">
            <div>
              <h2>So‘nggi test urinishlari</h2>
              <p>O‘quvchilaringizning so‘nggi natijalari</p>
            </div>
            <Link to="/studio/analytics" className="text-link">
              Barchasi <ArrowUpRight size={16} />
            </Link>
          </div>
          {!data.recent.length ? (
            <Empty
              title="Birinchi natijani kutamiz"
              text="Test kartasini yarating va havolasini o‘quvchilaringizga ulashing."
              action={
                <Link className="btn secondary" to="/studio/cards">
                  Test kartalari <ArrowRight size={16} />
                </Link>
              }
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>O‘quvchi / test</th>
                    <th>Natija</th>
                    <th>Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.student_name}</strong>
                        <small>{r.card_title}</small>
                      </td>
                      <td>
                        {r.status === "submitted" ? r.percentage + "%" : "—"}
                      </td>
                      <td>
                        <Pill
                          tone={r.status === "submitted" ? "green" : "amber"}
                        >
                          {statusName[r.status]}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="dashboard-side">
          <section className="panel progress-panel">
            <div className="panel-title">
              <h2>O‘quv jarayoni</h2>
              <span className="live-dot">Jonli ma’lumot</span>
            </div>
            <div className="completion-ring">
              <svg
                viewBox="0 0 120 120"
                aria-label={`${s.completed} ta yakunlangan urinish`}
              >
                <circle cx="60" cy="60" r="50" className="ring-bg" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  className="ring-value"
                  strokeDasharray={`${s.attempts ? (s.completed / s.attempts) * 314 : 0} 314`}
                />
              </svg>
              <span>
                <strong>
                  {s.attempts ? s.completed + "/" + s.attempts : "0"}
                </strong>
                <small>yakunlangan</small>
              </span>
            </div>
            <div className="stat-line">
              <span>Jami urinishlar</span>
              <strong>{s.attempts}</strong>
            </div>
            <div className="stat-line">
              <span>O‘rtacha ko‘rsatkich</span>
              <strong>{s.average}%</strong>
            </div>
          </section>
          <Link className="import-banner" to="/studio/imports">
            <span className="banner-icon">
              <FileSpreadsheet size={24} />
            </span>
            <div>
              <strong>Savollaringiz Excelda bormi?</strong>
              <p>
                O‘zbekcha shablon bilan bir necha qadamda bazangizga o‘tkazing.
              </p>
              <span>
                Import markaziga o‘tish <ArrowRight size={15} />
              </span>
            </div>
          </Link>
        </div>
      </div>
      <div className="quick-links">
        <Link to="/studio/questions">
          <BookOpen />
          <span>
            Savollarni tartiblang<small>Fan, mavzu va daraja bo‘yicha</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/studio/groups">
          <FolderOpen />
          <span>
            Guruhlaringizni yarating
            <small>O‘quvchilarni bir joyda boshqaring</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/studio/store">
          <Store />
          <span>
            Bilim ulashing<small>Moderatsiyadan o‘tgan savollar</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </>
  );
}
const initialQuestion: Question = {
  title: "",
  category: "",
  topic: "",
  level: "medium",
  kind: "single",
  code: "",
  image_url: "",
  explanation: "",
  points: 1,
  options: [
    { id: "A", text: "" },
    { id: "B", text: "" },
    { id: "C", text: "" },
    { id: "D", text: "" },
  ],
  correct: ["A"],
};
function QuestionEditor({
  question,
  close,
  saved,
}: {
  question?: any;
  close: () => void;
  saved: () => void;
}) {
  const [q, setQ] = useState<Question>(
      question
        ? (Object.fromEntries(
            Object.keys(initialQuestion).map((k) => [k, question[k]]),
          ) as Question)
        : initialQuestion,
    ),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  const set = (key: keyof Question, value: any) =>
    setQ((v) => ({ ...v, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsed = questionSchema.parse(q);
      await api(base + "/questions" + (question ? "/" + question.id : ""), {
        method: question ? "PUT" : "POST",
        data: parsed,
        headers: question
          ? { "If-Match": String(question.content_version) }
          : {},
      });
      toast("Savol shaxsiy bazangizga saqlandi");
      saved();
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={question ? "Savolni tahrirlash" : "Yangi savol"}
      close={close}
    >
      <form onSubmit={submit}>
        {!!error && <ErrorBox error={error} />}
        <Field label="Savol matni">
          <textarea
            value={q.title}
            onChange={(e) => set("title", e.target.value)}
            minLength={5}
            maxLength={5000}
            required
            rows={3}
          />
        </Field>
        <div className="form-grid">
          <Field label="Fan / kategoriya (Pack)">
            <input
              list="question-pack-suggestions"
              value={q.category}
              onChange={(e) => set("category", e.target.value)}
              required
              maxLength={100}
              placeholder="Masalan: Informatika, Matematika, Kompyuter savodxonligi"
            />
            <datalist id="question-pack-suggestions">
              {["Informatika", "Matematika", "Kompyuter savodxonligi", "Ingliz tili", "Fizika", "Python", "HTML", "CSS"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Mavzu">
            <input
              value={q.topic}
              onChange={(e) => set("topic", e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Qiyinchilik darajasi">
            <select
              value={q.level}
              onChange={(e) => set("level", e.target.value)}
            >
              {Object.entries(levelNames).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Savol turi">
            <select
              value={q.kind}
              onChange={(e) => {
                set("kind", e.target.value);
                if (e.target.value === "truefalse")
                  setQ((v) => ({
                    ...v,
                    kind: "truefalse",
                    options: [
                      { id: "A", text: "To‘g‘ri" },
                      { id: "B", text: "Noto‘g‘ri" },
                    ],
                    correct: ["A"],
                  }));
                else if (e.target.value !== "multiple")
                  set("correct", q.correct.slice(0, 1));
              }}
            >
              {Object.entries(kindNames).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <fieldset className="options-editor">
          <legend>Javob variantlari — to‘g‘risini belgilang</legend>
          {q.options.map((o, i) => (
            <div key={o.id}>
              <label className="correct-checkbox">
                <input
                  aria-label={`${o.id} to‘g‘ri javob`}
                  type={q.kind === "multiple" ? "checkbox" : "radio"}
                  name="correct"
                  checked={q.correct.includes(o.id)}
                  onChange={() =>
                    set(
                      "correct",
                      q.kind === "multiple"
                        ? q.correct.includes(o.id)
                          ? q.correct.filter((x) => x !== o.id)
                          : [...q.correct, o.id]
                        : [o.id],
                    )
                  }
                />
                <b>{o.id}</b>
              </label>
              <input
                aria-label={`${o.id} varianti`}
                required
                maxLength={2000}
                value={o.text}
                onChange={(e) =>
                  set(
                    "options",
                    q.options.map((v, j) =>
                      j === i ? { ...v, text: e.target.value } : v,
                    ),
                  )
                }
              />
              {q.options.length > 2 && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`${o.id} variantini olib tashlash`}
                  onClick={() => {
                    set(
                      "options",
                      q.options.filter((x) => x.id !== o.id),
                    );
                    set(
                      "correct",
                      q.correct.filter((x) => x !== o.id),
                    );
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          {q.options.length < 8 && q.kind !== "truefalse" && (
            <button
              className="btn secondary tiny"
              type="button"
              onClick={() =>
                set("options", [
                  ...q.options,
                  {
                    id: "ABCDEFGH"
                      .split("")
                      .find((x) => !q.options.some((o) => o.id === x))!,
                    text: "",
                  },
                ])
              }
            >
              <Plus size={14} />
              Variant qo‘shish
            </button>
          )}
        </fieldset>
        <Field label="Savol rasmi (ixtiyoriy, PNG/JPG/WebP, maks. 3 MB)">
          <div className="q-img-uploader">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await api(base + "/uploads/image", {
                    method: "POST",
                    form: fd,
                  });
                  set("image_url", res.url);
                } catch (err) {
                  setError(err);
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
            {q.image_url && (
              <div className="q-img-preview">
                <img src={q.image_url} alt="Savol rasmi" />
                <button
                  type="button"
                  className="btn danger tiny"
                  onClick={() => set("image_url", "")}
                >
                  Rasmni olib tashlash
                </button>
              </div>
            )}
          </div>
        </Field>
        {q.kind === "code" && (
          <Field label="Dastur kodi">
            <textarea
              className="code-input"
              value={q.code}
              onChange={(e) => set("code", e.target.value)}
              rows={5}
              maxLength={12000}
            />
          </Field>
        )}
        <Field label="Javob izohi">
          <textarea
            value={q.explanation}
            onChange={(e) => set("explanation", e.target.value)}
            rows={2}
            maxLength={5000}
          />
        </Field>
        <Field label="Ball">
          <input
            type="number"
            min="0.1"
            max="100"
            step="0.1"
            value={q.points}
            onChange={(e) => set("points", +e.target.value)}
            required
          />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={close}>
            Bekor qilish
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saqlanmoqda…" : "Savolni saqlash"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Questions() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || ""),
    [category, setCategory] = useState(""),
    [level, setLevel] = useState(""),
    [offset, setOffset] = useState(0),
    [editor, setEditor] = useState<any>(null),
    [offer, setOffer] = useState<any>(null),
    [consent, setConsent] = useState(false),
    [original, setOriginal] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const [showOfflinePdf, setShowOfflinePdf] = useState(false);
  const debounced = useDebounce(search);
  const result = useData(
    `${base}/questions?q=${encodeURIComponent(debounced)}&category=${encodeURIComponent(category)}&level=${level}&offset=${offset}`,
  );
  const toast = useToast();
  async function runBulk(action: "archive" | "category" | "submit_store") {
    if (!selected.length) return;
    let payload: any = { ids: selected, action };
    if (action === "archive") {
      if (!confirm(`${selected.length} ta savolni arxivga o‘tkazmoqchimisiz?`)) return;
    } else if (action === "category") {
      const cat = prompt("Yangi Fan / kategoriya (Pack) nomini kiriting:");
      if (!cat || !cat.trim()) return;
      payload.category = cat.trim();
    } else if (action === "submit_store") {
      if (!confirm(`${selected.length} ta savolni CC BY 4.0 ochiq litsenziyasi bilan Savollar do‘koni moderatsiyasiga yubormoqchimisiz?`)) return;
      const attr = prompt("Muallif nomi (ixtiyoriy, bo‘sh qoldirish mumkin):") || "";
      payload.attribution = attr.trim();
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api(base + "/questions/bulk", { method: "POST", data: payload });
      setSelected([]);
      result.reload();
      if (action === "archive") toast(`${r.count} ta savol arxivlandi`);
      else if (action === "category") toast(`${r.count} ta savol yangi packga ko‘chirildi`);
      else toast(`${r.submitted} ta savol moderatsiyaga yuborildi` + (r.skipped ? ` (${r.skipped} tasi avval yuborilgan)` : ""));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function archive(q: any) {
    setBusy(true);
    try {
      await api(base + "/questions/" + q.id, { method: "DELETE" });
      result.reload();
      toast("Savol arxivga o‘tkazildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function submitOffer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(base + "/questions/" + offer.id + "/submit-store", {
        method: "POST",
        data: {
          consent,
          original,
          license: "CC-BY-4.0",
          attribution: new FormData(e.currentTarget).get("attribution"),
        },
      });
      setOffer(null);
      toast("Savol Owner moderatsiyasiga yuborildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BILIM KUTUBXONANGIZ"
        title="Savollar bazasi"
        description={`Tarif limiti: ${usePlan().usage.questions} / ${usePlan().plan.max_questions} savol (${usePlan().plan.name}) · Har bir savol shaxsiy. Ulashish — faqat sizning tanlovingiz.`}
        actions={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowOfflinePdf(true)}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><FileText size={15} color="#2563eb" /> Oflayn PDF test</span>
            </button>
            <Link to="/studio/store" className="btn secondary">
              <Database size={16} color="#059669" />
              Umumiy bazadan olish
            </Link>
            <Link to="/studio/imports" className="btn secondary">
              <UploadCloud size={16} />
              Import
            </Link>
            <button className="btn primary" onClick={() => setEditor({})}>
              <Plus size={17} />
              Savol qo‘shish
            </button>
          </>
        }
      />
      <div className="panel">
        <div className="filters">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Savol qidirish"
              placeholder="Savol yoki mavzu qidirish…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>
          <select
            aria-label="Fan bo‘yicha filtrlash"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Barcha fanlar</option>
            {result.data?.categories?.map((s: string) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Daraja bo‘yicha filtrlash"
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Barcha darajalar</option>
            {Object.entries(levelNames).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {!!error && <ErrorBox error={error} />}{" "}
        {result.loading ? (
          <Busy />
        ) : result.error ? (
          <ErrorBox error={result.error} retry={result.reload} />
        ) : !result.data.items.length ? (
          <Empty
            title="Savollar topilmadi"
            text="Yangi savol qo‘shing yoki Excel faylingizdan import qiling."
          />
        ) : (
          <>
            <div className="bulk-bar">
              <label className="check-field" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={
                    result.data.items.length > 0 &&
                    result.data.items.every((q: any) => selected.includes(q.id))
                  }
                  onChange={(e) => {
                    const pageIds = result.data.items.map((q: any) => q.id);
                    setSelected(
                      e.target.checked
                        ? Array.from(new Set([...selected, ...pageIds])).slice(0, 150)
                        : selected.filter((id) => !pageIds.includes(id)),
                    );
                  }}
                />
                <span>
                  {selected.length
                    ? `${selected.length} ta tanlandi`
                    : "Sahifadagilarni belgilash"}
                </span>
              </label>
              {selected.length > 0 && (
                <div className="bulk-actions">
                  <button
                    type="button"
                    className="btn secondary tiny"
                    disabled={busy}
                    onClick={() => void runBulk("category")}
                  >
                    Packni o‘zgartirish
                  </button>
                  <button
                    type="button"
                    className="btn danger tiny"
                    disabled={busy}
                    onClick={() => void runBulk("archive")}
                  >
                    Arxivlash
                  </button>
                  <button
                    type="button"
                    className="btn ghost tiny"
                    onClick={() => setSelected([])}
                  >
                    Bekor qilish
                  </button>
                </div>
              )}
            </div>
            <div className="question-list">
            {result.data.items.map((q: any, i: number) => (
              <article className="question-row" key={q.id}>
                <input
                  type="checkbox"
                  aria-label="Savolni tanlash"
                  checked={selected.includes(q.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, q.id].slice(0, 150)
                        : selected.filter((id) => id !== q.id),
                    )
                  }
                />
                <span className="row-number">
                  {String(offset + i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="question-meta">
                    <span>{q.category}</span>
                    {q.topic && <span> / {q.topic}</span>}
                    <Pill
                      tone={
                        q.level === "easy"
                          ? "green"
                          : q.level === "hard"
                            ? "amber"
                            : "blue"
                      }
                    >
                      {levelNames[q.level]}
                    </Pill>
                  </div>
                  <h3>{q.title}</h3>
                  <small>
                    {kindNames[q.kind]} · {q.options.length} variant ·{" "}
                    {q.points} ball · v{q.content_version}
                  </small>
                </div>
                <div className="row-actions">
                  <button
                    className="icon-btn"
                    aria-label="Savolni tahrirlash"
                    onClick={() => setEditor(q)}
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={busy}
                    aria-label="Savolni arxivlash"
                    onClick={() => void archive(q)}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          </>
        )}
        {result.data && (
          <Pagination
            offset={offset}
            setOffset={setOffset}
            count={result.data.items.length}
            total={result.data.total}
          />
        )}
      </div>
      {showOfflinePdf && (
        <OfflinePdfModal close={() => setShowOfflinePdf(false)} />
      )}
      {editor && (
        <QuestionEditor
          question={editor.id ? editor : undefined}
          close={() => setEditor(null)}
          saved={result.reload}
        />
      )}{" "}
      {offer && (
        <Modal
          title="Savolni Storega taklif qilish"
          close={() => setOffer(null)}
        >
          <p className="notice">
            Tasdiqlangandan so‘ng savol, to‘g‘ri javob va izohlar ommaga
            ochiladi. O‘quvchi natijalari yuborilmaydi.
          </p>
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={submitOffer}>
            <Field label="Muallif nomi (ixtiyoriy)">
              <input name="attribution" maxLength={120} defaultValue="" />
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={original}
                onChange={(e) => setOriginal(e.target.checked)}
              />
              <span>Kontentga huquqim borligini tasdiqlayman.</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                CC BY 4.0 litsenziyasi bilan ommaga chiqarishga roziman.
              </span>
            </label>
            <button
              className="btn primary"
              disabled={!consent || !original || busy}
            >
              Moderatsiyaga yuborish
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function GroupsStudents({ students = false }: { students?: boolean }) {
  const [offset, setOffset] = useState(0),
    [edit, setEdit] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const target = students ? "students" : "groups";
  const result = useData(base + "/" + target + "?offset=" + offset);
  const groups = useData(base + "/groups?limit=100");
  const toast = useToast();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(base + "/" + target + (edit.id ? "/" + edit.id : ""), {
        method: edit.id ? "PUT" : "POST",
        data: students
          ? {
              name: f.name,
              student_code: f.student_code,
              group_id: f.group_id || null,
              note: f.note || "",
            }
          : { name: f.name, description: f.description },
      });
      setEdit(null);
      result.reload();
      if (!students) groups.reload();
      toast("Ma’lumot saqlandi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove(r: any) {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/${target}/${r.id}`, { method: "DELETE" });
      result.reload();
      toast(students ? "O‘quvchi arxivlandi" : "Guruh o‘chirildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="O‘QUV JARAYONI"
        title={students ? "O‘quvchilar" : "Guruhlar"}
        description={(() => {
          const { plan, usage } = usePlan();
          const cur = students ? usage.students : usage.groups;
          const lim = students ? plan.max_students : plan.max_groups;
          return students
            ? `Tarif limiti: ${cur} / ${lim} o‘quvchi (${plan.name}) · Kodlar faqat shu workspace doirasida ishlaydi.`
            : `Tarif limiti: ${cur} / ${lim} guruh (${plan.name}) · O‘quvchilaringizni alohida guruhlarga birlashtiring.`;
        })()}
        actions={
          <>
            {students && (
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Eski qisqa kodli barcha o‘quvchilarga yangi 1 harf + 5 raqamli (masalan: K48291) kod berilsinmi?")) return;
                  setBusy(true);
                  try {
                    const res = await api(base + "/students/upgrade-codes", { method: "POST", data: {} });
                    result.reload();
                    toast(res.updated ? `${res.updated} ta o‘quvchi kodi yangilandi` : "Barcha kodlar allaqachon yangi formatda");
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Kodlarni yangilash (A12345)
              </button>
            )}
            <button
              className="btn primary"
              onClick={() => {
                setError(null);
                setEdit({});
              }}
            >
              <Plus size={16} />
              {students ? "O‘quvchi qo‘shish" : "Guruh yaratish"}
            </button>
          </>
        }
      />
      {!!error && !edit && <ErrorBox error={error} />}
      <div className="panel">
        {result.loading ? (
          <Busy />
        ) : result.error ? (
          <ErrorBox error={result.error} retry={result.reload} />
        ) : !result.data.items.length ? (
          <Empty
            title={students ? "O‘quvchilar hali yo‘q" : "Guruhlar hali yo‘q"}
            text="Yuqoridagi tugma yordamida birinchi yozuvni yarating."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{students ? "Ism va familiya" : "Guruh nomi"}</th>
                  <th>{students ? "O‘quvchi kodi" : "Tavsif"}</th>
                  <th>{students ? "Guruh" : "O‘quvchilar"}</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {result.data.items.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <div className="student-name-cell">
                        <strong>{r.name}</strong>
                        {students && r.note && <span className="student-note-tag">{r.note}</span>}
                        {r.status === "archived" && <Pill>Arxiv</Pill>}
                      </div>
                    </td>
                    <td>{students ? r.student_code : r.description || "—"}</td>
                    <td>
                      {students ? r.group_name || "Guruhsiz" : r.student_count}
                    </td>
                    <td>
                      <div className="row-actions">
                        {students && (
                          <button
                            className="btn secondary tiny"
                            onClick={async () => {
                              const link = location.origin + "/parent/" + encodeURIComponent(r.student_code);
                              const msg = `Assalomu alaykum! Farzandingiz ${r.name} ning dars davomati, test natijalari va yutuqlarini kuzatish:\nHavola: ${link}\nO‘quvchi kodi: ${r.student_code}`;
                              await navigator.clipboard.writeText(msg);
                              toast("Ota-ona uchun xabar va havola nusxalandi");
                            }}
                          >
                            Ota-onaga
                          </button>
                        )}
                        <button
                          className="icon-btn"
                          aria-label="Tahrirlash"
                          onClick={() => {
                            setEdit(r);
                            setError(null);
                          }}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-btn"
                          aria-label={
                            students ? "Arxivlash" : "Bo‘sh guruhni o‘chirish"
                          }
                          disabled={busy}
                          onClick={() => void remove(r)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result.data && (
          <Pagination
            offset={offset}
            setOffset={setOffset}
            count={result.data.items.length}
          />
        )}
      </div>
      {edit && (
        <Modal
          title={students ? "O‘quvchi ma’lumotlari" : "Guruh ma’lumotlari"}
          close={() => setEdit(null)}
        >
          {!!error && <ErrorBox error={error} />}
          <form onSubmit={submit}>
            <Field label={students ? "Ism va familiya" : "Guruh nomi"}>
              <input
                name="name"
                defaultValue={edit.name}
                required
                minLength={students ? 3 : 2}
                maxLength={students ? 120 : 100}
              />
            </Field>
            {students ? (
              <>
                <Field label={edit.id && edit.student_code ? "O‘quvchi kodi (biriktirilgan — faqat tiklash mumkin)" : "O‘quvchi kodi (1 marta tasodifiy yaratiladi)"}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      name="student_code"
                      value={edit.student_code || ""}
                      readOnly={!!(edit.id && edit.student_code && !edit._codeUnlocked) || !!edit._codeGenerated}
                      onChange={(e) => setEdit({ ...edit, student_code: e.target.value.toUpperCase() })}
                      placeholder="Masalan: K48291"
                      maxLength={64}
                      style={{ flex: 1 }}
                    />
                    {!edit.id ? (
                      <button
                        type="button"
                        className="btn secondary tiny"
                        disabled={!!edit._codeGenerated || !!edit.student_code}
                        onClick={() => {
                          const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
                          const code = letters[Math.floor(Math.random() * letters.length)] + String(10000 + Math.floor(Math.random() * 90000));
                          setEdit({ ...edit, student_code: code, _codeGenerated: true });
                        }}
                      >
                        {edit._codeGenerated || edit.student_code ? "✓ Kod berildi" : "Tasodifiy kod"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn secondary tiny"
                        disabled={!!edit._codeRecovered}
                        onClick={() => {
                          if (!confirm("Ushbu o‘quvchining eski kodi o‘rniga yangi kod tiklansinmi? Eski kod bilan endi kirib bo‘lmaydi.")) return;
                          const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
                          const code = letters[Math.floor(Math.random() * letters.length)] + String(10000 + Math.floor(Math.random() * 90000));
                          setEdit({ ...edit, student_code: code, _codeRecovered: true, _codeUnlocked: false });
                          toast("Yangi tiklash kodi yaratildi. Saqlash tugmasini bosing!");
                        }}
                      >
                        {edit._codeRecovered ? "✓ Tiklandi" : "Kodni tiklash"}
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Guruh">
                  <select name="group_id" defaultValue={edit.group_id || ""}>
                    <option value="">Guruhsiz</option>
                    {groups.data?.items.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tavsif (sinf yoki izoh)">
                  <input
                    name="note"
                    defaultValue={edit.note || ""}
                    placeholder="Masalan: 8-A sinf, 10-B sinf…"
                    maxLength={200}
                  />
                </Field>
              </>
            ) : (
              <Field label="Tavsif">
                <textarea
                  name="description"
                  defaultValue={edit.description}
                  maxLength={500}
                />
              </Field>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function ImportPage() {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<any>(null),
    [committed, setCommitted] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [policy, setPolicy] = useState("fail-all");
  const history = useData(base + "/imports");
  const toast = useToast();
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      setPreview(
        await api(base + "/imports/preview", { method: "POST", form }),
      );
      setCommitted(null);
      history.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api(base + "/imports/" + preview.id + "/commit", {
        method: "POST",
        data: { policy },
      });
      setCommitted(r);
      history.reload();
      toast(`${r.inserted} ta savol import qilindi`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="O‘ZBEKCHA XLSX VA CSV"
        title="Import markazi"
        description="Savollaringizni tartibli tekshiring, so‘ng shaxsiy bazangizga yozing."
      />
      <div className="import-steps">
        <span className={!preview ? "current" : ""}>
          <b>01</b>Faylni yuklash
        </span>
        <i />
        <span className={preview && !committed ? "current" : ""}>
          <b>02</b>Dastlabki tekshiruv
        </span>
        <i />
        <span className={committed ? "current" : ""}>
          <b>03</b>Bazaga saqlash
        </span>
      </div>
      <div className="import-layout">
        <section className="panel">
          <div className="panel-title">
            <h2>
              {preview ? "Tekshiruv natijasi" : "Savollar faylini tanlang"}
            </h2>
            <Pill tone="blue">Shaxsiy import</Pill>
          </div>
          {!!error && <ErrorBox error={error} />}{" "}
          {committed ? (
            <div className="import-success">
              <CheckCircle2 size={45} />
              <h2>{committed.inserted} ta savol saqlandi</h2>
              <p>
                Savollar Storega yuborilmagan. Ular faqat sizning bazangizda.
              </p>
              <Link to="/studio/questions" className="btn primary">
                Savollar bazasini ochish
              </Link>
              <button
                className="btn secondary"
                onClick={() => {
                  setPreview(null);
                  setCommitted(null);
                  setFile(null);
                }}
              >
                Yangi import
              </button>
            </div>
          ) : preview ? (
            <>
              <div className="import-summary">
                <div>
                  <strong>{preview.summary.valid}</strong>
                  <span>Yaroqli</span>
                </div>
                <div>
                  <strong>{preview.summary.invalid}</strong>
                  <span>Xatoli</span>
                </div>
                <div>
                  <strong>{preview.summary.duplicate}</strong>
                  <span>Takroriy</span>
                </div>
              </div>
              <div className="table-scroll preview-table">
                <table>
                  <thead>
                    <tr>
                      <th>Qator</th>
                      <th>Savol / xato</th>
                      <th>Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r: any) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>
                          {r.question?.title || "Savol tekshiruvi"}
                          {r.errors.map((e: any, i: number) => (
                            <small className="text-danger" key={i}>
                              {e.column}: {e.message}
                            </small>
                          ))}
                        </td>
                        <td>
                          <Pill
                            tone={
                              r.status === "valid"
                                ? "green"
                                : r.status === "invalid"
                                  ? "red"
                                  : "amber"
                            }
                          >
                            {r.status === "valid"
                              ? "Yaroqli"
                              : r.status === "invalid"
                                ? "Xato"
                                : "Takroriy"}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field label="Import siyosati">
                <select
                  value={policy}
                  onChange={(e) => setPolicy(e.target.value)}
                >
                  <option value="fail-all">
                    Barchasi yaroqli bo‘lsa yozish
                  </option>
                  <option value="valid-only">
                    Faqat yaroqli qatorlarni yozish
                  </option>
                </select>
              </Field>
              <p className="muted">
                Tekshiruv savollar bazasiga yozmadi. Tasdiqlash bir martalik
                transaction orqali bajariladi.
              </p>
              <div className="actions">
                <button
                  className="btn secondary"
                  onClick={() => setPreview(null)}
                >
                  Boshqa fayl
                </button>
                <button
                  className="btn primary"
                  disabled={
                    busy ||
                    !preview.summary.valid ||
                    (policy === "fail-all" &&
                      (preview.summary.invalid > 0 ||
                        preview.summary.duplicate > 0))
                  }
                  onClick={() => void commit()}
                >
                  {busy ? "Saqlanmoqda…" : "Importni tasdiqlash"}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="upload-zone">
                <UploadCloud size={42} />
                <strong>
                  {file ? file.name : "Excel yoki CSV faylini tanlang"}
                </strong>
                <span>10 MB gacha · 1000 tagacha savol · UTF-8</span>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setError(null);
                  }}
                />
              </label>
              <button
                className="btn primary"
                disabled={!file || busy}
                onClick={() => void upload()}
              >
                {busy ? "Tekshirilmoqda…" : "Faylni tekshirish"}
                <ArrowRight size={16} />
              </button>
            </>
          )}
        </section>
        <aside className="panel import-help">
          <span className="banner-icon">
            <FileSpreadsheet size={25} />
          </span>
          <h2>To‘g‘ri shablondan boshlang</h2>
          <p>
            Barcha ustunlar o‘zbekcha. Excelning «Savollar» varag‘ini
            to‘ldiring.
          </p>
          <a
            className="btn secondary full"
            href="/api/v2/templates/questions.xlsx"
            download
          >
            <ArrowDownToLine size={16} />
            Excel shabloni
          </a>
          <a
            className="btn secondary full"
            href="/api/v2/templates/questions.csv"
            download
          >
            <ArrowDownToLine size={16} />
            CSV shabloni
          </a>
          <div className="help-divider" />
          <h3>E’tibor bering</h3>
          <ul>
            <li>Javoblar: A, B yoki A|C.</li>
            <li>Formulalar qabul qilinmaydi.</li>
            <li>«Namunalar» varag‘i import qilinmaydi.</li>
            <li>Avvalgi inglizcha CSV ham ishlaydi.</li>
          </ul>
          <Link to="/studio/support" className="text-link">
            Yordam kerakmi? <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
      <section className="panel import-history">
        <div className="panel-title">
          <h2>Import tarixi</h2>
          <Clock3 size={18} />
        </div>
        {history.loading ? (
          <Busy />
        ) : history.error ? (
          <ErrorBox error={history.error} retry={history.reload} />
        ) : !history.data.items.length ? (
          <p className="muted">Hali import qilinmagan.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fayl</th>
                  <th>Sana</th>
                  <th>Holat</th>
                  <th>Saqlangan</th>
                </tr>
              </thead>
              <tbody>
                {history.data.items.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.filename}</td>
                    <td>{date(r.created_at)}</td>
                    <td>
                      <Pill
                        tone={r.status === "committed" ? "green" : "neutral"}
                      >
                        {r.status === "committed"
                          ? "Saqlangan"
                          : "Ko‘rib chiqilgan"}
                      </Pill>
                    </td>
                    <td>
                      {r.result_json ? JSON.parse(r.result_json).inserted : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
function CardEditor({
  card,
  close,
  saved,
}: {
  card?: any;
  close: () => void;
  saved: () => void;
}) {
  const [value, setValue] = useState<CardSettings>(() =>
    card
      ? cardSchema.parse(
          Object.fromEntries(
            Object.keys(cardSchema.parse({ title: "Boshlang‘ich" })).map(
              (k) => [k, card[k]],
            ),
          ),
        )
      : cardSchema.parse({ title: "Yangi test", show_answers: true }),
  );
  const [search, setSearch] = useState(""),
    [manualCategory, setManualCategory] = useState(""),
    [manualLevel, setManualLevel] = useState(""),
    [offset, setOffset] = useState(0),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const packsData = useData(base + "/questions/packs");
  const packList: any[] = packsData.data?.packs || [];
  const activePack = value.category
    ? packList.find((p) => p.category === value.category) || { total: 0, easy: 0, medium: 0, hard: 0, expert: 0, topics: [] }
    : packsData.data?.all || { total: 0, easy: 0, medium: 0, hard: 0, expert: 0, topics: [] };
  const computeAutoMix = (pack: any) => {
    const t = pack?.total || 0;
    if (!t) return { easy: 30, medium: 50, hard: 20, expert: 0 };
    const e = Math.round(((pack.easy || 0) / t) * 100);
    const m = Math.round(((pack.medium || 0) / t) * 100);
    const h = Math.round(((pack.hard || 0) / t) * 100);
    let ex = 100 - (e + m + h);
    const res = { easy: e, medium: m, hard: h, expert: Math.max(0, ex) };
    const diff = 100 - (res.easy + res.medium + res.hard + res.expert);
    if (diff !== 0) {
      const biggest = (["easy", "medium", "hard", "expert"] as const).reduce((a, b) => ((pack[b] || 0) > (pack[a] || 0) ? b : a), "easy");
      res[biggest] = Math.max(0, res[biggest] + diff);
    }
    return res;
  };
  const qs = useData(
      base +
        "/questions?limit=30&offset=" +
        offset +
        "&q=" +
        encodeURIComponent(useDebounce(search)) +
        (manualCategory ? "&category=" + encodeURIComponent(manualCategory) : "") +
        (manualLevel ? "&level=" + encodeURIComponent(manualLevel) : ""),
    ),
    groups = useData(base + "/groups?limit=100");
  const set = (k: keyof CardSettings, v: any) =>
    setValue((x) => ({ ...x, [k]: v, ...(k === "show_results" && !v ? { show_answers: false } : {}) }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const parsed = cardSchema.parse({
        ...value,
        question_count:
          value.mode === "manual"
            ? value.selected_ids.length
            : value.question_count,
      });
      await api(base + "/cards" + (card ? "/" + card.id : ""), {
        method: card ? "PUT" : "POST",
        data: parsed,
      });
      saved();
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const dateInput = (key: "starts_at" | "ends_at") => (
    <input
      type="datetime-local"
      value={
        value[key]
          ? new Date(
              value[key]! * 1000 - new Date().getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16)
          : ""
      }
      onChange={(e) =>
        set(
          key,
          e.target.value
            ? Math.floor(new Date(e.target.value).getTime() / 1000)
            : null,
        )
      }
    />
  );
  return (
    <Modal
      title={card ? "Kartani tahrirlash" : "Yangi test kartasi"}
      close={close}
    >
      <form onSubmit={submit}>
        {!!error && <ErrorBox error={error} />}
        <Field label="Test nomi">
          <input
            value={value.title}
            onChange={(e) => set("title", e.target.value)}
            required
            minLength={3}
            maxLength={130}
          />
        </Field>
        <Field label="Tavsif va qoidalar">
          <textarea
            value={value.description}
            onChange={(e) => set("description", e.target.value)}
            maxLength={1200}
          />
        </Field>
        <Field label="Yutuq (ixtiyoriy)">
          <input
            value={value.reward || ""}
            onChange={(e) => set("reward", e.target.value)}
            maxLength={500}
            placeholder="Masalan: 80%+ natija uchun sertifikat yoki +5 bonus ball"
          />
        </Field>
        <Field label="Mukofot Bilim Coin (0 = test darajasi va foizga qarab avtomatik)">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="number"
              min={0}
              max={5000}
              value={value.reward_coins ?? 0}
              onChange={(e) => set("reward_coins", Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 130 }}
            />
            {[0, 30, 50, 100].map((v) => (
              <button
                key={v}
                type="button"
                className={(value.reward_coins ?? 0) === v ? "btn primary tiny" : "btn secondary tiny"}
                onClick={() => set("reward_coins", v)}
              >
                {v === 0 ? "Avto" : "+" + v + " Coin"}
              </button>
            ))}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="Savol tanlash">
            <select
              value={value.mode}
              onChange={(e) => set("mode", e.target.value)}
            >
              <option value="auto">Avtomatik aralashma</option>
              <option value="manual">Qo‘lda tanlash</option>
            </select>
          </Field>
          <Field label="Fan / kategoriya (Pack)">
            <select
              value={value.category}
              onChange={(e) => {
                const cat = e.target.value;
                const chosen = cat
                  ? packList.find((p) => p.category === cat)
                  : packsData.data?.all;
                setValue((x) => ({
                  ...x,
                  category: cat,
                  topic: chosen?.topics?.includes(x.topic) ? x.topic : "",
                  question_count:
                    chosen && chosen.total > 0 && x.question_count > chosen.total
                      ? chosen.total
                      : x.question_count,
                  ...(chosen && chosen.total > 0 ? { mix: computeAutoMix(chosen) } : {}),
                }));
              }}
            >
              <option value="">
                Barcha fanlar / packlar ({packsData.data?.all?.total ?? 0} ta savol)
              </option>
              {packList.map((p: any) => (
                <option key={p.category} value={p.category}>
                  {p.category} ({p.total} ta savol)
                </option>
              ))}
              {value.category && !packList.some((p: any) => p.category === value.category) && (
                <option value={value.category}>{value.category}</option>
              )}
            </select>
          </Field>
          <Field label="Mavzu">
            <select
              value={value.topic}
              onChange={(e) => set("topic", e.target.value)}
            >
              <option value="">Barcha mavzular</option>
              {(activePack?.topics || []).map((t: string) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {value.topic && !(activePack?.topics || []).includes(value.topic) && (
                <option value={value.topic}>{value.topic}</option>
              )}
            </select>
          </Field>
          <Field label="Savollar soni">
            <input
              type="number"
              value={
                value.mode === "manual"
                  ? value.selected_ids.length
                  : value.question_count
              }
              onChange={(e) => set("question_count", +e.target.value)}
              disabled={value.mode === "manual"}
              min={1}
              max={150}
              required
            />
          </Field>
          <Field label="Vaqt (daqiqa)">
            <input
              type="number"
              min={1}
              max={360}
              value={value.duration_minutes}
              onChange={(e) => set("duration_minutes", +e.target.value)}
              required
            />
          </Field>
          <Field label="O‘tish foizi">
            <input
              type="number"
              min={0}
              max={100}
              value={value.pass_percent}
              onChange={(e) => set("pass_percent", +e.target.value)}
              required
            />
          </Field>
          <Field label="Urinishlar limiti">
            <input
              type="number"
              min={1}
              max={100}
              value={value.attempt_limit}
              onChange={(e) => set("attempt_limit", +e.target.value)}
              required
            />
          </Field>
          <Field label="Guruh cheklovi">
            <select
              value={value.group_id || ""}
              onChange={(e) => set("group_id", e.target.value || null)}
            >
              <option value="">Barcha o‘quvchilar</option>
              {groups.data?.items.map((g: any) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Boshlanish (mahalliy vaqt)">
            {dateInput("starts_at")}
          </Field>
          <Field label="Tugash (mahalliy vaqt)">{dateInput("ends_at")}</Field>
          <Field label="Kirish tartibi">
            <select
              value={value.access_mode}
              onChange={(e) => set("access_mode", e.target.value)}
            >
              <option value="open">Ochiq havola</option>
              <option value="pin">Havola va PIN</option>
            </select>
          </Field>
          {value.access_mode === "pin" && (
            <Field label="PIN">
              <input
                value={value.pin}
                onChange={(e) => set("pin", e.target.value)}
                minLength={4}
                maxLength={32}
                required={!card?.has_pin}
                autoComplete="off"
              />
            </Field>
          )}
        </div>
        {value.mode === "auto" ? (
          <fieldset className="mix-grid">
            <legend>
              Qiyinchilik ulushlari — jami{" "}
              {value.mix.easy + value.mix.medium + value.mix.hard + value.mix.expert}%
            </legend>
            <div className="mix-helper">
              <small className="muted">
                Tanlangan packda mavjud: Oson {activePack.easy || 0} · O‘rtacha {activePack.medium || 0} · Qiyin {activePack.hard || 0} · Ekspert {activePack.expert || 0}
              </small>
              <div className="mix-presets">
                <button
                  type="button"
                  className="btn secondary tiny"
                  onClick={() => set("mix", computeAutoMix(activePack))}
                >
                  Bazaga mos (Avto)
                </button>
                {[
                  ["Oson (100%)", { easy: 100, medium: 0, hard: 0, expert: 0 }],
                  ["Standart (50/30/20)", { easy: 50, medium: 30, hard: 20, expert: 0 }],
                  ["Muvozanatli (40/40/20)", { easy: 40, medium: 40, hard: 20, expert: 0 }],
                  ["Murakkab (20/40/30/10)", { easy: 20, medium: 40, hard: 30, expert: 10 }],
                ].map(([label, preset]: any) => (
                  <button
                    key={label}
                    type="button"
                    className="btn secondary tiny"
                    onClick={() => set("mix", preset)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {Object.entries(levelNames).map(([k, v]) => (
              <Field key={k} label={v + " %"}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={value.mix[k as keyof typeof value.mix]}
                  onChange={(e) =>
                    set("mix", { ...value.mix, [k]: +e.target.value })
                  }
                />
              </Field>
            ))}
          </fieldset>
        ) : (
          <fieldset className="manual-select">
            <legend>
              Savollarni belgilang ({value.selected_ids.length}/150)
            </legend>
            <div className="manual-filters">
              <input
                aria-label="Tanlanadigan savollarni qidirish"
                placeholder="Savol qidirish…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setOffset(0);
                }}
              />
              <select
                aria-label="Pack filtri"
                value={manualCategory}
                onChange={(e) => {
                  setManualCategory(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Barcha packlar</option>
                {packList.map((p: any) => (
                  <option key={p.category} value={p.category}>
                    {p.category} ({p.total})
                  </option>
                ))}
              </select>
              <select
                aria-label="Qiyinchilik filtri"
                value={manualLevel}
                onChange={(e) => {
                  setManualLevel(e.target.value);
                  setOffset(0);
                }}
              >
                <option value="">Barcha darajalar</option>
                {Object.entries(levelNames).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="manual-actions">
              <button
                type="button"
                className="btn secondary tiny"
                onClick={() => {
                  const visibleIds = (qs.data?.items || []).map((q: any) => q.id);
                  const merged = Array.from(new Set([...value.selected_ids, ...visibleIds])).slice(0, 150);
                  set("selected_ids", merged);
                }}
              >
                Ko‘ringanlarini belgilash
              </button>
              {value.selected_ids.length > 0 && (
                <button
                  type="button"
                  className="btn ghost tiny"
                  onClick={() => set("selected_ids", [])}
                >
                  Tanlovni tozalash
                </button>
              )}
            </div>
            {qs.loading ? (
              <Busy />
            ) : qs.error ? (
              <ErrorBox error={qs.error} />
            ) : (
              qs.data.items.map((q: any) => (
                <label className="check-field" key={q.id}>
                  <input
                    type="checkbox"
                    checked={value.selected_ids.includes(q.id)}
                    disabled={
                      value.selected_ids.length >= 150 &&
                      !value.selected_ids.includes(q.id)
                    }
                    onChange={(e) =>
                      set(
                        "selected_ids",
                        e.target.checked
                          ? [...value.selected_ids, q.id]
                          : value.selected_ids.filter((id) => id !== q.id),
                      )
                    }
                  />
                  <span>
                    {q.title}
                    <small>
                      {q.category} · {levelNames[q.level]}
                    </small>
                  </span>
                </label>
              ))
            )}
            {qs.data && (
              <Pagination
                offset={offset}
                setOffset={setOffset}
                count={qs.data.items.length}
                total={qs.data.total}
              />
            )}
          </fieldset>
        )}
        <div className="form-grid">
          <div className="form-grid" style={{ marginTop: 10 }}>
            <Field label="Imtihon nazorati (Anti-cheat)">
              <select
                value={value.anti_cheat || "monitor"}
                onChange={(e) => set("anti_cheat", e.target.value)}
              >
                <option value="off">O‘chirilgan</option>
                <option value="monitor">Kuzatuv (ogohlantiradi va yozadi)</option>
                <option value="strict">Qat’iy (limitdan oshsa avto-yakunlaydi)</option>
              </select>
            </Field>
            {value.anti_cheat === "strict" && (
              <Field label="Maks. qoidabuzarlik">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={value.max_violations ?? 3}
                  onChange={(e) => set("max_violations", +e.target.value)}
                />
              </Field>
            )}
          </div>
          {[
            ["random_order", "Savollarni aralashtirish"],
            ["shuffle_options", "Variantlarni aralashtirish"],
            ["show_results", "Natijalarni ko‘rsatish"],
            ["show_answers", "Yakunlangach javoblarni ochish"],
            ["show_leaderboard", "Qisqartirilgan ism bilan reyting"],
            ["require_fullscreen", "To‘liq ekran (Fullscreen) talab qilish"],
          ].map(([k, label]) => (
            <label className="check-field" key={k}>
              <input
                type="checkbox"
                checked={!!value[k as keyof CardSettings]}
                onChange={(e) => set(k as keyof CardSettings, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="notice">
          Karta faollashtirilganda savol versiyalari mahkamlanadi. E’lon
          qilingan kartani o‘zgartirish uchun nusxa yaratiladi.
        </p>
        <button className="btn primary" disabled={busy}>
          {busy ? "Saqlanmoqda…" : "Qoralamani saqlash"}
        </button>
      </form>
    </Modal>
  );
}
export function Cards() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"cards" | "archive">("cards"),
    [edit, setEdit] = useState<any>(params.get("new") ? {} : null),
    [offset, setOffset] = useState(0),
    [archOffset, setArchOffset] = useState(0),
    [archSearch, setArchSearch] = useState(""),
    [commentsCard, setCommentsCard] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const result = useData(base + "/cards?offset=" + offset);
  const archived = useData(
    base +
      "/archived-results?offset=" +
      archOffset +
      "&q=" +
      encodeURIComponent(useDebounce(archSearch)),
  );
  const toast = useToast();
  async function action(card: any, kind: string) {
    setBusy(true);
    setError(null);
    try {
      if (kind === "copy") {
        await navigator.clipboard.writeText(
          location.origin + "/t/" + card.slug,
        );
        toast("Test havolasi nusxalandi");
      } else if (kind === "market_submit") {
        await api(base + "/cards/" + card.id + "/market", {
          method: "POST",
          data: { action: "submit" },
        });
        result.reload();
        toast("Kartochka Owner moderatsiyasiga yuborildi");
      } else if (kind === "market_remove") {
        await api(base + "/cards/" + card.id + "/market", {
          method: "POST",
          data: { action: "remove" },
        });
        result.reload();
        toast("Kartochka marketdan olindi");
      } else if (kind === "delete") {
        if (
          !confirm(
            `"${card.title}" kartasini serverdan butunlay o‘chirmoqchimisiz?\n\nKarta va havola o‘chib ketadi, lekin uning barcha yakunlangan natijalari «Arxivlangan natijalar» bo‘limida saqlanib qoladi.`,
          )
        ) {
          setBusy(false);
          return;
        }
        const r = await api(base + "/cards/" + card.id, { method: "DELETE" });
        result.reload();
        archived.reload();
        toast(
          r.archived_results
            ? `Karta o‘chirildi. ${r.archived_results} ta natija arxivga saqlandi.`
            : "Karta serverdan butunlay o‘chirildi.",
        );
      } else {
        await api(
          base +
            "/cards/" +
            card.id +
            "/" +
            (kind === "duplicate" ? "duplicate" : "status"),
          {
            method: "POST",
            data: kind === "duplicate" ? {} : { status: kind },
          },
        );
        result.reload();
        toast("Karta yangilandi");
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="BAHOLASH VOSITALARI"
        title="Test kartalari"
        description="Test yarating, qoidalarini belgilang va havolasini ulashing."
        actions={
          <button className="btn primary" onClick={() => setEdit({})}>
            <Plus size={17} />
            Yangi karta
          </button>
        }
      />
      <div className="tabs-bar">
        <button
          type="button"
          className={tab === "cards" ? "btn primary tiny" : "btn secondary tiny"}
          onClick={() => setTab("cards")}
        >
          Test kartalari ({result.data?.items?.length ?? 0})
        </button>
        <button
          type="button"
          className={tab === "archive" ? "btn primary tiny" : "btn secondary tiny"}
          onClick={() => {
            setTab("archive");
            archived.reload();
          }}
        >
          Arxivlangan natijalar ({archived.data?.total ?? 0})
        </button>
      </div>
      {!!error && <ErrorBox error={error} />}{" "}
      {tab === "archive" ? (
        <section className="panel">
          <div className="toolbar">
            <div className="search-input">
              <Search size={16} />
              <input
                placeholder="Test nomi, kodi yoki o‘quvchi bo‘yicha qidirish…"
                value={archSearch}
                onChange={(e) => {
                  setArchSearch(e.target.value);
                  setArchOffset(0);
                }}
              />
            </div>
            <a
              className="btn secondary tiny"
              href={base + "/archived-results/export.csv"}
            >
              CSV yuklab olish
            </a>
          </div>
          {archived.loading ? (
            <Busy />
          ) : archived.error ? (
            <ErrorBox error={archived.error} retry={archived.reload} />
          ) : !archived.data.items.length ? (
            <Empty
              title="Arxivlangan natijalar yo‘q"
              text="O‘chirilgan test kartalarining yakunlangan natijalari barcha tafsilotlari bilan shu yerda saqlanadi."
            />
          ) : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Test / Kod</th>
                      <th>O‘quvchi</th>
                      <th>Natija</th>
                      <th>To‘g‘ri / Xato / Javobsiz</th>
                      <th>Holat</th>
                      <th>Topshirilgan sana</th>
                      <th>Vaqt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archived.data.items.map((a: any) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.card_title}</strong>
                          <small className="muted" style={{ display: "block" }}>
                            {a.card_slug}
                            {a.card_category ? " · " + a.card_category : ""}
                          </small>
                        </td>
                        <td>{a.student_name}</td>
                        <td>
                          <strong>{a.percentage}%</strong> ({a.score}/{a.max_score})
                        </td>
                        <td>
                          {a.correct_count} / {a.incorrect_count} / {a.unanswered_count}
                        </td>
                        <td>
                          <Pill tone={a.passed ? "green" : "red"}>
                            {a.passed ? "O‘tdi" : "O‘tmadi"}
                          </Pill>
                        </td>
                        <td>
                          {new Date(Number(a.submitted_at) * 1000).toLocaleString("uz-UZ")}
                        </td>
                        <td>
                          {Math.floor(a.duration_seconds / 60)} daq{" "}
                          {a.duration_seconds % 60} sek
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                offset={archOffset}
                setOffset={setArchOffset}
                count={archived.data.items.length}
                total={archived.data.total}
              />
            </>
          )}
        </section>
      ) : result.loading ? (
        <Busy />
      ) : result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : !result.data.items.length ? (
        <div className="panel">
          <Empty
            title="Birinchi testingizni yarating"
            text="Savollar bazasidan avtomatik yoki qo‘lda savol tanlang."
            action={
              <button className="btn primary" onClick={() => setEdit({})}>
                Karta yaratish
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="cards-grid">
            {result.data.items.map((r: any) => (
              <article className="panel test-card" key={r.id}>
                <div className="test-card-top">
                  <span className="card-symbol">
                    <ClipboardList size={22} />
                  </span>
                  <Pill tone={r.status === "active" ? "green" : "neutral"}>
                    {statusName[r.status]}
                  </Pill>
                </div>
                <h2>{r.title}</h2>
                <p>{r.description || r.category || "Shaxsiy test kartasi"}</p>
                {r.reward && <div className="card-reward" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Trophy size={14} color="#d97706" /> Yutuq: {r.reward}</div>}
                {(r.market_status && r.market_status !== "none") || r.market_solves > 0 ? (
                  <div className="market-mini-bar">
                    {r.market_status === "approved" && <Pill tone="green">Marketda</Pill>}
                    {r.market_status === "pending" && <Pill tone="amber">Market: kutilmoqda</Pill>}
                    {r.market_status === "rejected" && <Pill tone="red">Market: rad etilgan</Pill>}
                    {r.market_solves > 0 && (
                      <small className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={13} color="#64748b" /> {r.market_solves} marta yechilgan</small>
                    )}
                  </div>
                ) : null}
                <div className="test-card-details">
                  <span>
                    <BookOpen size={15} />
                    {r.question_count} savol
                  </span>
                  <span>
                    <Clock3 size={15} />
                    {r.duration_minutes} daqiqa
                  </span>
                  <span>
                    <BarChart3 size={15} />
                    {r.pass_percent}%
                  </span>
                </div>
                <div className="test-code">{r.slug}</div>
                <div className="card-buttons">
                  <button
                    className="btn secondary tiny"
                    onClick={() => void action(r, "copy")}
                  >
                    <Copy size={14} />
                    Havola
                  </button>
                  {!r.published_version && (
                    <button
                      className="btn secondary tiny"
                      onClick={() => setEdit(r)}
                    >
                      <Pencil size={14} />
                      Tahrir
                    </button>
                  )}
                  <button
                    className="btn secondary tiny"
                    disabled={busy}
                    onClick={() => void action(r, "duplicate")}
                  >
                    Nusxa
                  </button>
                  <Link
                    className="btn secondary tiny"
                    to={"/studio/analytics?card=" + r.id}
                  >
                    Natijalar
                  </Link>
                  {r.status !== "active" && r.status !== "archived" && (
                    <button
                      className="btn primary tiny"
                      disabled={busy}
                      onClick={() => void action(r, "active")}
                    >
                      Faollashtirish
                    </button>
                  )}
                  {r.status === "active" && (
                    <button
                      className="btn secondary tiny"
                      disabled={busy}
                      onClick={() => void action(r, "closed")}
                    >
                      Yopish
                    </button>
                  )}
                  {r.status !== "archived" && (
                    <button
                      className="btn ghost tiny"
                      disabled={busy}
                      onClick={() => void action(r, "archived")}
                    >
                      Arxiv
                    </button>
                  )}
                  <button
                    className="btn ghost tiny"
                    onClick={() => setCommentsCard(r)}
                  >
                    Fikrlar
                  </button>
                  <button
                    className="btn danger tiny"
                    disabled={busy}
                    onClick={() => void action(r, "delete")}
                  >
                    <Trash2 size={14} />
                    O‘chirish
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Pagination
            offset={offset}
            setOffset={setOffset}
            count={result.data.items.length}
          />
        </>
      )}
      {commentsCard && (
        <TeacherCommentsModal
          card={commentsCard}
          onClose={() => setCommentsCard(null)}
        />
      )}
      {edit && (
        <CardEditor
          card={edit.id ? edit : undefined}
          close={() => {
            setEdit(null);
            setParams({});
          }}
          saved={result.reload}
        />
      )}
    </>
  );
}
export function Analytics() {
  const cards = useData(base + "/cards?limit=100");
  const [params, setParams] = useSearchParams();
  const selected = params.get("card") || "";
  return (
    <>
      <PageTitle
        eyebrow="NATIJADAN XULOSAGA"
        title="Analitika"
        description="Natijalar, savollar tahlili va guruhingizning o‘sish nuqtalari."
      />
      <div className="panel selector-panel">
        <Field label="Tahlil uchun test kartasi">
          <select
            value={selected}
            onChange={(e) =>
              setParams(e.target.value ? { card: e.target.value } : {})
            }
          >
            <option value="">Test kartasini tanlang</option>
            {cards.data?.items.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        {!!cards.error && <ErrorBox error={cards.error} />}
      </div>
      {selected ? (
        <CardAnalytics key={selected} id={selected} />
      ) : (
        <div className="panel">
          <Empty
            title="Qaysi testni tahlil qilamiz?"
            text="Yuqoridagi ro‘yxatdan kartani tanlang. Natijalar faqat sizning workspacedan olinadi."
          />
        </div>
      )}
    </>
  );
}
const AC_LABELS: Record<string, string> = {
  tab_switch: "Boshqa tab yoki dasturga o‘tish",
  window_blur: "Boshqa oyna / ekranga o‘tish",
  mouse_leave: "Sichqoncha imtihon oynasidan chiqib ketishi",
  fullscreen_exit: "To‘liq ekran rejimidan chiqish",
  copy_attempt: "Nusxalash yoki o‘ng tugma urinishi",
  devtools: "Dasturchi vositalarini (DevTools) ochish urinishi",
  split_screen: "Oynani kichraytirish (split-screen)",
};

function AttemptDetailModal({
  attemptId,
  onClose,
}: {
  attemptId: string;
  onClose: () => void;
}) {
  const detail = useData(`${base}/attempts/${attemptId}`);
  const a = detail.data?.attempt;
  const qs: any[] = detail.data?.questions || [];
  const log: any[] = (() => {
    try {
      return JSON.parse(a?.violation_log_json || "[]");
    } catch {
      return [];
    }
  })();

  return (
    <Modal title={a ? `${a.student_name} — imtihon tafsiloti` : "Imtihon tafsiloti"} close={onClose}>
      {detail.loading ? (
        <Busy />
      ) : detail.error ? (
        <ErrorBox error={detail.error} retry={detail.reload} />
      ) : a ? (
        <div className="attempt-detail-wrap">
          <div className="attempt-detail-summary">
            <div>
              <small className="muted">Natija</small>
              <strong>
                {a.percentage}% ({a.score}/{a.max_score} ball)
              </strong>
            </div>
            <div>
              <small className="muted">To‘g‘ri / Xato / Bo‘sh</small>
              <strong>
                {a.correct_count} / {a.incorrect_count} / {a.unanswered_count}
              </strong>
            </div>
            <div>
              <small className="muted">Qoidabuzarlik</small>
              <strong>
                {a.auto_submitted
                  ? `Avto-yakun (${a.violations_count || 0} ta)`
                  : (a.violations_count || 0) > 0
                    ? `${a.violations_count} ta · ${a.away_seconds || 0}s`
                    : "Toza (0 ta)"}
              </strong>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              type="button"
              className="btn primary tiny"
              onClick={() =>
                openCertificatePrint({
                  studentName: a.student_name || "O‘quvchi",
                  studentCode: a.student_code || "",
                  testTitle: a.card_title || "Onlayn test",
                  category: a.card_category || "",
                  percentage: Number(a.percentage || 0),
                  score: Number(a.score || 0),
                  maxScore: Number(a.max_score || 0),
                  correct: a.correct_count,
                  incorrect: a.incorrect_count,
                  unanswered: a.unanswered_count,
                  passed: !!a.passed || Number(a.percentage || 0) >= 70,
                  reward: a.reward || "",
                  dateText: new Date(Number(a.submitted_at || Date.now() / 1000) * 1000).toLocaleDateString("uz-UZ"),
                  certCode: "BUZ-" + String(a.id || "CERT").slice(0, 8).toUpperCase(),
                })
              }
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Award size={15} color="#0c8066" /> QR-kodli Sertifikat (PDF)</span>
            </button>
          </div>

          <div className={"ac-result-panel" + ((a.violations_count || 0) > 0 ? " has-issues" : "")} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid var(--line)" }}>
            <div className="ac-result-head">
              <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Shield size={15} color="#2563eb" /> Imtihon nazorati hisoboti</strong>
              {a.auto_submitted ? (
                <Pill tone="red">Avto-yakunlandi</Pill>
              ) : (a.violations_count || 0) > 0 ? (
                <Pill tone="amber">{a.violations_count} ta qoidabuzarlik</Pill>
              ) : (
                <Pill tone="green">Toza</Pill>
              )}
            </div>
            <div className="ac-result-meta">
              <span><strong>Oynadan tashqarida:</strong> {a.away_seconds || 0} soniya</span>
              {!!a.multi_screen && (
                <span className="ac-flag">2-ekran ulangan holatda topshirilgan</span>
              )}
            </div>
            {log.length > 0 ? (
              <ul className="ac-result-log">
                {log.map((ev: any, idx: number) => (
                  <li key={idx}>
                    <span className="ac-log-time">
                      {ev.at ? new Date(Number(ev.at) * 1000).toLocaleTimeString("uz-UZ") : ""}
                    </span>
                    <span>{AC_LABELS[ev.type] || ev.type}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <small className="muted" style={{ display: "block", marginTop: 6 }}>
                Qoidabuzarlik hodisalari qayd etilmagan.
              </small>
            )}
          </div>

          <div className="attempt-qs-list">
            <h3 style={{ margin: "4px 0 8px", fontSize: 14 }}>Savollar bo‘yicha javoblar ({qs.length})</h3>
            {qs.map((q: any) => {
              const selected: string[] = (() => {
                try {
                  return JSON.parse(q.selected_json || "[]");
                } catch {
                  return [];
                }
              })();
              const c = q.content || {};
              const correct: string[] = c.correct || [];
              return (
                <div className="attempt-q-item" key={q.position}>
                  <div className="attempt-q-head">
                    <strong>
                      {q.position}. {c.title}
                    </strong>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <small className="muted">
                        {Math.round((Number(q.active_time_ms || 0) / 1000) * 10) / 10}s
                      </small>
                      <Pill tone={q.is_correct ? "green" : selected.length ? "red" : "neutral"}>
                        {q.is_correct ? `+${q.earned_points} ball` : selected.length ? "Xato" : "Bo‘sh"}
                      </Pill>
                    </div>
                  </div>
                  <div className="review-meta" style={{ marginTop: 6 }}>
                    <span>
                      <strong>O‘quvchi javobi:</strong>{" "}
                      {selected.length ? selected.join(", ") : "Belgilanmagan"}
                    </span>
                    <span>
                      <strong>To‘g‘ri javob:</strong> {correct.join(", ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function CardAnalytics({ id }: { id: string }) {
  const [offset, setOffset] = useState(0);
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);
  const result = useData(`${base}/cards/${id}/analytics?offset=${offset}`);
  if (result.loading) return <Busy />;
  if (result.error)
    return <ErrorBox error={result.error} retry={result.reload} />;
  const d = result.data,
    s = d.summary;
  return (
    <>
      <div className="metrics">
        <Metric
          label="Jami urinish"
          value={s.attempts}
          Icon={Users}
          note="Shu test kartasi bo‘yicha"
          tone="blue"
        />
        <Metric
          label="O‘rtacha natija"
          value={s.average + "%"}
          Icon={BarChart3}
          note="Yakunlangan urinishlar"
          tone="green"
        />
        <Metric
          label="O‘tish ko‘rsatkichi"
          value={s.pass_rate + "%"}
          Icon={CheckCircle2}
          note={`${s.completed || 0} ta yakunlangan`}
          tone="amber"
        />
        <Metric
          label="Eng yaxshi natija"
          value={s.best + "%"}
          Icon={Zap}
          note="Server hisoblagan ball"
          tone="violet"
        />
      </div>
      <section className="panel">
        <div className="panel-title">
          <h2>Test natijalari</h2>
          <div className="actions">
            <a
              className="btn secondary tiny"
              href={`${base}/cards/${id}/export`}
            >
              CSV <ArrowDownToLine size={14} />
            </a>
            <a
              className="btn secondary tiny"
              href={`${base}/cards/${id}/export?format=xlsx`}
            >
              Excel <ArrowDownToLine size={14} />
            </a>
          </div>
        </div>
        {!d.attempts.length ? (
          <Empty
            title="Natijalar hali yo‘q"
            text="O‘quvchi testni boshlagach, urinishlar bu yerda ko‘rinadi."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>O‘quvchi</th>
                  <th>Holat</th>
                  <th>Natija</th>
                  <th>To‘g‘ri / xato / bo‘sh</th>
                  <th>Nazorat</th>
                  <th>Vaqt</th>
                </tr>
              </thead>
              <tbody>
                {d.attempts.map((a: any) => (
                  <tr
                    key={a.id}
                    className="j-row"
                    title="Batafsil natija va qoidabuzarliklarni ko‘rish"
                    onClick={() => setOpenAttemptId(a.id)}
                  >
                    <td>
                      <div className="student-name-cell">
                        <strong>{a.student_name}</strong>
                        {a.student_note && <span className="student-note-tag">{a.student_note}</span>}
                      </div>
                      <small>
                        {a.student_code || "Guest"} · {date(a.started_at)}
                      </small>
                    </td>
                    <td>
                      <Pill tone={a.status === "submitted" ? "green" : "amber"}>
                        {statusName[a.status]}
                      </Pill>
                    </td>
                    <td>
                      {a.status === "submitted"
                        ? `${a.percentage}% (${a.score}/${a.max_score})`
                        : "—"}
                    </td>
                    <td>
                      {a.correct_count} / {a.incorrect_count} /{" "}
                      {a.unanswered_count}
                    </td>
                    <td>
                      {a.auto_submitted ? (
                        <Pill tone="red">Avto-yakun ({a.violations_count || 0})</Pill>
                      ) : (a.violations_count || 0) > 0 ? (
                        <Pill tone="amber">
                          {a.violations_count} ta
                          {a.away_seconds ? ` · ${a.away_seconds}s` : ""}
                        </Pill>
                      ) : (
                        <Pill tone="green">Toza</Pill>
                      )}
                      {!!a.multi_screen && (
                        <small className="muted" style={{ display: "block", marginTop: 2 }}>
                          2-ekran ulangan
                        </small>
                      )}
                    </td>
                    <td>
                      {Math.floor(a.duration_seconds / 60)}:
                      {String(a.duration_seconds % 60).padStart(2, "0")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="muted" style={{ display: "block", marginTop: 8 }}>
              O‘quvchi qatorini bossangiz, uning barcha javoblari va qoidabuzarliklar ro‘yxati ochiladi.
            </small>
          </div>
        )}
        {openAttemptId && (
          <AttemptDetailModal
            attemptId={openAttemptId}
            onClose={() => setOpenAttemptId(null)}
          />
        )}
        <Pagination
          offset={offset}
          setOffset={setOffset}
          count={d.attempts.length}
          total={d.total}
        />
      </section>
      <section className="panel question-analysis">
        <div className="panel-title">
          <div>
            <h2>Savollar kesimida</h2>
            <p>
              Faol vaqt taxminiy telemetriya. Qoidabuzarlik dalili
              hisoblanmaydi.
            </p>
          </div>
        </div>
        {d.questions.map((q: any) => (
          <div className="analysis-row" key={q.question_version_id}>
            <div>
              <strong>{q.title}</strong>
              <small>
                {levelNames[q.level]} · {q.total} urinish · o‘rtacha{" "}
                {q.avg_seconds} sek.
              </small>
            </div>
            <div className="score-bar">
              <span style={{ width: q.correct_rate + "%" }} />
            </div>
            <b>{q.correct_rate}%</b>
          </div>
        ))}
      </section>
    </>
  );
}
function TeacherCommentsModal({ card, onClose }: { card: any; onClose: () => void }) {
  const list = useData(`${base}/cards/${card.id}/comments`);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function del(cid: string) {
    if (!confirm("Ushbu izohni o‘chirmoqchimisiz?")) return;
    setBusy(true);
    try {
      await api(`${base}/cards/${card.id}/comments/${cid}`, { method: "DELETE" });
      list.reload();
      toast("Izoh o‘chirildi");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Fikrlar — ${card.title}`} close={onClose}>
      {list.loading ? (
        <Busy />
      ) : !list.data?.items?.length ? (
        <Empty title="Hali fikrlar yo‘q" text="O‘quvchilar testni yakunlagach, baho va izohlari shu yerda ko‘rinadi." />
      ) : (
        <div className="comments-list">
          {list.data.items.map((cm: any) => (
            <div className="comment-card" key={cm.id}>
              <div className="comment-head">
                <div>
                  <strong>{cm.author_name}</strong>
                  {cm.score_percent !== null && cm.score_percent !== undefined && (
                    <span className="comment-score"> · {cm.score_percent}%</span>
                  )}
                  <span className="comment-stars"> · {"★".repeat(cm.rating)}{"☆".repeat(5 - cm.rating)}</span>
                </div>
                <button
                  type="button"
                  className="btn danger tiny"
                  disabled={busy}
                  onClick={() => void del(cm.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {cm.comment && <p className="comment-text">{cm.comment}</p>}
              <small className="muted">
                {new Date(Number(cm.created_at) * 1000).toLocaleString("uz-UZ")}
              </small>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function PublicCommentsModal({ card, onClose }: { card: any; onClose: () => void }) {
  const list = useData(`/api/v2/public/cards/${encodeURIComponent(card.slug)}/comments`);
  return (
    <Modal title={`Fikrlar — ${card.title}`} close={onClose}>
      {list.loading ? (
        <Busy />
      ) : !list.data?.items?.length ? (
        <Empty title="Hali fikrlar qoldirilmagan" text="Testni yechib birinchi bo‘lib fikringizni qoldiring." />
      ) : (
        <div className="comments-list">
          {list.data.items.map((cm: any) => (
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
    </Modal>
  );
}

export function StorePage({ publicView = false }: { publicView?: boolean }) {
  const [storeTab, setStoreTab] = useState<"cards" | "packs" | "questions">("packs");
  const [planId, setPlanId] = useState<string>("free");
  useEffect(() => {
    if (publicView) return;
    api<any>(base + "/billing/status")
      .then((d) => setPlanId(d?.plan?.id || "free"))
      .catch(() => {});
  }, [publicView]);
  const [viewComments, setViewComments] = useState<any>(null);
  const marketCards = useData("/api/v2/public/market-cards");
  const storePacks = useData("/api/v2/store/packs");
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [level, setLevel] = useState(""),
    [offset, setOffset] = useState(0),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const query = useDebounce(search);
  const result = useData(
    `/api/v2/store?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}&level=${level}&offset=${offset}`,
  );
  const toast = useToast();
  async function copy(item: any) {
    setBusy(true);
    setError(null);
    try {
      await api(base + "/store/" + item.id + "/copy", {
        method: "POST",
        data: {},
      });
      toast("Savol shaxsiy bazangizga nusxalandi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function copyAllOnPage() {
    const ids = (result.data?.items || []).map((x: any) => x.id);
    if (!ids.length) return;
    if (!confirm(`Sahifadagi ${ids.length} ta savolning barchasini shaxsiy bazangizga yuklab olasizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api(base + "/store/copy-bulk", {
        method: "POST",
        data: { ids },
      });
      toast(`${res.copied} ta savol bazangizga yuklandi${res.skipped ? ` (${res.skipped} tasi mavjud)` : ""}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function copyPack(cat: string, total: number) {
    if (!confirm(`«${cat}» packidagi barcha (${total} ta) savolni shaxsiy bazangizga yuklab olasizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api(base + "/store/copy-pack", {
        method: "POST",
        data: { category: cat, limit: 100 },
      });
      toast(`«${cat}» packidan ${res.copied} ta savol bazangizga yuklandi${res.skipped ? ` (${res.skipped} tasi mavjud)` : ""}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function copyMarketCard(card: any) {
    setBusy(true);
    setError(null);
    try {
      const res = await api(base + "/market-cards/" + encodeURIComponent(card.slug) + "/copy", {
        method: "POST",
        data: {},
      });
      toast(`Test kartasi (${res.questions_total} ta savol) «Test kartalari» bo‘limiga yuklandi!`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function report(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(base + "/store/" + detail.id + "/report", {
        method: "POST",
        data: { reason: new FormData(e.currentTarget).get("reason") },
      });
      toast("Shikoyatingiz Ownerga yuborildi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <>
      <PageTitle
        eyebrow="UMUMIY SAVOLLAR BAZASI"
        title="Umumiy savollar bazasi"
        description="Owner tasdiqlagan umumiy savollar va tayyor testlar bazasi — Ustoz Pro va Ultra tariflari uchun ochiq."
        actions={
          publicView ? (
            <Link className="btn primary" to="/register">
              Workspace yaratish
            </Link>
          ) : undefined
        }
      />
      {!publicView && planId === "free" && (
        <div
          className="panel"
          style={{
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            borderColor: "#fde68a",
            background: "#fffbeb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Lock size={18} color="#d97706" />
            <div>
              <strong style={{ color: "#92400e", display: "block" }}>
                Umumiy savollar bazasidan yuklab olish — pulli tariflarda
              </strong>
              <small style={{ color: "#b45309" }}>
                Savollar va packlarni ko‘rib chiqishingiz mumkin. Shaxsiy bazangizga 1 bosishda yuklab olish uchun Ustoz Pro yoki Ultra tarifini yoqing.
              </small>
            </div>
          </div>
          <Link className="btn primary tiny" to="/pricing" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Crown size={14} /> Tarifni yangilash
          </Link>
        </div>
      )}
      <div className="tabs-bar">
        <button
          type="button"
          className={storeTab === "packs" ? "btn primary tiny" : "btn secondary tiny"}
          onClick={() => setStoreTab("packs")}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Package size={14} /> Mavzu bo‘yicha packlar ({storePacks.data?.packs?.length ?? 0})</span>
        </button>
        <button
          type="button"
          className={storeTab === "cards" ? "btn primary tiny" : "btn secondary tiny"}
          onClick={() => setStoreTab("cards")}
        >
          Tayyor testlar ({marketCards.data?.items?.length ?? 0})
        </button>
        <button
          type="button"
          className={storeTab === "questions" ? "btn primary tiny" : "btn secondary tiny"}
          onClick={() => setStoreTab("questions")}
        >
          Barcha savollar
        </button>
      </div>
      {storeTab === "packs" ? (
        <>
          {!!error && <ErrorBox error={error} />}
          {storePacks.loading ? (
            <Busy />
          ) : storePacks.error ? (
            <ErrorBox error={storePacks.error} retry={storePacks.reload} />
          ) : !storePacks.data?.packs?.length ? (
            <div className="panel">
              <Empty
                title="Hali mavzu bo‘yicha savollar packi yo‘q"
                text="Savollar bazasiga fan va mavzular bo‘yicha savollar yuklangach, ular avtomatik packlarga ajralib shu yerda chiqadi."
              />
            </div>
          ) : (
            <div className="cards-grid">
              {storePacks.data.packs.map((pk: any) => (
                <article className="panel test-card" key={pk.category} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="test-card-top">
                    <Pill tone="green"><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Package size={13} /> {pk.total} ta savol</span></Pill>
                    <small className="muted">
                      {pk.easy ? `Oson: ${pk.easy}` : ""}{pk.medium ? ` · O‘rta: ${pk.medium}` : ""}{pk.hard ? ` · Qiyin: ${pk.hard}` : ""}
                    </small>
                  </div>
                  <h3 style={{ margin: "2px 0 0" }}>{pk.category}</h3>
                  {pk.sample_titles?.length > 0 && (
                    <ul style={{ margin: "2px 0 6px", paddingLeft: 18, fontSize: 13.5, color: "#475569", display: "flex", flexDirection: "column", gap: 4 }}>
                      {pk.sample_titles.map((t: string, idx: number) => (
                        <li key={idx}>{t.length > 78 ? t.slice(0, 78) + "…" : t}</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn secondary tiny"
                      onClick={() => {
                        setCategory(pk.category);
                        setOffset(0);
                        setStoreTab("questions");
                      }}
                    >
                      Packni ko‘rish
                    </button>
                    {publicView ? (
                      <Link className="btn primary tiny" to="/register">
                        Packni yuklab olish
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn primary tiny"
                        disabled={busy}
                        onClick={() => copyPack(pk.category, pk.total)}
                      >
                        Butun packni yuklash ({pk.total})
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : storeTab === "cards" ? (
        <>
          {marketCards.loading ? (
            <Busy />
          ) : marketCards.error ? (
            <ErrorBox error={marketCards.error} retry={marketCards.reload} />
          ) : !marketCards.data?.items?.length ? (
            <div className="panel">
              <Empty
                title="Marketda hali tasdiqlangan test kartochkalari yo‘q"
                text="O‘qituvchilar test kartalarini marketga yuborib, Owner tasdiqlaganidan so‘ng ular shu yerda chiqadi."
              />
            </div>
          ) : (
            <div className="cards-grid">
              {marketCards.data.items.map((c: any) => (
                <article className="panel test-card" key={c.slug}>
                  <div className="test-card-top">
                    <Pill tone="green">{c.category || "Market testi"}</Pill>
                    <small className="muted">{c.author_name}</small>
                  </div>
                  <h2>{c.title}</h2>
                  <p>{c.description || "Ochiq market test kartochkasi"}</p>
                  {c.reward && <div className="card-reward" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Trophy size={14} color="#d97706" /> Yutuq: {c.reward}</div>}
                  <div className="market-card-stats">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={13} color="#64748b" /> {c.market_solves} yechgan</span>
                    <span>
                      ★ {c.avg_rating !== null ? c.avg_rating : "—"} ({c.comments_count})
                    </span>
                    {c.avg_score !== null && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><BarChart3 size={13} color="#0c8066" /> O‘rtacha: {c.avg_score}%</span>}
                  </div>
                  <div className="test-card-details">
                    <span>{c.question_count} savol</span>
                    <span>{c.duration_minutes} daqiqa</span>
                    <span>{c.pass_percent}% o‘tish</span>
                  </div>
                  <div className="actions">
                    <Link
                      className="btn primary"
                      style={{ flex: 1 }}
                      to={"/practice/" + encodeURIComponent(c.slug)}
                    >
                      Testni yechish
                    </Link>
                    {!publicView && (
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => void copyMarketCard(c)}
                      >
                        Kabinetga yuklash
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => setViewComments(c)}
                    >
                      Fikrlar ({c.comments_count})
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {viewComments && (
            <PublicCommentsModal
              card={viewComments}
              onClose={() => setViewComments(null)}
            />
          )}
        </>
      ) : (
      <>
      <div className="filters store-filters">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Do‘kondan qidirish"
            value={search}
            placeholder="Qanday savol izlayapsiz?"
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>
        <input
          aria-label="Store fan filtri"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setOffset(0);
          }}
          placeholder="Fan / kategoriya"
        />
        <select
          aria-label="Store daraja filtri"
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setOffset(0);
          }}
        >
          <option value="">Barcha darajalar</option>
          {Object.entries(levelNames).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {!!error && <ErrorBox error={error} />}{" "}
      {result.loading ? (
        <Busy />
      ) : result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : !result.data.items.length ? (
        <div className="panel">
          <Empty
            title="Bu yerda savollar hali yo‘q"
            text="Faqat moderatsiyadan o‘tgan savollar ko‘rsatiladi. Shaxsiy savollar avtomatik chiqmaydi."
          />
        </div>
      ) : (
        <div className="store-grid">
          {result.data.items.map((r: any) => (
            <article className="panel store-card" key={r.id}>
              <div className="question-meta">
                <span>{r.question.category}</span>
                <Pill tone="green">
                  <ShieldCheck size={12} />
                  Tasdiqlangan
                </Pill>
              </div>
              <h2>{r.question.title}</h2>
              <p>{r.question.topic || kindNames[r.question.kind]}</p>
              <div className="stat-line">
                <Pill tone="blue">{levelNames[r.question.level]}</Pill>
                <small>{r.question.points} ball</small>
              </div>
              <small>
                {r.attribution || "Muallif nomi ko‘rsatilmagan"} · CC BY 4.0
              </small>
              <div className="card-buttons">
                <button
                  className="btn secondary tiny"
                  onClick={() => {
                    setDetail(r);
                    setError(null);
                  }}
                >
                  Ko‘rish
                </button>
                {!publicView && (
                  <button
                    className="btn primary tiny"
                    disabled={busy}
                    onClick={() => void copy(r)}
                  >
                    <Plus size={14} />
                    Bazaga qo‘shish
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {result.data && (
        <Pagination
          offset={offset}
          setOffset={setOffset}
          count={result.data.items.length}
        />
      )}{" "}
      </>
      )}
      {detail && (
        <Modal title="Ochiq savol" close={() => setDetail(null)}>
          <h3>{detail.question.title}</h3>
          {detail.question.code && <pre>{detail.question.code}</pre>}
          <ol className="store-options">
            {detail.question.options.map((o: any) => (
              <li key={o.id}>
                {o.id}. {o.text}
                {detail.question.correct.includes(o.id) && (
                  <CheckCircle2 size={16} />
                )}
              </li>
            ))}
          </ol>
          <p>{detail.question.explanation}</p>
          <p className="muted">{detail.attribution} · CC BY 4.0</p>
          {!!error && <ErrorBox error={error} />}{" "}
          {!publicView && (
            <form onSubmit={report}>
              <Field label="Kontent bo‘yicha shikoyat (ixtiyoriy)">
                <textarea
                  name="reason"
                  minLength={10}
                  maxLength={2000}
                  required
                />
              </Field>
              <button className="btn secondary" disabled={busy}>
                Ownerga shikoyat yuborish
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
  return publicView ? (
    <div className="public-store">
      <Link to="/" className="back-link">
        ← Bilim UZ
      </Link>
      {content}
    </div>
  ) : (
    content
  );
}
export function SupportPage() {
  const result = useData(base + "/support"),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await api(base + "/support", {
        method: "POST",
        data: Object.fromEntries(new FormData(form)),
      });
      form.reset();
      result.reload();
      toast("Murojaatingiz qabul qilindi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="YORDAM DOIM YONINGIZDA"
        title="Bilim UZ Support"
        description="Savolingizni qoldiring. Javoblar shu sahifada saqlanadi."
      />
      {result.loading ? (
        <Busy />
      ) : result.error ? (
        <ErrorBox error={result.error} retry={result.reload} />
      ) : (
        <div className="support-layout">
          <section className="panel">
            <h2>Yangi murojaat</h2>
            {!!error && <ErrorBox error={error} />}
            <form onSubmit={submit}>
              <Field label="Mavzu">
                <input name="subject" minLength={3} maxLength={160} required />
              </Field>
              <Field label="Xabar">
                <textarea
                  name="message"
                  minLength={10}
                  maxLength={4000}
                  rows={5}
                  required
                />
              </Field>
              <p className="muted">
                Parol, maxfiy kod yoki o‘quvchilarning shaxsiy ma’lumotlarini
                yubormang.
              </p>
              <button className="btn primary" disabled={busy}>
                Murojaat yuborish <Send size={16} />
              </button>
            </form>
          </section>
          <section className="panel">
            <h2>Aloqa va murojaatlar</h2>
            {result.data.contacts.support_email && (
              <a
                className="contact-link"
                href={"mailto:" + result.data.contacts.support_email}
              >
                <Mail size={18} />
                {result.data.contacts.support_email}
              </a>
            )}
            {result.data.contacts.support_telegram && (
              <a
                className="contact-link"
                href={result.data.contacts.support_telegram}
                target="_blank"
                rel="noreferrer"
              >
                <Send size={18} />
                Telegram Support
              </a>
            )}
            {!result.data.items.length ? (
              <Empty
                title="Murojaatlar yo‘q"
                text="Yuborgan xabarlaringiz va javoblar shu yerda bo‘ladi."
              />
            ) : (
              result.data.items.map((t: any) => (
                <article className="ticket" key={t.id}>
                  <h3>{t.subject}</h3>
                  <Pill tone={t.status === "resolved" ? "green" : "amber"}>
                    {t.status === "resolved"
                      ? "Javob berilgan"
                      : "Ko‘rib chiqilmoqda"}
                  </Pill>
                  <p>{t.message}</p>
                  {t.reply && (
                    <div className="ticket-reply">
                      <strong>Bilim UZ Support</strong>
                      <p>{t.reply}</p>
                    </div>
                  )}
                  <small>{date(t.created_at)}</small>
                </article>
              ))
            )}
          </section>
        </div>
      )}
    </>
  );
}
export function SettingsPage() {
  const account = useAccount(),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const toast = useToast();
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(base + "/settings", {
        method: "PUT",
        data: Object.fromEntries(new FormData(e.currentTarget)),
      });
      account.reload();
      toast("Sozlamalar saqlandi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(base + "/account", {
        method: "DELETE",
        data: { confirmation },
      });
      location.assign("/");
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Workspace sozlamalari"
        description="Profil, shaxsiy ma’lumotlar va hisob boshqaruvi."
      />
      {!!error && <ErrorBox error={error} />}
      <section className="panel settings-panel">
        <h2>Profil va workspace</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field label="Ism va familiya">
              <input
                name="display_name"
                defaultValue={account.user.display_name}
                minLength={3}
                maxLength={120}
                required
              />
            </Field>
            <Field label="Workspace nomi">
              <input
                name="workspace_name"
                defaultValue={account.tenant.name}
                minLength={3}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Ish joyi">
              <input
                name="workplace"
                defaultValue={account.user.workplace}
                maxLength={160}
              />
            </Field>
          </div>
          <div className="account-status">
            <Pill tone={account.user.email_verified ? "green" : "neutral"}>
              Email:{" "}
              {account.user.email_verified ? "tasdiqlangan" : "ulanmagan"}
            </Pill>
            <Pill tone={account.user.phone_verified ? "green" : "neutral"}>
              Telefon:{" "}
              {account.user.phone_verified ? "tasdiqlangan" : "ulanmagan"}
            </Pill>
          </div>
          <button className="btn primary" disabled={busy}>
            Saqlash
          </button>
        </form>
      </section>
      <section className="panel settings-panel">
        <h2>Ma’lumotlaringiz</h2>
        <p>
          Workspace kontentini shaxsiy JSON arxiv sifatida yuklab oling. Faylni
          xavfsiz joyda saqlang.
        </p>
        <a className="btn secondary" href={base + "/account/export"}>
          <ArrowDownToLine size={16} />
          Ma’lumotlarni eksport qilish
        </a>
      </section>
      <section className="panel danger-zone">
        <h2>Hisobni butunlay o‘chirish</h2>
        <p>
          Workspace savollari, guruhlar va natijalar o‘chiriladi. Do‘kondagi
          takliflaringiz qaytarib olinadi. Shifrlangan backupda nusxa 7 kungacha
          qolishi mumkin.
        </p>
        <Field label="Tasdiqlash uchun HISOBIMNI O‘CHIRISH deb yozing">
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>
        <button
          className="btn danger"
          disabled={confirmation !== "HISOBIMNI O‘CHIRISH" || busy}
          onClick={() => void remove()}
        >
          Hisobimni o‘chirish
        </button>
      </section>
    </>
  );
}

const WEEKDAYS = [
  [1, "Du"],
  [2, "Se"],
  [3, "Cho"],
  [4, "Pa"],
  [5, "Ju"],
  [6, "Sha"],
  [7, "Ya"],
] as const;

const WD_SHORT: Record<number, string> = {
  1: "Du",
  2: "Se",
  3: "Cho",
  4: "Pa",
  5: "Ju",
  6: "Sha",
  7: "Ya",
};

const ATT_CYCLE = ["", "present", "late", "absent", "excused"] as const;
const ATT_META: Record<string, { label: string; title: string }> = {
  "": { label: "·", title: "Belgilanmagan" },
  present: { label: "+", title: "Keldi" },
  late: { label: "K", title: "Kechikdi" },
  absent: { label: "—", title: "Kelmadi" },
  excused: { label: "S", title: "Sababli" },
};

function dateWeekdayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WD_SHORT[wd === 0 ? 7 : wd] || "";
}

function studentStatus(avg: number | null, att: number | null) {
  if (avg === null && att === null) return { label: "Yangi", tone: "neutral" as const };
  if ((avg !== null && avg < 60) || (att !== null && att < 70))
    return { label: "Diqqat talab", tone: "red" as const };
  if ((avg === null || avg >= 85) && (att === null || att >= 85))
    return { label: "A’lo", tone: "green" as const };
  return { label: "Barqaror", tone: "blue" as const };
}

export function JournalPage() {
  const nowD = new Date();
  const todayIso = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  const [view, setView] = useState<"knowledge" | "attendance">("knowledge");
  const [month, setMonth] = useState(
    `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`,
  );
  const [groupId, setGroupId] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "knowledge" | "attendance">("knowledge");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [showSched, setShowSched] = useState(false);
  const [draftDays, setDraftDays] = useState<number[]>([1, 3, 5]);
  const [localAtt, setLocalAtt] = useState<Record<string, string>>({});
  const toast = useToast();

  const data = useData(
    `${base}/journal?month=${encodeURIComponent(month)}&group_id=${encodeURIComponent(groupId)}`,
  );

  const j = data.data;
  const activeGroupId = j?.group_id || groupId;
  const activeToday = j?.today || todayIso;

  async function saveSchedule(days: number[]) {
    if (!activeGroupId || !days.length) return;
    setBusy(true);
    setError(null);
    try {
      await api(base + "/journal/schedule", {
        method: "PUT",
        data: { group_id: activeGroupId, days },
      });
      setShowSched(false);
      data.reload();
      toast("Haftalik dars kunlari saqlandi");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleCell(studentId: string, lessonDate: string, current: string) {
    if (!activeGroupId || lessonDate !== activeToday) return;
    const idx = ATT_CYCLE.indexOf((current || "") as any);
    const next = ATT_CYCLE[(idx + 1) % ATT_CYCLE.length];
    const key = studentId + ":" + lessonDate;
    setLocalAtt((prev) => ({ ...prev, [key]: next }));
    setError(null);
    try {
      await api(base + "/journal/attendance", {
        method: "PUT",
        data: {
          group_id: activeGroupId,
          records: [{ student_id: studentId, lesson_date: lessonDate, status: next }],
        },
      });
      data.reload();
    } catch (e) {
      setLocalAtt((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
      setError(e);
    }
  }

  async function markAllPresent(lessonDate: string) {
    if (!activeGroupId || !j?.students?.length || lessonDate !== activeToday) return;
    setBusy(true);
    setError(null);
    try {
      await api(base + "/journal/attendance", {
        method: "PUT",
        data: {
          group_id: activeGroupId,
          records: j.students.map((s: any) => ({
            student_id: s.id,
            lesson_date: lessonDate,
            status: "present",
          })),
        },
      });
      setLocalAtt({});
      data.reload();
      toast(`${lessonDate} uchun barcha o‘quvchilar «Keldi (+)» deb belgilandi`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const sortedStudents = [...(j?.students || [])].sort((a: any, b: any) => {
    if (sortBy === "knowledge") return (b.avg_percent ?? -1) - (a.avg_percent ?? -1);
    if (sortBy === "attendance") return (b.attendance_percent ?? -1) - (a.attendance_percent ?? -1);
    return String(a.name).localeCompare(String(b.name));
  });

  const monthTests: any[] = j?.month_tests || [];

  return (
    <>
      <PageTitle
        eyebrow="KURS JURNALI"
        title={view === "knowledge" ? "Oylik bilim jurnali" : "Kunlik davomat jurnali"}
        description={
          view === "knowledge"
            ? "Guruh o‘quvchilarining oylik bilim foizlari, test natijalari va o‘zlashtirish ko‘rsatkichlari."
            : "Haftalik dars jadvali asosida kunlik davomatni belgilash va oylik qatnashuvni kuzatish."
        }
        actions={
          activeGroupId ? (
            <div className="journal-top-actions">
              <button
                type="button"
                className={view === "knowledge" ? "btn primary" : "btn secondary"}
                onClick={() => setView("knowledge")}
              >
                Bilim foizlari
              </button>
              <button
                type="button"
                className={view === "attendance" ? "btn primary" : "btn secondary"}
                onClick={() => setView("attendance")}
              >
                Davomat
              </button>
              <a
                className="btn ghost"
                href={`${base}/journal/export.csv?group_id=${encodeURIComponent(activeGroupId)}&month=${encodeURIComponent(month)}`}
              >
                CSV
              </a>
            </div>
          ) : undefined
        }
      />
      {!!error && <ErrorBox error={error} />}
      {data.loading && !j ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !j?.groups?.length ? (
        <div className="panel">
          <Empty
            title="Avval guruh va o‘quvchilar yarating"
            text="Kurs jurnali ishlashi uchun «Guruhlar» bo‘limida guruh ochib, unga o‘quvchilarni biriktiring."
            action={
              <Link to="/studio/groups" className="btn primary">
                Guruhlarga o‘tish
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="panel journal-bar">
            <div className="journal-controls">
              <Field label="Guruh">
                <select
                  value={activeGroupId}
                  onChange={(e) => {
                    setGroupId(e.target.value);
                    setExpandedId(null);
                    setLocalAtt({});
                  }}
                >
                  {j.groups.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Oy">
                <input
                  type="month"
                  value={month}
                  onChange={(e) => {
                    setMonth(e.target.value);
                    setLocalAtt({});
                  }}
                />
              </Field>
              {view === "knowledge" ? (
                <Field label="Saralash">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                  >
                    <option value="knowledge">Bilim foizi (yuqoridan)</option>
                    <option value="attendance">Davomat (yuqoridan)</option>
                    <option value="name">Ism bo‘yicha (A–Z)</option>
                  </select>
                </Field>
              ) : (
                <div className="journal-att-tools">
                  <button
                    type="button"
                    className="btn secondary tiny"
                    onClick={() => {
                      setDraftDays(j?.schedule_days || [1, 3, 5]);
                      setShowSched((v) => !v);
                    }}
                  >
                    Dars kunlari ({(j?.schedule_days || [1, 3, 5]).map((d: number) => WD_SHORT[d]).join(", ")})
                  </button>
                  <div className="journal-legend">
                    <span className="att-pill present">+ Keldi</span>
                    <span className="att-pill late">K Kechikdi</span>
                    <span className="att-pill absent">— Kelmadi</span>
                    <span className="att-pill excused">S Sababli</span>
                  </div>
                </div>
              )}
            </div>

            {view === "attendance" && showSched && (
              <div className="journal-sched">
                <strong>Haftalik dars kunlarini belgilang:</strong>
                <div className="journal-days">
                  {WEEKDAYS.map(([num, label]) => {
                    const active = draftDays.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        className={active ? "btn primary tiny" : "btn secondary tiny"}
                        onClick={() =>
                          setDraftDays((prev) =>
                            prev.includes(num)
                              ? prev.length > 1
                                ? prev.filter((x) => x !== num)
                                : prev
                              : [...prev, num].sort((a, b) => a - b),
                          )
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="btn primary tiny"
                    disabled={busy}
                    onClick={() => void saveSchedule(draftDays)}
                  >
                    Saqlash
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="journal-kpis">
            <div className="panel">
              <small className="muted">O‘rtacha bilim (oylik)</small>
              <strong>{j.summary.avg_knowledge}%</strong>
            </div>
            <div className="panel">
              <small className="muted">O‘tgan / Jami testlar</small>
              <strong>
                {j.summary.tests_passed} / {j.summary.tests_taken}
              </strong>
            </div>
            <div className="panel">
              <small className="muted">O‘rtacha davomat</small>
              <strong>{j.summary.avg_attendance}%</strong>
            </div>
            <div className="panel">
              <small className="muted">O‘quvchilar / Diqqat talab</small>
              <strong>
                {j.summary.student_count}
                {j.summary.at_risk_count > 0 && (
                  <span className="kpi-risk"> · {j.summary.at_risk_count} ta</span>
                )}
              </strong>
            </div>
          </div>

          <section className="panel">
            {!j.students.length ? (
              <Empty
                title="Bu guruhda o‘quvchilar yo‘q"
                text="«O‘quvchilar» bo‘limidan ushbu guruhga o‘quvchilar qo‘shing."
                action={
                  <Link to="/studio/students" className="btn primary">
                    O‘quvchi qo‘shish
                  </Link>
                }
              />
            ) : view === "knowledge" ? (
              <>
                <div className="table-wrap">
                  <table className="journal-table knowledge-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>O‘quvchi</th>
                        {monthTests.map((t: any) => (
                          <th key={t.key} className="test-col" title={t.title}>
                            <div className="test-col-title">{t.title}</div>
                          </th>
                        ))}
                        <th>Oylik bilim</th>
                        <th>Testlar</th>
                        <th>Davomat</th>
                        <th>Holat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedStudents.flatMap((s: any, idx: number) => {
                        const st = studentStatus(s.avg_percent, s.attendance_percent);
                        const isOpen = expandedId === s.id;
                        const rowsOut = [
                            <tr
                              key={s.id}
                              className={"j-row" + (isOpen ? " is-open" : "")}
                              onClick={() => setExpandedId(isOpen ? null : s.id)}
                            >
                              <td className="muted">{idx + 1}</td>
                              <td>
                                <div className="student-name-cell">
                                  <strong>{s.name}</strong>
                                  {s.note && <span className="student-note-tag">{s.note}</span>}
                                </div>
                                <small className="muted" style={{ display: "block" }}>
                                  {s.student_code}
                                </small>
                              </td>
                              {monthTests.map((t: any) => {
                                const sc = s.test_scores?.[t.key];
                                return (
                                  <td key={t.key} className="test-col">
                                    {sc ? (
                                      <Pill tone={sc.passed ? "green" : sc.percentage >= 50 ? "amber" : "red"}>
                                        {sc.percentage}%
                                      </Pill>
                                    ) : (
                                      <span className="muted">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td>
                                {s.avg_percent !== null ? (
                                  <div className="know-cell">
                                    <div className="know-bar">
                                      <span
                                        className={
                                          s.avg_percent >= 70
                                            ? "is-good"
                                            : s.avg_percent >= 50
                                              ? "is-mid"
                                              : "is-low"
                                        }
                                        style={{ width: Math.min(100, s.avg_percent) + "%" }}
                                      />
                                    </div>
                                    <strong>{s.avg_percent}%</strong>
                                  </div>
                                ) : (
                                  <span className="muted">Test yo‘q</span>
                                )}
                              </td>
                              <td>
                                <strong>{s.tests_passed}</strong> / {s.tests_taken}
                              </td>
                              <td>
                                {s.attendance_percent !== null ? (
                                  <span className="att-mini">
                                    <strong>{s.attendance_percent}%</strong>
                                    <small className="muted">
                                      ({s.present_count + s.late_count}/{s.marked_lessons})
                                    </small>
                                  </span>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                              <td>
                                <Pill tone={st.tone}>{st.label}</Pill>
                              </td>
                            </tr>
                        ];
                        if (isOpen) rowsOut.push(
                              <tr key={s.id + "-detail"} className="j-detail-row">
                                <td colSpan={6 + monthTests.length}>
                                  <div className="j-detail-box">
                                    <div className="j-detail-head">
                                      <strong>{s.name}{s.note ? ` (${s.note})` : ""} — oylik tafsilotlar</strong>
                                      <div className="journal-legend">
                                        <span className="att-pill present">Keldi: {s.present_count}</span>
                                        <span className="att-pill late">Kechikdi: {s.late_count}</span>
                                        <span className="att-pill absent">Kelmadi: {s.absent_count}</span>
                                        <span className="att-pill excused">Sababli: {s.excused_count}</span>
                                      </div>
                                    </div>
                                    {!s.all_tests?.length ? (
                                      <p className="muted" style={{ margin: 0 }}>
                                        Ushbu oyda hali test topshirilmagan.
                                      </p>
                                    ) : (
                                      <div className="j-tests-grid">
                                        {s.all_tests.map((t: any, i: number) => (
                                          <div className="j-test-chip" key={i}>
                                            <div>
                                              <strong>{t.title}</strong>
                                              <small className="muted" style={{ display: "block" }}>
                                                {new Date(t.submitted_at * 1000).toLocaleDateString("uz-UZ")} · {t.score}/{t.max_score} ball
                                              </small>
                                            </div>
                                            <Pill tone={t.passed ? "green" : "red"}>
                                              {t.percentage}%
                                            </Pill>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                        );
                        return rowsOut;
                      })}
                    </tbody>
                  </table>
                </div>
                <small className="muted" style={{ display: "block", marginTop: 10 }}>
                  Maslahat: o‘quvchi qatorini bossangiz, uning barcha oylik testlari va davomat tafsiloti ochiladi.
                </small>
              </>
            ) : (
              <>
              <div className="att-lock-notice">
                <strong style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Lock size={14} color="#d97706" /> Davomat qoidasi:</strong> Davomat faqat bugungi dars kuni (<strong>{activeToday}</strong>) belgilanadi. O‘tgan kunlar avtomatik qulflanadi va tahrirlanmaydi.
              </div>
              <div className="table-wrap">
                <table className="journal-table att-table">
                  <thead>
                    <tr>
                      <th className="sticky-col">O‘quvchi</th>
                      {j.lesson_dates.map((d: string) => {
                        const isToday = d === activeToday;
                        const isPast = d < activeToday;
                        return (
                          <th
                            key={d}
                            className={
                              "date-col" +
                              (isToday ? " is-today" : isPast ? " is-past" : " is-future")
                            }
                          >
                            <div className="date-wd">{dateWeekdayLabel(d)}</div>
                            <div className="date-num">{d.slice(8)}</div>
                            {isToday ? (
                              <button
                                type="button"
                                className="mark-all-btn"
                                title={d + " — barchasini Keldi (+) qilish"}
                                disabled={busy}
                                onClick={() => void markAllPresent(d)}
                              >
                                ✓
                              </button>
                            ) : (
                              <span
                                className="date-lock-icon"
                                title={
                                  isPast
                                    ? "O‘tgan sana — tahrirlash bloklangan"
                                    : "Kelajakdagi sana — dars kuni ochiladi"
                                }
                              >
                                {isPast ? <Lock size={12} color="#94a3b8" /> : "·"}
                              </span>
                            )}
                          </th>
                        );
                      })}
                      <th className="num-col">Keldi</th>
                      <th className="num-col">Yo‘q</th>
                      <th className="num-col">Davomat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.students.map((s: any) => (
                      <tr key={s.id}>
                        <td className="sticky-col">
                          <div className="student-name-cell">
                            <strong>{s.name}</strong>
                            {s.note && <span className="student-note-tag">{s.note}</span>}
                          </div>
                          <small className="muted" style={{ display: "block" }}>
                            {s.student_code}
                          </small>
                        </td>
                        {j.lesson_dates.map((d: string) => {
                          const key = s.id + ":" + d;
                          const st = key in localAtt ? localAtt[key] : s.attendance[d] || "";
                          const meta = ATT_META[st] || ATT_META[""];
                          const isToday = d === activeToday;
                          const isPast = d < activeToday;
                          const lockedTip = isPast
                            ? " (qulflangan — o‘zgartirib bo‘lmaydi)"
                            : " (hali ochilmagan)";
                          return (
                            <td
                              key={d}
                              className={
                                "date-col" +
                                (isToday ? " is-today" : isPast ? " is-past" : " is-future")
                              }
                            >
                              <button
                                type="button"
                                disabled={!isToday}
                                className={
                                  "att-btn " +
                                  (st ? "is-" + st : "is-none") +
                                  (!isToday ? " is-locked" : "")
                                }
                                title={`${s.name} · ${d}: ${meta.title}${isToday ? "" : lockedTip}`}
                                onClick={() => void toggleCell(s.id, d, st)}
                              >
                                {meta.label}
                              </button>
                            </td>
                          );
                        })}
                        <td className="num-col">{s.present_count + s.late_count}</td>
                        <td className="num-col">{s.absent_count}</td>
                        <td className="num-col">
                          {s.attendance_percent !== null ? (
                            <Pill tone={s.attendance_percent >= 80 ? "green" : s.attendance_percent >= 50 ? "amber" : "red"}>
                              {s.attendance_percent}%
                            </Pill>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}


function OfflinePdfModal({ close }: { close: () => void }) {
  const [title, setTitle] = useState("Bilim UZ — Nazorat testi");
  const [category, setCategory] = useState("");
  const [count, setCount] = useState(15);
  const [variants, setVariants] = useState(2);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [includeKey, setIncludeKey] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cats = useData(base + "/questions?limit=100");

  const allCats: string[] = Array.from(
    new Set(((cats.data?.items || []) as any[]).map((q) => String(q.category || "")).filter(Boolean)),
  ).sort();

  function esc(str: string) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function generatePrintSheet(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const qs: any[] = [];
      let off = 0;
      while (qs.length < 300) {
        const res = await api(
          `${base}/questions?limit=100&offset=${off}&category=${encodeURIComponent(category)}`,
        );
        const batch: any[] = res.items || [];
        qs.push(...batch);
        if (batch.length < 100) break;
        off += 100;
      }
      if (!qs.length) throw new Error("Tanlangan fan bo‘yicha savollar topilmadi.");
      const take = Math.min(Math.max(1, count), qs.length);
      const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];

      const variantSheets: { num: number; html: string; keys: string[] }[] = [];
      for (let v = 1; v <= variants; v++) {
        const picked = shuffle(qs).slice(0, take);
        const keys: string[] = [];
        const itemsHtml = picked
          .map((q, idx) => {
            const rawOpts: any[] = q.options || [];
            const corrSet = new Set<string>(q.correct || []);
            const opts =
              shuffleOptions && q.kind !== "truefalse" ? shuffle(rawOpts) : rawOpts;
            const mappedCorrect: string[] = [];
            const optsHtml = opts
              .map((o, oi) => {
                const L = letters[oi] || String(oi + 1);
                if (corrSet.has(o.id)) mappedCorrect.push(L);
                return `<div class="opt"><b>${L})</b> ${esc(o.text)}</div>`;
              })
              .join("");
            keys.push(mappedCorrect.join(", ") || "—");
            return `<div class="q-item">
              <div class="q-title"><b>${idx + 1}.</b> ${esc(q.title)}</div>
              ${q.code ? `<pre class="q-code">${esc(q.code)}</pre>` : ""}
              <div class="q-opts">${optsHtml}</div>
            </div>`;
          })
          .join("");

        variantSheets.push({
          num: v,
          keys,
          html: `<section class="sheet ${v > 1 ? "page-break" : ""}">
            <div class="sheet-head">
              <div>
                <div class="brand">Bilim UZ · Powered by SysOne</div>
                <h1>${esc(title)}</h1>
                <div class="sub">${category ? esc(category) + " · " : ""}${take} ta savol</div>
              </div>
              <div class="variant-box">${v}-VARIANT</div>
            </div>
            <div class="student-line">
              <span>F.I.Sh.: ______________________________________</span>
              <span>Sinf / Guruh: _______________</span>
              <span>Sana: ___.___.20___</span>
            </div>
            <div class="q-grid">${itemsHtml}</div>
          </section>`,
        });
      }

      let keyPageHtml = "";
      if (includeKey) {
        const rowsHtml = Array.from({ length: take }, (_, i) => {
          const cols = variantSheets.map((vs) => `<td><b>${esc(vs.keys[i])}</b></td>`).join("");
          return `<tr><td>${i + 1}</td>${cols}</tr>`;
        }).join("");
        const headCols = variantSheets.map((vs) => `<th>${vs.num}-variant</th>`).join("");
        keyPageHtml = `<section class="sheet page-break">
          <div class="sheet-head">
            <div>
              <div class="brand">O‘QITUVCHI UCHUN · MAXFIY</div>
              <h1>Javoblar kaliti — ${esc(title)}</h1>
            </div>
            <div class="variant-box">KALIT</div>
          </div>
          <table class="key-table">
            <thead><tr><th>#</th>${headCols}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </section>`;
      }

      const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8" />
        <title>${esc(title)} — Bilim UZ</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, Arial, sans-serif; color: #111827; font-size: 11px; line-height: 1.42; background: #fff; }
          .toolbar { position: sticky; top: 0; background: #162d3d; color: #fff; padding: 10px 18px; display: flex; justify-content: space-between; align-items: center; }
          .toolbar button { background: #10b981; color: #fff; border: 0; padding: 8px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 13px; }
          .sheet { max-width: 190mm; margin: 14px auto; padding: 4px; }
          .page-break { page-break-before: always; break-before: page; }
          .sheet-head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #162d3d; padding-bottom: 8px; margin-bottom: 10px; }
          .brand { font-size: 10px; font-weight: 700; color: #0c8066; text-transform: uppercase; letter-spacing: 0.6px; }
          h1 { margin: 2px 0; font-size: 16px; color: #162d3d; }
          .sub { font-size: 11px; color: #475569; }
          .variant-box { border: 2px solid #162d3d; padding: 6px 14px; border-radius: 8px; font-size: 14px; font-weight: 800; color: #162d3d; }
          .student-line { display: flex; justify-content: space-between; gap: 10px; font-size: 11px; margin-bottom: 12px; padding: 6px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
          .q-grid { column-count: 2; column-gap: 16px; }
          .q-item { break-inside: avoid; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px dotted #cbd5e1; }
          .q-title { margin-bottom: 4px; font-size: 11.2px; }
          .q-code { background: #f1f5f9; padding: 5px 7px; border-radius: 5px; font-size: 10px; overflow-x: auto; margin: 4px 0; }
          .q-opts { padding-left: 8px; }
          .opt { margin-bottom: 2px; }
          .key-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
          .key-table th, .key-table td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; }
          .key-table th { background: #162d3d; color: #fff; }
          .key-table tr:nth-child(even) { background: #f8fafc; }
          @media print { .toolbar { display: none !important; } .sheet { margin: 0; } }
        </style></head><body>
        <div class="toolbar">
          <span><b>Bilim UZ — Oflayn A4 Test Varaqasi</b> (${variants} ta variant, ${take} ta savol)</span>
          <button onclick="window.print()">Chop etish / PDF saqlash</button>
        </div>
        ${variantSheets.map((x) => x.html).join("")}
        ${keyPageHtml}
      </body></html>`;

      const win = window.open("", "_blank");
      if (!win) throw new Error("Brauzer yangi oynani blokladi — popup ga ruxsat bering.");
      win.document.open();
      win.document.write(html);
      win.document.close();
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Oflayn imtihon uchun PDF test varaqasi" close={close}>
      {!!error && <ErrorBox error={error} />}
      <form onSubmit={generatePrintSheet}>
        <Field label="Imtihon sarlavhasi">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Fan / kategoriya">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Barcha fanlar</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <div className="hw-two-col">
          <Field label="Har bir variantda savollar soni">
            <input type="number" min={5} max={100} value={count} onChange={(e) => setCount(Number(e.target.value))} required />
          </Field>
          <Field label="Variantlar soni">
            <select value={variants} onChange={(e) => setVariants(Number(e.target.value))}>
              <option value={1}>1 ta variant</option>
              <option value={2}>2 ta variant (1-, 2-variant)</option>
              <option value={3}>3 ta variant</option>
              <option value={4}>4 ta variant</option>
            </select>
          </Field>
        </div>
        <label className="mod-check-inline" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} />
          <span>Javob variantlarini ham (A, B, C, D) aralashtirish</span>
        </label>
        <label className="mod-check-inline" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
          <span>Oxirgi sahifada O‘qituvchi javoblar kalitini chiqarish</span>
        </label>
        <button className="btn primary full" disabled={busy}>
          {busy ? "Tayyorlanmoqda…" : "A4 Test varaqasini ochish (PDF)"}
        </button>
      </form>
    </Modal>
  );
}
