import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Eye,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "./api";
import { parseBookFileToChapters, type ParsedChapter } from "./docx-parser";
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
  useToast,
} from "./ui";

const SUBJECT_SUGGESTIONS = [
  "Informatika",
  "Kompyuter savodxonligi",
  "Matematika",
  "Fizika",
  "Ingliz tili",
  "Python",
  "Web dasturlash",
  "Tarix",
  "Biologiya",
  "Kimyo",
];

function renderInline(text: string) {
  const parts: any[] = [];
  const re = /(\x60[^\x60]+\x60|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**") && tok.endsWith("**")) {
      parts.push(<strong key={"b-" + k++}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      parts.push(<code className="lib-kbd" key={"k-" + k++}>{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function QuizRevealCard({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"lib-quiz-card" + (open ? " is-open" : "")}>
      <div className="lib-quiz-q">
        <span className="lib-quiz-badge">🎯 O‘zingizni sinang</span>
        <p>{renderInline(question)}</p>
      </div>
      <button
        type="button"
        className="btn secondary tiny"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Javobni yashirish" : "Javobni ko‘rish"}
      </button>
      {open && <div className="lib-quiz-a">{renderInline(answer)}</div>}
    </div>
  );
}

function renderBookBlocks(text: string) {
  const lines = String(text || "").split("\n");
  const blocks: any[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listBuf: string[] = [];
  let tableBuf: string[][] = [];

  const flushList = (key: string) => {
    if (!listBuf.length) return;
    blocks.push(
      <ul className="lib-list" key={key}>
        {listBuf.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  };

  const flushTable = (key: string) => {
    if (!tableBuf.length) return;
    const rows = tableBuf.filter((r) => !r.every((c) => /^[-:]+$/.test(c.trim())));
    if (rows.length) {
      const [head, ...body] = rows;
      blocks.push(
        <div className="lib-table-wrap" key={key}>
          <table className="lib-table">
            <thead>
              <tr>
                {head.map((c, i) => (
                  <th key={i}>{renderInline(c.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{renderInline(c.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    tableBuf = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      flushList("l-" + idx);
      flushTable("t-" + idx);
      if (inCode) {
        blocks.push(
          <pre className="code-block" key={"c-" + idx}>
            {codeBuf.join("\n")}
          </pre>,
        );
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      return;
    }
    if (inCode) {
      codeBuf.push(raw);
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flushList("l-" + idx);
      flushTable("t-" + idx);
      return;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList("l-" + idx);
      const cells = trimmed.slice(1, -1).split("|");
      tableBuf.push(cells);
      return;
    }
    flushTable("t-" + idx);

    if (trimmed.startsWith("??? ") && trimmed.includes("||")) {
      flushList("l-" + idx);
      const body = trimmed.slice(4);
      const sep = body.indexOf("||");
      const q = body.slice(0, sep).trim();
      const a = body.slice(sep + 2).trim();
      blocks.push(<QuizRevealCard key={"qz-" + idx} question={q} answer={a} />);
    } else if (trimmed.startsWith("> ")) {
      flushList("l-" + idx);
      const content = trimmed.slice(2).trim();
      let tone = "info";
      if (content.startsWith("💡")) tone = "tip";
      else if (content.startsWith("⚠️") || content.startsWith("🚨")) tone = "warn";
      else if (content.startsWith("🧠")) tone = "fact";
      blocks.push(
        <div className={"lib-callout is-" + tone} key={"q-" + idx}>
          {renderInline(content)}
        </div>,
      );
    } else if (trimmed.startsWith("### ")) {
      flushList("l-" + idx);
      blocks.push(<h3 key={"h3-" + idx}>{renderInline(trimmed.slice(4))}</h3>);
    } else if (trimmed.startsWith("## ")) {
      flushList("l-" + idx);
      blocks.push(<h2 key={"h2-" + idx}>{renderInline(trimmed.slice(3))}</h2>);
    } else if (trimmed.startsWith("# ")) {
      flushList("l-" + idx);
      blocks.push(<h2 key={"h1-" + idx}>{renderInline(trimmed.slice(2))}</h2>);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listBuf.push(trimmed.slice(2));
    } else {
      flushList("l-" + idx);
      blocks.push(<p key={"p-" + idx}>{renderInline(trimmed)}</p>);
    }
  });
  flushList("l-end");
  flushTable("t-end");
  if (inCode && codeBuf.length) {
    blocks.push(
      <pre className="code-block" key="c-end">
        {codeBuf.join("\n")}
      </pre>,
    );
  }
  return blocks;
}

export function LibraryCatalog() {
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const debounced = useDebounce(search, 250);
  const data = useData(
    `/api/v2/library?q=${encodeURIComponent(debounced)}&subject=${encodeURIComponent(subject)}`,
  );
  const items: any[] = data.data?.items || [];
  const subjects: { name: string; count: number }[] = data.data?.subjects || [];

  return (
    <div className="exam-join lib-page">
      <Link to="/" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }} className="back-link">
        <ArrowLeft size={17} />
        Orqaga
      </Link>

      <div className="panel lib-hero">
        <span className="eyebrow">BILIM UZ · ELEKTRON KUTUBXONA</span>
        <h1>Fanlar bo‘yicha darsliklar va qo‘llanmalar</h1>
        <p className="muted">
          Kitob nomi, qisqa tavsif, kalit so‘z yoki istalgan mavzu matni bo‘yicha qidiring — tizim bazadagi barcha kitob va boblar ichidan topib beradi.
        </p>
        <div className="lib-search-box">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Masalan: operatsion tizim, Python for sikli, Pifagor teoremasi…"
          />
          {search && (
            <button
              type="button"
              className="btn ghost tiny"
              onClick={() => setSearch("")}
            >
              Tozalash
            </button>
          )}
        </div>

        {subjects.length > 0 && (
          <div className="lib-subjects">
            <button
              type="button"
              className={subject === "" ? "btn primary tiny" : "btn secondary tiny"}
              onClick={() => setSubject("")}
            >
              Barcha fanlar
            </button>
            {subjects.map((s) => (
              <button
                key={s.name}
                type="button"
                className={subject === s.name ? "btn primary tiny" : "btn secondary tiny"}
                onClick={() => setSubject(s.name)}
              >
                {s.name} ({s.count})
              </button>
            ))}
          </div>
        )}
      </div>

      {data.loading ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : !items.length ? (
        <div className="panel">
          <Empty
            title="Mos kitob topilmadi"
            text={
              search
                ? `"${search}" so‘rovi bo‘yicha ma’lumot topilmadi. Boshqa so‘z bilan qidirib ko‘ring.`
                : "Kutubxonaga hali ochiq kitoblar qo‘shilmagan."
            }
          />
        </div>
      ) : (
        <div className="cards-grid">
          {items.map((b: any) => {
            const href =
              "/library/" +
              encodeURIComponent(b.id) +
              (b.match_chapter_id ? "?ch=" + encodeURIComponent(b.match_chapter_id) : "");
            return (
              <article className="panel test-card lib-card" key={b.id}>
                <div className="test-card-top">
                  <Pill tone="blue">{b.subject}</Pill>
                  <small className="muted lib-views">
                    <Eye size={13} /> {b.views_count}
                  </small>
                </div>
                <h2>{b.title}</h2>
                {b.match_chapter_title && (
                  <div className="lib-match-badge">
                    Topilgan bob: <strong>{b.match_chapter_title}</strong>
                  </div>
                )}
                <p className="lib-snippet">
                  {b.match_snippet || b.summary || "Elektron o‘quv qo‘llanma"}
                </p>
                <div className="test-card-details">
                  <span>
                    <BookOpen size={15} />
                    {b.chapter_count} ta bob
                  </span>
                  {b.author_name && <span>{b.author_name}</span>}
                </div>
                <Link className="btn primary full" to={href}>
                  Kitobni o‘qish
                  <ArrowRight size={17} />
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LibraryBookReader() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [fontSize, setFontSize] = useState(16);
  const [copying, setCopying] = useState(false);
  const toast = useToast();
  const data = useData("/api/v2/library/" + encodeURIComponent(id));
  async function copyBookToStudio() {
    if (!book) return;
    setCopying(true);
    try {
      const res = await api("/api/v2/teacher/library/copy/" + encodeURIComponent(book.id), {
        method: "POST",
        data: {},
      });
      toast(`Kitob va ${res.chapters} ta bob «Studio → Kutubxona» bo‘limiga nusxalandi!`);
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403) {
        toast("Kitobni kabinetga qo‘shish uchun avval o‘qituvchi sifatida tizimga kiring.");
      } else {
        toast(e?.message || "Nusxalashda xatolik yuz berdi");
      }
    } finally {
      setCopying(false);
    }
  }

  const book = data.data?.book;
  const chapters: any[] = data.data?.chapters || [];
  const related: any[] = data.data?.related || [];
  const requestedCh = params.get("ch");
  const activeIdx = Math.max(
    0,
    requestedCh ? chapters.findIndex((c) => c.id === requestedCh) : 0,
  );
  const activeChapter = chapters[activeIdx] || null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeIdx, id]);

  if (data.loading) return <Busy />;
  if (data.error || !book) {
    return (
      <div className="exam-join">
        <Link to="/library" className="back-link">
          <ArrowLeft size={17} />
          Kutubxonaga qaytish
        </Link>
        <ErrorBox error={data.error || new Error("Kitob topilmadi")} retry={data.reload} />
      </div>
    );
  }

  return (
    <div className="lib-reader-wrap">
      <div className="lib-reader-top">
        <Link to="/library" className="back-link" style={{ margin: 0 }}>
          <ArrowLeft size={17} />
          Kutubxona
        </Link>
        <div className="lib-reader-tools">
          <button
            type="button"
            className="btn secondary tiny"
            onClick={() => setFontSize((s) => Math.max(13, s - 1))}
          >
            A-
          </button>
          <button
            type="button"
            className="btn secondary tiny"
            onClick={() => setFontSize((s) => Math.min(22, s + 1))}
          >
            A+
          </button>
          <button
            type="button"
            className="btn primary tiny"
            disabled={copying}
            onClick={() => void copyBookToStudio()}
          >
            <Plus size={14} /> {copying ? "Yuklanmoqda…" : "Kabinetimga qo‘shish"}
          </button>
          <button
            type="button"
            className="btn secondary tiny"
            onClick={() => window.print()}
          >
            <Printer size={14} /> Chop etish / PDF
          </button>
        </div>
      </div>

      <div className="lib-reader-grid">
        <aside className="panel lib-toc">
          <Pill tone="blue">{book.subject}</Pill>
          <h2 className="lib-book-name">{book.title}</h2>
          {book.author_name && <small className="muted">Muallif: {book.author_name}</small>}
          {book.summary && <p className="lib-book-desc">{book.summary}</p>}
          <div className="lib-toc-title">Mundarija ({chapters.length})</div>
          {!chapters.length ? (
            <small className="muted">Hali boblar qo‘shilmagan.</small>
          ) : (
            <ol className="lib-toc-list">
              {chapters.map((ch: any, idx: number) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    className={idx === activeIdx ? "active" : ""}
                    onClick={() => setParams({ ch: ch.id })}
                  >
                    <span>{idx + 1}.</span> {ch.title}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {book.linked_card_slug && (
            <Link
              to={"/t/" + encodeURIComponent(book.linked_card_slug)}
              className="btn primary full"
              style={{ marginTop: 14 }}
            >
              Mavzu bo‘yicha test yechish
              <ArrowRight size={16} />
            </Link>
          )}
        </aside>

        <article className="panel lib-content" style={{ fontSize }}>
          {book.pdf_key ? (
            <div className="lib-pdf-reader">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <span className="eyebrow">PDF KITOB · {book.subject.toUpperCase()}</span>
                  <h1 style={{ margin: "4px 0 0" }}>{book.title}</h1>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href={"/api/v2/media/" + book.pdf_key}
                    target="_blank"
                    rel="noreferrer"
                    className="btn secondary tiny"
                  >
                    To‘liq ekranda ochish
                  </a>
                  <a
                    href={"/api/v2/media/" + book.pdf_key}
                    download={book.pdf_name || "kitob.pdf"}
                    className="btn primary tiny"
                  >
                    PDF yuklab olish
                  </a>
                </div>
              </div>
              {book.summary && <div className="lib-ch-summary">{book.summary}</div>}
              <iframe
                src={"/api/v2/media/" + book.pdf_key}
                title={book.title}
                className="lib-pdf-frame"
              />
              {book.linked_card_slug && (
                <div className="lib-nav-footer">
                  <span />
                  <Link
                    to={"/t/" + encodeURIComponent(book.linked_card_slug)}
                    className="btn primary"
                  >
                    Testni topshirish <ArrowRight size={16} />
                  </Link>
                </div>
              )}
            </div>
          ) : !activeChapter ? (
            <Empty
              title="Kitob hali to‘ldirilmagan"
              text="O‘qituvchi ushbu kitobga hali boblar qo‘shmagan."
            />
          ) : (
            <>
              <span className="eyebrow">
                {activeIdx + 1}-BOB · {book.subject.toUpperCase()}
              </span>
              <h1>{activeChapter.title}</h1>
              {activeChapter.summary && (
                <div className="lib-ch-summary">{activeChapter.summary}</div>
              )}
              <div className="lib-prose">{renderBookBlocks(activeChapter.content)}</div>

              <div className="lib-nav-footer">
                {activeIdx > 0 ? (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setParams({ ch: chapters[activeIdx - 1].id })}
                  >
                    <ArrowLeft size={16} /> Oldingi bob
                  </button>
                ) : (
                  <span />
                )}
                {activeIdx < chapters.length - 1 ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => setParams({ ch: chapters[activeIdx + 1].id })}
                  >
                    Keyingi bob <ArrowRight size={16} />
                  </button>
                ) : book.linked_card_slug ? (
                  <Link
                    to={"/t/" + encodeURIComponent(book.linked_card_slug)}
                    className="btn primary"
                  >
                    Testni topshirish <ArrowRight size={16} />
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </article>
      </div>

      {related.length > 0 && (
        <section className="panel" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>Shu fandagi boshqa kitoblar</h3>
          <div className="cards-grid">
            {related.map((r: any) => (
              <Link className="lib-rel-card" key={r.id} to={"/library/" + r.id}>
                <strong>{r.title}</strong>
                <small className="muted">{r.summary || r.subject}</small>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// --- O'QITUVCHI KUTUBXONA BOSHQARUVI (/studio/library) ---
export function LibraryStudio() {
  const base = "/api/v2/teacher/library";
  const list = useData(base);
  const [editBook, setEditBook] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [chaptersBookId, setChaptersBookId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toast = useToast();

  async function saveBook(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: editBook.title,
        subject: editBook.subject,
        summary: editBook.summary || "",
        tags: editBook.tags || "",
        author_name: editBook.author_name || "",
        linked_card_slug: editBook.linked_card_slug || "",
        published: editBook.published !== false,
      };
      if (editBook.id) {
        await api(base + "/" + editBook.id, { method: "PUT", data: payload });
        toast("Kitob yangilandi");
      } else {
        const created = await api(base, { method: "POST", data: payload });
        toast("Yangi kitob yaratildi — endi boblar qo‘shishingiz mumkin");
        setChaptersBookId(created.id);
      }
      setEditBook(null);
      list.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function removeBook(b: any) {
    if (!confirm(`"${b.title}" kitobini barcha boblari bilan o‘chirmoqchimisiz?`)) return;
    setBusy(true);
    try {
      await api(base + "/" + b.id, { method: "DELETE" });
      toast("Kitob o‘chirildi");
      list.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="ELEKTRON KUTUBXONA"
        title="Kutubxona boshqaruvi"
        description="Fanlar bo‘yicha darsliklar va boblarni yarating. Ochiq kitoblar /library sahifasida qidiruv orqali hamma uchun ko‘rinadi."
        actions={
          <>
            <Link className="btn secondary" to="/library" target="_blank">
              Ochiq kutubxonani ko‘rish
            </Link>
            <button type="button" className="btn secondary" onClick={() => setShowImport(true)}>📄 Word / PDF dan yuklash</button>
            <button
              type="button"
              className="btn primary"
              onClick={() =>
                setEditBook({
                  title: "",
                  subject: "",
                  summary: "",
                  tags: "",
                  author_name: "",
                  linked_card_slug: "",
                  published: true,
                })
              }
            >
              <Plus size={16} /> Yangi kitob
            </button>
          </>
        }
      />
      {!!error && <ErrorBox error={error} />}
      {list.loading ? (
        <Busy />
      ) : list.error ? (
        <ErrorBox error={list.error} retry={list.reload} />
      ) : !list.data?.items?.length ? (
        <div className="panel">
          <Empty
            title="Kutubxona hali bo‘sh"
            text="Birinchi elektron darslik yoki mavzular to‘plamini yarating — o‘quvchilar nom va tavsif bo‘yicha osongina topa oladi."
          />
        </div>
      ) : (
        <div className="cards-grid">
          {list.data.items.map((b: any) => (
            <article className="panel test-card" key={b.id}>
              <div className="test-card-top">
                <Pill
                  tone={
                    !b.published
                      ? "neutral"
                      : b.moderation_status === "approved"
                        ? "green"
                        : b.moderation_status === "rejected"
                          ? "red"
                          : "amber"
                  }
                >
                  {!b.published
                    ? "Qoralama"
                    : b.moderation_status === "approved"
                      ? "Ochiq (Tasdiqlangan)"
                      : b.moderation_status === "rejected"
                        ? "Rad etilgan"
                        : "Moderatsiyada"}
                </Pill>
                <small className="muted">{b.subject}</small>
              </div>
              <h2>{b.title}</h2>
              <p>{b.summary || "Tavsif kiritilmagan"}</p>
              <div className="test-card-details">
                <span>
                  <BookOpen size={15} /> {b.chapter_count} bob
                </span>
                <span>
                  <Eye size={15} /> {b.views_count} o‘qish
                </span>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary tiny"
                  onClick={() => setChaptersBookId(b.id)}
                >
                  Boblar ({b.chapter_count})
                </button>
                <button
                  type="button"
                  className="btn secondary tiny"
                  onClick={() => setEditBook({ ...b })}
                >
                  Tahrirlash
                </button>
                <button
                  type="button"
                  className="btn danger tiny"
                  disabled={busy}
                  onClick={() => void removeBook(b)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editBook && (
        <Modal
          title={editBook.id ? "Kitobni tahrirlash" : "Yangi kitob yaratish"}
          close={() => setEditBook(null)}
        >
          <form onSubmit={(e) => void saveBook(e)}>
            <Field label="Kitob / qo‘llanma nomi">
              <input
                required
                minLength={2}
                maxLength={160}
                value={editBook.title}
                onChange={(e) => setEditBook({ ...editBook, title: e.target.value })}
                placeholder="Masalan: Kompyuter savodxonligi to‘liq qo‘llanmasi"
              />
            </Field>
            <div className="form-grid">
              <Field label="Fan / yo‘nalish">
                <input
                  required
                  list="lib-subject-list"
                  value={editBook.subject}
                  onChange={(e) => setEditBook({ ...editBook, subject: e.target.value })}
                  placeholder="Informatika, Matematika…"
                />
                <datalist id="lib-subject-list">
                  {SUBJECT_SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
              <Field label="Muallif nomi">
                <input
                  value={editBook.author_name || ""}
                  onChange={(e) => setEditBook({ ...editBook, author_name: e.target.value })}
                  placeholder="Bo‘sh qolsa ismingiz yoziladi"
                />
              </Field>
            </div>
            <Field label="Qisqa tavsif (qidiruvda ham ishlaydi)">
              <textarea
                rows={3}
                maxLength={1000}
                value={editBook.summary || ""}
                onChange={(e) => setEditBook({ ...editBook, summary: e.target.value })}
                placeholder="Ushbu kitobda qaysi mavzular yoritilganini qisqacha yozing…"
              />
            </Field>
            <div className="form-grid">
              <Field label="Kalit so‘zlar (vergul bilan)">
                <input
                  maxLength={300}
                  value={editBook.tags || ""}
                  onChange={(e) => setEditBook({ ...editBook, tags: e.target.value })}
                  placeholder="windows, excel, word, internet, virus"
                />
              </Field>
              <Field label="Bog‘langan test kodi (ixtiyoriy)">
                <input
                  maxLength={40}
                  value={editBook.linked_card_slug || ""}
                  onChange={(e) =>
                    setEditBook({ ...editBook, linked_card_slug: e.target.value })
                  }
                  placeholder="Masalan: KP-48291"
                />
              </Field>
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={editBook.published !== false}
                onChange={(e) => setEditBook({ ...editBook, published: e.target.checked })}
              />
              <span>Ochiq kutubxonada (/library) barcha uchun ko‘rinsin</span>
            </label>
            <div className="actions" style={{ marginTop: 14 }}>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saqlanmoqda…" : "Saqlash"}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setEditBook(null)}
              >
                Bekor qilish
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && (
        <ImportBookModal
          close={() => setShowImport(false)}
          onImported={(msg) => {
            setShowImport(false);
            list.reload();
            toast(msg);
          }}
        />
      )}
      {chaptersBookId && (
        <ChaptersModal
          bookId={chaptersBookId}
          onClose={() => {
            setChaptersBookId(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function ChaptersModal({ bookId, onClose }: { bookId: string; onClose: () => void }) {
  const base = "/api/v2/teacher/library/" + bookId;
  const detail = useData(base);
  const [editing, setEditing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const toast = useToast();

  const chapters: any[] = detail.data?.chapters || [];
  const book = detail.data?.book;

  async function saveChapter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        title: editing.title,
        summary: editing.summary || "",
        content: editing.content,
        position: editing.position ? Number(editing.position) : undefined,
      };
      if (editing.id) {
        await api(base + "/chapters/" + editing.id, { method: "PUT", data: payload });
        toast("Bob yangilandi");
      } else {
        await api(base + "/chapters", { method: "POST", data: payload });
        toast("Yangi bob qo‘shildi");
      }
      setEditing(null);
      detail.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function deleteChapter(ch: any) {
    if (!confirm(`"${ch.title}" bobini o‘chirmoqchimisiz?`)) return;
    setBusy(true);
    try {
      await api(base + "/chapters/" + ch.id, { method: "DELETE" });
      toast("Bob o‘chirildi");
      detail.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={book ? `Boblar — ${book.title}` : "Kitob boblari"} close={onClose}>
      {!!error && <ErrorBox error={error} />}
      {detail.loading ? (
        <Busy />
      ) : editing ? (
        <form onSubmit={(e) => void saveChapter(e)}>
          <div className="form-grid">
            <Field label="Bob nomi">
              <input
                required
                minLength={2}
                maxLength={180}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Masalan: 1-bob. Operatsion tizimlar"
              />
            </Field>
            <Field label="Tartib raqami">
              <input
                type="number"
                min={1}
                max={500}
                value={editing.position ?? chapters.length + 1}
                onChange={(e) => setEditing({ ...editing, position: +e.target.value })}
              />
            </Field>
          </div>
          <Field label="Bobning qisqa tavsifi (qidiruv uchun)">
            <input
              maxLength={600}
              value={editing.summary || ""}
              onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              placeholder="Ushbu bobda nimalar o‘rganiladi…"
            />
          </Field>
          <Field label="Bob matni (## sarlavha, - ro‘yxat, ``` kod bloki ishlaydi)">
            <textarea
              required
              rows={11}
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              placeholder="Kitob matnini shu yerga yozing yoki nusxalab joylang…"
            />
          </Field>
          <div className="actions">
            <button className="btn primary" disabled={busy}>
              {busy ? "Saqlanmoqda…" : "Bobni saqlash"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setEditing(null)}
            >
              Ortga
            </button>
          </div>
        </form>
      ) : (
        <div className="lib-ch-manager">
          <div className="actions" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <span className="muted">Jami {chapters.length} ta bob</span>
            <button
              type="button"
              className="btn primary tiny"
              onClick={() =>
                setEditing({
                  title: "",
                  summary: "",
                  content: "",
                  position: chapters.length + 1,
                })
              }
            >
              <Plus size={14} /> Bob qo‘shish
            </button>
          </div>
          {!chapters.length ? (
            <Empty
              title="Hali boblar yo‘q"
              text="«Bob qo‘shish» tugmasi orqali kitobning birinchi bobini yozing."
            />
          ) : (
            <div className="lib-ch-list">
              {chapters.map((ch: any) => (
                <div className="lib-ch-row" key={ch.id}>
                  <div>
                    <strong>
                      {ch.position}. {ch.title}
                    </strong>
                    {ch.summary && (
                      <small className="muted" style={{ display: "block" }}>
                        {ch.summary}
                      </small>
                    )}
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn secondary tiny"
                      onClick={() => setEditing({ ...ch })}
                    >
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      className="btn danger tiny"
                      disabled={busy}
                      onClick={() => void deleteChapter(ch)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}


function ImportBookModal({
  close,
  onImported,
}: {
  close: () => void;
  onImported: (msg: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [parsedChapters, setParsedChapters] = useState<ParsedChapter[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Kompyuter savodxonligi");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [published, setPublished] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onPick(f: File | null) {
    setFile(f);
    setError(null);
    setParsedChapters([]);
    if (!f) return;
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
    if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
      setIsPdf(true);
      if (f.size > 15 * 1024 * 1024) {
        setError(new Error("PDF fayl hajmi 15 MB dan oshmasligi kerak."));
      }
      return;
    }
    setIsPdf(false);
    setParsing(true);
    try {
      const chs = await parseBookFileToChapters(f);
      setParsedChapters(chs);
    } catch (err) {
      setError(err);
    } finally {
      setParsing(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (isPdf) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", title.trim());
        fd.append("subject", subject.trim());
        fd.append("summary", summary.trim());
        fd.append("tags", tags.trim());
        fd.append("author_name", authorName.trim());
        fd.append("published", published ? "true" : "false");
        await api("/api/v2/teacher/library/import-pdf", {
          method: "POST",
          form: fd,
        });
        onImported("PDF kitob muvaffaqiyatli yuklandi!");
      } else {
        if (!parsedChapters.length) throw new Error("Avval fayldan boblar ajratilishi kerak");
        const res = await api("/api/v2/teacher/library/import-docx", {
          method: "POST",
          data: {
            title: title.trim(),
            subject: subject.trim(),
            summary: summary.trim(),
            tags: tags.trim(),
            author_name: authorName.trim(),
            published,
            chapters: parsedChapters,
          },
        });
        onImported(`Kitob va ${res.chapters} ta bob avtomatik yaratildi!`);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Word (.docx) yoki PDF dan kitob yaratish" close={close}>
      {!!error && <ErrorBox error={error} />}
      <form onSubmit={submit}>
        <Field label="Fayl tanlang (.docx Word, .pdf max 15 MB, .txt, .md)">
          <label className="hw-upload-box">
            <span>
              {parsing
                ? "Fayl tahlil qilinmoqda…"
                : file
                  ? `Tanlandi: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
                  : "Word (.docx) yoki PDF fayl tanlash uchun bosing"}
            </span>
            <input
              type="file"
              accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => void onPick(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
          </label>
        </Field>

        {!isPdf && parsedChapters.length > 0 && (
          <div className="lib-import-preview">
            <strong>✅ {parsedChapters.length} ta bob avtomatik ajratildi:</strong>
            <ul>
              {parsedChapters.slice(0, 6).map((ch, i) => (
                <li key={i}>{i + 1}. {ch.title}</li>
              ))}
              {parsedChapters.length > 6 && <li>… yana {parsedChapters.length - 6} ta bob</li>}
            </ul>
          </div>
        )}

        {isPdf && file && file.size <= 15 * 1024 * 1024 && (
          <div className="lib-import-preview">
            <strong>📕 PDF kitob rejimi:</strong> Fayl asl dizayni, rasmlari va formulalari bilan ichki PDF kitob o‘quvchida ochiladi.
          </div>
        )}

        <Field label="Kitob nomi">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={160} />
        </Field>
        <Field label="Fan / kategoriya">
          <input list="lib-subjects" value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={2} maxLength={80} />
          <datalist id="lib-subjects">
            {SUBJECT_SUGGESTIONS.map((x) => <option key={x} value={x} />)}
          </datalist>
        </Field>
        <Field label="Qisqa tavsif (ixtiyoriy)">
          <textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={1000} />
        </Field>
        <div className="hw-two-col">
          <Field label="Muallif (ixtiyoriy)">
            <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Teglar (ixtiyoriy)">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="excel, informatika" maxLength={240} />
          </Field>
        </div>
        <label className="mod-check-inline" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span>Ommaviy kutubxonaga yuborish (Owner tasdiqlagach chiqadi)</span>
        </label>
        <button className="btn primary full" disabled={busy || parsing || !file}>
          {busy ? "Yuklanmoqda…" : isPdf ? "PDF kitobni saqlash" : "Boblarni kitob qilib saqlash"}
        </button>
      </form>
    </Modal>
  );
}
