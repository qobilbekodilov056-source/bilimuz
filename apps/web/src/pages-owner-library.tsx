import { useState, type FormEvent } from "react";
import { BookOpen, CheckCircle2, Coins, Image as ImageIcon, Plus, XCircle } from "lucide-react";
import { api } from "./api";
import { Busy, Empty, ErrorBox, Field, Modal, PageTitle, Pill, useData, useToast } from "./ui";

// Brauzerda rasmni avtomatik 420x560 WebP (~15-35 KB) ga siqish
async function compressCoverToWebp(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  const maxW = 420;
  const maxH = 560;
  const ratio = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
  const w = Math.max(1, Math.round(bmp.width * ratio));
  const h = Math.max(1, Math.round(bmp.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("WebP siqishda xatolik"))), "image/webp", 0.78),
  );
  return new File([blob], "cover.webp", { type: "image/webp" });
}

export function OwnerLibraryManager() {
  const data = useData("/api/v2/owner/library-catalog");
  const testsData = useData("/api/v2/owner/paid-tests");
  const promoData = useData("/api/v2/owner/promo-codes");
  const [promoModal, setPromoModal] = useState(false);
  const toast = useToast();
  const [tab, setTab] = useState<"books" | "orders" | "tests" | "test_orders" | "promos">("books");
  const [createOpen, setCreateOpen] = useState(false);
  const [chapterBook, setChapterBook] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<unknown>(null);

  const items: any[] = data.data?.items || [];
  const orders: any[] = data.data?.orders || [];
  const paidCards: any[] = testsData.data?.cards || [];
  const testOrders: any[] = testsData.data?.orders || [];
  const promos: any[] = promoData.data?.items || [];

  async function onCreateBook(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("create");
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const coverFile = fd.get("cover") as File | null;
      const res = await api("/api/v2/owner/library-books/create", {
        method: "POST",
        data: {
          title: String(fd.get("title") || ""),
          subject: String(fd.get("subject") || ""),
          summary: String(fd.get("summary") || ""),
          author_name: String(fd.get("author_name") || "Bilim UZ Rasmiy"),
          price_uzs: Number(fd.get("price_uzs") || 0),
          chapter_title: String(fd.get("chapter_title") || ""),
          chapter_content: String(fd.get("chapter_content") || ""),
        },
      });
      if (coverFile && coverFile.size > 0 && res?.id) {
        const webp = await compressCoverToWebp(coverFile);
        const ufd = new FormData();
        ufd.append("file", webp);
        await api("/api/v2/owner/library-books/" + encodeURIComponent(res.id) + "/cover", {
          method: "POST",
          form: ufd,
        });
      }
      toast("Kitob kutubxonaga joylandi!");
      setCreateOpen(false);
      data.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy("");
    }
  }

  async function updatePrice(book: any) {
    const raw = prompt(`«${book.title}» narxini kiriting (so‘m, 0 = Bepul):`, String(book.price_uzs || 0));
    if (raw === null) return;
    const price = Math.max(0, Math.round(Number(raw) || 0));
    setBusy("price-" + book.id);
    try {
      await api("/api/v2/owner/library-books/" + encodeURIComponent(book.id) + "/pricing", {
        method: "POST",
        data: { price_uzs: price },
      });
      toast(price > 0 ? `Narx ${price.toLocaleString("uz-UZ")} so‘m etib belgilandi` : "Kitob bepul qilindi");
      data.reload();
    } catch (err: any) {
      toast(err?.message || "Narxni saqlashda xatolik");
    } finally {
      setBusy("");
    }
  }

  async function uploadCover(bookId: string, file: File | null) {
    if (!file) return;
    setBusy("cover-" + bookId);
    try {
      const webp = await compressCoverToWebp(file);
      const ufd = new FormData();
      ufd.append("file", webp);
      await api("/api/v2/owner/library-books/" + encodeURIComponent(bookId) + "/cover", {
        method: "POST",
        form: ufd,
      });
      toast(`Muqova yuklandi (${Math.round(webp.size / 1024)} KB WebP)`);
      data.reload();
    } catch (err: any) {
      toast(err?.message || "Muqova yuklashda xatolik");
    } finally {
      setBusy("");
    }
  }

  async function onAddChapter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chapterBook) return;
    setBusy("chapter");
    try {
      const fd = new FormData(e.currentTarget);
      await api("/api/v2/owner/library-books/" + encodeURIComponent(chapterBook.id) + "/chapters", {
        method: "POST",
        data: {
          title: String(fd.get("title") || ""),
          content: String(fd.get("content") || ""),
        },
      });
      toast("Yangi bob qo‘shildi!");
      setChapterBook(null);
      data.reload();
    } catch (err: any) {
      toast(err?.message || "Bob qo‘shishda xatolik");
    } finally {
      setBusy("");
    }
  }

  async function decideOrder(oid: string, status: "paid" | "rejected") {
    setBusy("ord-" + oid);
    try {
      await api("/api/v2/owner/library-orders/" + encodeURIComponent(oid) + "/decision", {
        method: "POST",
        data: { status },
      });
      toast(status === "paid" ? "Xarid tasdiqlandi — kitob ochildi!" : "Buyurtma rad etildi");
      data.reload();
    } catch (err: any) {
      toast(err?.message || "Xatolik");
    } finally {
      setBusy("");
    }
  }


  async function updateTestPrice(card: any) {
    const raw = prompt(`«${card.title}» testi narxini kiriting (so‘m, 0 = Bepul):`, String(card.price_uzs || 0));
    if (raw === null) return;
    const price = Math.max(0, Math.round(Number(raw) || 0));
    setBusy("tprice-" + card.id);
    try {
      await api("/api/v2/owner/paid-tests/" + encodeURIComponent(card.id) + "/pricing", {
        method: "POST",
        data: { price_uzs: price },
      });
      toast(price > 0 ? `Test narxi ${price.toLocaleString("uz-UZ")} so‘m qilindi` : "Test bepul qilindi");
      testsData.reload();
    } catch (err: any) {
      toast(err?.message || "Xatolik");
    } finally {
      setBusy("");
    }
  }

  async function decideTestOrder(oid: string, status: "paid" | "rejected") {
    setBusy("tord-" + oid);
    try {
      await api("/api/v2/owner/test-orders/" + encodeURIComponent(oid) + "/decision", {
        method: "POST",
        data: { status },
      });
      toast(status === "paid" ? "Test xaridi tasdiqlandi!" : "Buyurtma rad etildi");
      testsData.reload();
    } catch (err: any) {
      toast(err?.message || "Xatolik");
    } finally {
      setBusy("");
    }
  }


  async function onCreatePromo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("promo-create");
    try {
      const fd = new FormData(e.currentTarget);
      await api("/api/v2/owner/promo-codes", {
        method: "POST",
        data: {
          code: String(fd.get("code") || ""),
          target_type: String(fd.get("target_type") || "all"),
          target_id: String(fd.get("target_id") || ""),
          discount_percent: Number(fd.get("discount_percent") || 0),
          discount_uzs: Number(fd.get("discount_uzs") || 0),
          max_uses: Number(fd.get("max_uses") || 50),
          expires_days: Number(fd.get("expires_days") || 0),
        },
      });
      toast("Promokod yaratildi!");
      setPromoModal(false);
      promoData.reload();
    } catch (err: any) {
      toast(err?.message || "Promokod yaratishda xatolik");
    } finally {
      setBusy("");
    }
  }

  async function togglePromo(pid: string) {
    setBusy("ptog-" + pid);
    try {
      await api("/api/v2/owner/promo-codes/" + encodeURIComponent(pid) + "/toggle", { method: "POST", data: {} });
      promoData.reload();
    } catch (err: any) {
      toast(err?.message || "Xatolik");
    } finally {
      setBusy("");
    }
  }

  async function deletePromo(pid: string) {
    if (!confirm("Promokodni o‘chirasizmi?")) return;
    setBusy("pdel-" + pid);
    try {
      await api("/api/v2/owner/promo-codes/" + encodeURIComponent(pid), { method: "DELETE" });
      toast("Promokod o‘chirildi");
      promoData.reload();
    } catch (err: any) {
      toast(err?.message || "Xatolik");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="OWNER KUTUBXONA & MONETIZATSIYA"
        title="Kutubxona, muqovalar va pullik qo‘llanmalar"
        description="Rasmiy darslik va IELTS qo‘llanmalarini joylang, yengil WebP muqova qo‘ying va narx belgilang."
        actions={
          <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Yangi kitob / qo‘llanma
          </button>
        }
      />
      {!!error && <ErrorBox error={error} />}
      <div className="tabs-bar">
        <button type="button" className={tab === "books" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("books")}>
          <BookOpen size={14} /> Kitoblar ({items.length})
        </button>
        <button type="button" className={tab === "orders" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("orders")}>
          <Coins size={14} /> Kitob xaridlari ({orders.length})
        </button>
        <button type="button" className={tab === "tests" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("tests")}>
          🎯 Pullik testlar ({paidCards.length})
        </button>
        <button type="button" className={tab === "test_orders" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("test_orders")}>
          💳 Test xaridlari ({testOrders.length})
        </button>
        <button type="button" className={tab === "promos" ? "btn primary tiny" : "btn secondary tiny"} onClick={() => setTab("promos")}>
          🎟️ Promokodlar ({promos.length})
        </button>
      </div>

      {data.loading ? (
        <Busy />
      ) : data.error ? (
        <ErrorBox error={data.error} retry={data.reload} />
      ) : tab === "books" ? (
        !items.length ? (
          <div className="panel"><Empty title="Kitoblar yo‘q" text="Yangi rasmiy kitob yoki IELTS qo‘llanmasini qo‘shing." /></div>
        ) : (
          <div className="cards-grid">
            {items.map((b: any) => (
              <article className="panel" key={b.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Pill tone={Number(b.price_uzs) > 0 ? "amber" : "green"}>
                    {Number(b.price_uzs) > 0 ? `${Number(b.price_uzs).toLocaleString("uz-UZ")} so‘m` : "BEPUL"}
                  </Pill>
                  <small className="muted">{b.subject} · {b.chapter_count || 0} bob</small>
                </div>
                {b.cover_key && (
                  <img
                    src={"/api/v2/library/cover/" + encodeURIComponent(b.id) + "?v=" + (b.updated_at || 1)}
                    alt={b.title}
                    style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 12 }}
                  />
                )}
                <h3 style={{ margin: 0 }}>{b.title}</h3>
                <small className="muted">Muallif: {b.author_name || b.tenant_name || "—"} · Sotuv: {b.sales_count || 0}</small>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
                  <button type="button" className="btn secondary tiny" disabled={busy === "price-" + b.id} onClick={() => updatePrice(b)}>
                    <Coins size={14} /> Narx
                  </button>
                  <label className="btn secondary tiny" style={{ cursor: "pointer" }}>
                    <ImageIcon size={14} /> {b.cover_key ? "Muqovani almashtirish" : "Muqova yuklash"}
                    <input type="file" accept="image/*" hidden onChange={(e) => uploadCover(b.id, e.target.files?.[0] || null)} />
                  </label>
                  <button type="button" className="btn secondary tiny" onClick={() => setChapterBook(b)}>
                    <Plus size={14} /> Bob qo‘shish
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : tab === "tests" ? (
        !paidCards.length ? (
          <div className="panel"><Empty title="Ochiq testlar topilmadi" text="Ochiq mashq rejimida (access_mode: open) yaratilgan testlar shu yerda chiqadi." /></div>
        ) : (
          <div className="cards-grid">
            {paidCards.map((c: any) => (
              <article className="panel" key={c.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Pill tone={Number(c.price_uzs) > 0 ? "amber" : "green"}>
                    {Number(c.price_uzs) > 0 ? `${Number(c.price_uzs).toLocaleString("uz-UZ")} so‘m` : "BEPUL"}
                  </Pill>
                  <small className="muted">{c.slug}</small>
                </div>
                <h3 style={{ margin: 0 }}>{c.title}</h3>
                <small className="muted">Muallif: {c.tenant_name} · Yechilgan: {c.market_solves || 0} · Sotuv: {c.sales_count || 0}</small>
                <div style={{ marginTop: "auto" }}>
                  <button type="button" className="btn secondary tiny" disabled={busy === "tprice-" + c.id} onClick={() => updateTestPrice(c)}>
                    <Coins size={14} /> Narx belgilash
                  </button>
                </div>
              </article>
            ))}
          </div>
        )
      ) : tab === "test_orders" ? (
        !testOrders.length ? (
          <div className="panel"><Empty title="Hali test xaridlari yo‘q" text="Pullik IELTS / DTM testlariga buyurtmalar tushishi bilan shu yerda chiqadi." /></div>
        ) : (
          <div className="panel" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Xaridor</th>
                  <th>Unikal summa</th>
                  <th>Holat</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {testOrders.map((o: any) => (
                  <tr key={o.id}>
                    <td><strong>{o.card_title}</strong> ({o.card_slug})</td>
                    <td>{o.buyer_name} {o.buyer_phone ? `(${o.buyer_phone})` : ""}</td>
                    <td><strong>{Number(o.unique_amount).toLocaleString("uz-UZ")} so‘m</strong></td>
                    <td>
                      <Pill tone={o.status === "paid" ? "green" : o.status === "rejected" ? "red" : "amber"}>
                        {o.status === "paid" ? "To‘landi" : o.status === "rejected" ? "Rad etildi" : "Kutilmoqda"}
                      </Pill>
                    </td>
                    <td>
                      {o.status === "pending" ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="btn primary tiny" disabled={busy === "tord-" + o.id} onClick={() => decideTestOrder(o.id, "paid")}>
                            <CheckCircle2 size={14} /> Tasdiqlash
                          </button>
                          <button type="button" className="btn secondary tiny" disabled={busy === "tord-" + o.id} onClick={() => decideTestOrder(o.id, "rejected")}>
                            <XCircle size={14} /> Rad
                          </button>
                        </div>
                      ) : (
                        <small className="muted">{o.tx_note || "—"}</small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === "promos" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="btn primary tiny" onClick={() => setPromoModal(true)}>
              <Plus size={14} /> Yangi promokod yaratish
            </button>
          </div>
          {!promos.length ? (
            <div className="panel"><Empty title="Hali promokodlar yo‘q" text="Kitoblar va testlar uchun skidka (masalan 50%) yoki 100% bepul promokod yarating." /></div>
          ) : (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Promokod</th>
                    <th>Qayerda ishlaydi</th>
                    <th>Chegirma</th>
                    <th>Ishlatilgan</th>
                    <th>Holat</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((pr: any) => (
                    <tr key={pr.id}>
                      <td><strong>{pr.code}</strong></td>
                      <td>
                        {pr.target_type === "book" ? "Faqat kitoblar" : pr.target_type === "test" ? "Faqat testlar" : "Kitob va Testlar"}
                        {pr.target_id ? ` (${pr.target_id})` : ""}
                      </td>
                      <td>
                        <Pill tone={Number(pr.discount_percent) >= 100 ? "green" : "amber"}>
                          {Number(pr.discount_percent) >= 100
                            ? "100% BEPUL"
                            : Number(pr.discount_percent) > 0
                              ? `-${pr.discount_percent}%`
                              : `-${Number(pr.discount_uzs).toLocaleString("uz-UZ")} so‘m`}
                        </Pill>
                      </td>
                      <td>{pr.used_count} / {pr.max_uses}</td>
                      <td>
                        <Pill tone={pr.status === "active" ? "green" : "red"}>
                          {pr.status === "active" ? "Faol" : "O‘chiq"}
                        </Pill>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="btn secondary tiny" disabled={busy === "ptog-" + pr.id} onClick={() => togglePromo(pr.id)}>
                            {pr.status === "active" ? "O‘chirish" : "Yoqish"}
                          </button>
                          <button type="button" className="btn secondary tiny" disabled={busy === "pdel-" + pr.id} onClick={() => deletePromo(pr.id)}>
                            O‘chirish ×
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !orders.length ? (
        <div className="panel"><Empty title="Hali kitob xaridlari yo‘q" text="Pullik kitoblarga buyurtmalar tushishi bilan shu yerda ko‘rinadi." /></div>
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Kitob</th>
                <th>Xaridor</th>
                <th>Unikal summa</th>
                <th>Holat</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id}>
                  <td><strong>{o.book_title}</strong></td>
                  <td>{o.buyer_name} {o.buyer_phone ? `(${o.buyer_phone})` : ""}</td>
                  <td><strong>{Number(o.unique_amount).toLocaleString("uz-UZ")} so‘m</strong></td>
                  <td>
                    <Pill tone={o.status === "paid" ? "green" : o.status === "rejected" ? "red" : "amber"}>
                      {o.status === "paid" ? "To‘landi" : o.status === "rejected" ? "Rad etildi" : "Kutilmoqda"}
                    </Pill>
                  </td>
                  <td>
                    {o.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="btn primary tiny" disabled={busy === "ord-" + o.id} onClick={() => decideOrder(o.id, "paid")}>
                          <CheckCircle2 size={14} /> Tasdiqlash
                        </button>
                        <button type="button" className="btn secondary tiny" disabled={busy === "ord-" + o.id} onClick={() => decideOrder(o.id, "rejected")}>
                          <XCircle size={14} /> Rad
                        </button>
                      </div>
                    ) : (
                      <small className="muted">{o.tx_note || "—"}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <Modal title="Yangi rasmiy kitob / IELTS qo‘llanma" close={() => setCreateOpen(false)}>
          <form onSubmit={onCreateBook} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Kitob / qo‘llanma nomi">
              <input name="title" required placeholder="Masalan: IELTS Reading & Writing 7.5+ Qo‘llanma" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Fan / yo‘nalish">
                <input name="subject" required placeholder="IELTS / Ingliz tili / IT" />
              </Field>
              <Field label="Narx (so‘m, 0 = Bepul)">
                <input name="price_uzs" type="number" min={0} step={1000} defaultValue={0} />
              </Field>
            </div>
            <Field label="Muallif">
              <input name="author_name" defaultValue="Bilim UZ Rasmiy" />
            </Field>
            <Field label="Qisqa tavsif">
              <textarea name="summary" rows={2} placeholder="Nimalar o‘rgatiladi..." />
            </Field>
            <Field label="Muqova rasmi (ixtiyoriy — avtomatik ~25 KB WebP ga siqiladi)">
              <input name="cover" type="file" accept="image/*" />
            </Field>
            <Field label="1-bob sarlavhasi (Bepul tanishuv bobi)">
              <input name="chapter_title" placeholder="1-bob: Kirish va strategiya" />
            </Field>
            <Field label="1-bob matni">
              <textarea name="chapter_content" rows={4} placeholder="Bob matnini kiriting..." />
            </Field>
            <button type="submit" className="btn primary" disabled={busy === "create"}>
              {busy === "create" ? "Saqlanmoqda..." : "Kutubxonaga joylash"}
            </button>
          </form>
        </Modal>
      )}

      {chapterBook && (
        <Modal title={`Bob qo‘shish: ${chapterBook.title}`} close={() => setChapterBook(null)}>
          <form onSubmit={onAddChapter} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Bob sarlavhasi">
              <input name="title" required placeholder="2-bob: Amaliy mashqlar" />
            </Field>
            <Field label="Bob matni">
              <textarea name="content" rows={7} required placeholder="To‘liq matn..." />
            </Field>
            <button type="submit" className="btn primary" disabled={busy === "chapter"}>
              {busy === "chapter" ? "Saqlanmoqda..." : "Bobni saqlash"}
            </button>
          </form>
        </Modal>
      )}

      {promoModal && (
        <Modal title="Yangi promokod (Kitob va Testlar)" close={() => setPromoModal(false)}>
          <form onSubmit={onCreatePromo} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Promokod nomi (masalan: IELTS50 yoki FREEVIP)">
              <input name="code" required placeholder="BILIM50" style={{ textTransform: "uppercase" }} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Qaysi bo‘lim uchun">
                <select name="target_type" defaultValue="all">
                  <option value="all">Kitoblar va Testlar</option>
                  <option value="book">Faqat Kitoblar</option>
                  <option value="test">Faqat Testlar</option>
                </select>
              </Field>
              <Field label="Aniq kitob ID / test kodi (ixtiyoriy)">
                <input name="target_id" placeholder="Bo‘sh = hammasi" />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Foiz chegirma (0–100%, 100 = BEPUL)">
                <input name="discount_percent" type="number" min={0} max={100} defaultValue={100} />
              </Field>
              <Field label="Yoki aniq so‘m chegirma (0 bo‘lsa foiz ishlaydi)">
                <input name="discount_uzs" type="number" min={0} step={1000} defaultValue={0} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Necha kishi ishlata oladi">
                <input name="max_uses" type="number" min={1} defaultValue={50} />
              </Field>
              <Field label="Amal qilish muddati (kun, 0 = cheksiz)">
                <input name="expires_days" type="number" min={0} defaultValue={30} />
              </Field>
            </div>
            <button type="submit" className="btn primary" disabled={busy === "promo-create"}>
              {busy === "promo-create" ? "Yaratilmoqda..." : "Promokodni yaratish"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
