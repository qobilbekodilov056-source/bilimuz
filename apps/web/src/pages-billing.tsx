import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Copy,
  CreditCard,
  KeyRound,
  RefreshCw,
  Sparkles,
  Upload,
  Zap,
} from "lucide-react";
import { api } from "./api";
import { Busy, ErrorBox, Pill, useData, useToast } from "./ui";

async function compressReceipt(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1280;
      let w = img.width;
      let h = img.height;
      const scale = Math.min(1, maxDim / w, maxDim / h);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          resolve(new File([blob], "receipt.webp", { type: "image/webp" }));
        },
        "image/webp",
        0.78,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

const PLAN_FEATURES: Record<string, { tagline: string; features: string[] }> = {
  free: {
    tagline: "Platformani sinab ko‘rish va kichik guruhlar uchun qulay start.",
    features: [
      "2 tagacha guruh",
      "30 tagacha faol o‘quvchi",
      "60 tagacha savollar bazasi",
      "Onlayn testlar va natijalar",
      "O‘quvchi va ota-ona kabineti",
    ],
  },
  pro: {
    tagline: "Faol ustozlar va repetitorlar uchun to‘liq avtomatlashtirilgan studio.",
    features: [
      "20 tagacha guruh",
      "300 tagacha faol o‘quvchi",
      "1 000 tagacha savollar bazasi",
      "1–4 variantli oflayn A4 PDF + kalit",
      "QR-kodli rasmiy PDF sertifikatlar",
      "Kurs jurnali, vazifalar va jonli chat",
      "Anti-Cheat nazorat va chuqur tahlil",
    ],
  },
  center: {
    tagline: "O‘quv markazlari va maktablar uchun kengaytirilgan professional quvvat.",
    features: [
      "200 tagacha guruh",
      "2 500 tagacha faol o‘quvchi",
      "5 000 tagacha savollar bazasi",
      "Barcha Ustoz Pro imkoniyatlari",
      "Katta hajmli R2 vazifa va PDF kutubxona",
      "Ustuvor texnik yordam (Support)",
    ],
  },
};

export function TeacherBillingPage() {
  const toast = useToast();
  const data = useData("/api/v2/teacher/billing/status");
  const [months, setMonths] = useState(1);
  const [activeOrder, setActiveOrder] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [txNote, setTxNote] = useState("");
  const [productKey, setProductKey] = useState("");

  useEffect(() => {
    if (!activeOrder || activeOrder.status === "paid") return;
    const t = setInterval(() => data.reload(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?.id, activeOrder?.status]);

  useEffect(() => {
    if (!activeOrder || !data.data?.orders) return;
    const found = data.data.orders.find((o: any) => o.id === activeOrder.id);
    if (found && found.status !== activeOrder.status) {
      setActiveOrder(found);
      if (found.status === "paid") {
        toast("To‘lov avtomatik tasdiqlandi! Tarifingiz faollashdi.");
      }
    }
  }, [data.data?.orders, activeOrder, toast]);

  async function startOrder(planId: "pro" | "center") {
    setBusy(true);
    setError(null);
    try {
      const ord = await api("/api/v2/teacher/billing/create-order", {
        method: "POST",
        data: { plan: planId, months },
      });
      setActiveOrder({ ...ord, status: "pending" });
      data.reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function redeemKey(e: FormEvent) {
    e.preventDefault();
    if (!productKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api("/api/v2/teacher/billing/redeem-key", {
        method: "POST",
        data: { code: productKey.trim() },
      });
      toast(`Kalit faollashtirildi! ${res.plan.toUpperCase()} (${res.days} kun) yoqildi.`);
      setProductKey("");
      data.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function uploadReceipt(e: FormEvent) {
    e.preventDefault();
    if (!activeOrder || !receiptFile) return;
    setBusy(true);
    setError(null);
    try {
      const compressed = await compressReceipt(receiptFile);
      const fd = new FormData();
      fd.set("file", compressed);
      fd.set("note", txNote);
      await api("/api/v2/teacher/billing/upload-receipt/" + encodeURIComponent(activeOrder.id), {
        method: "POST",
        form: fd,
      });
      toast("Chek yuborildi! Tizim yoki admin tasdiqlashini kuting.");
      setReceiptFile(null);
      setTxNote("");
      data.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (data.loading && !data.data) return <Busy />;
  if (data.error && !data.data) return <ErrorBox error={data.error} retry={data.reload} />;

  const d = data.data;
  const plan = d?.plan || { id: "free", name: "Start (Bepul)", max_groups: 2, max_students: 30, max_questions: 60, expires_at: 0 };
  const usage = d?.usage || { groups: 0, students: 0, questions: 0 };
  const card = d?.card || { number: "", holder: "" };
  const exp = Number(plan.expires_at || 0);
  const daysLeft = exp > 0 ? Math.max(0, Math.ceil((exp - Date.now() / 1000) / 86400)) : 0;

  const pct = (u: number, m: number) => Math.min(100, Math.round((u / Math.max(1, m)) * 100));

  return (
    <div className="bp-wrap">
      {!!error && <ErrorBox error={error} />}

      {/* TOP COMPACT STATUS BAR + USAGE + INLINE PRODUCT KEY */}
      <section className="bp-status-card">
        <div className="bp-status-top">
          <div className="bp-status-left">
            <span className={"bp-plan-chip is-" + plan.id}>
              <Sparkles size={14} /> {plan.name}
            </span>
            {exp > 0 ? (
              <span className="bp-exp-text">
                Faol: <strong>{new Date(exp * 1000).toLocaleDateString("uz-UZ")}</strong> gacha ({daysLeft} kun qoldi)
              </span>
            ) : (
              <span className="bp-exp-text">Bepul boshlang‘ich rejim</span>
            )}
          </div>
          <div className="bp-status-right">
            <form onSubmit={redeemKey} className="bp-key-inline">
              <KeyRound size={15} className="bp-key-ico" />
              <input
                value={productKey}
                onChange={(e) => setProductKey(e.target.value.toUpperCase())}
                placeholder="Product Key (PRO-30D-...)"
                maxLength={40}
              />
              <button type="submit" className="btn primary tiny" disabled={busy || !productKey.trim()}>
                Faollashtirish
              </button>
            </form>
            <button type="button" className="btn secondary tiny" onClick={() => data.reload()} title="Yangilash">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="bp-usage-grid">
          {[
            ["Guruhlar", usage.groups, plan.max_groups],
            ["O‘quvchilar", usage.students, plan.max_students],
            ["Savollar bazasi", usage.questions, plan.max_questions],
          ].map(([label, u, m]: any) => (
            <div key={label} className="bp-usage-item">
              <div className="bp-usage-head">
                <span>{label}</span>
                <strong>{u} / {m}</strong>
              </div>
              <div className="bp-usage-track">
                <div className="bp-usage-fill" style={{ width: pct(u, m) + "%" }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ACTIVE ORDER CHECKOUT CARD */}
      {activeOrder && (
        <section className={"bp-checkout-card" + (activeOrder.status === "paid" ? " is-paid" : "")}>
          {activeOrder.status === "paid" ? (
            <div style={{ textAlign: "center", padding: "14px 8px" }}>
              <CheckCircle2 size={38} style={{ color: "#0c8066", marginBottom: 6 }} />
              <h2 style={{ margin: "0 0 4px" }}>To‘lov tasdiqlandi!</h2>
              <p className="muted" style={{ margin: 0 }}>
                Tarifingiz ({activeOrder.months} oy) muvaffaqiyatli faollashtirildi.
              </p>
            </div>
          ) : (
            <>
              <div className="bp-checkout-head">
                <div>
                  <span className="eyebrow">AVTOMATIK TO‘LOV · 30 DAQIQA AMAL QILADI</span>
                  <h2 style={{ margin: "4px 0 0" }}>
                    Aynan {Number(activeOrder.unique_amount).toLocaleString("ru-RU")} so‘m o‘tkazing
                  </h2>
                </div>
                <Pill tone="amber">Avto-tekshiruv kutilmoqda…</Pill>
              </div>

              <div className="bp-card-box">
                <div>
                  <small className="muted" style={{ display: "block" }}>O‘tkazma uchun karta ({card.holder || "Bilim UZ"})</small>
                  <strong style={{ fontSize: 19, letterSpacing: 1 }}>{card.number || "Kiritilmagan"}</strong>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn secondary tiny"
                    onClick={() => {
                      navigator.clipboard.writeText(card.number.replace(/\s+/g, ""));
                      toast("Karta raqami nusxalandi");
                    }}
                  >
                    <Copy size={13} /> Kartani nusxalash
                  </button>
                  <button
                    type="button"
                    className="btn primary tiny"
                    onClick={() => {
                      navigator.clipboard.writeText(String(activeOrder.unique_amount));
                      toast("Aniq summa nusxalandi");
                    }}
                  >
                    <Copy size={13} /> {activeOrder.unique_amount} nusxalash
                  </button>
                </div>
              </div>

              <form onSubmit={uploadReceipt} className="bp-receipt-form">
                <small className="muted">Summani adashtirsangiz zaxira sifatida chek yuklang:</small>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input type="file" accept="image/*" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
                  <input
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                    placeholder="Izoh (ixtiyoriy)"
                    maxLength={180}
                    style={{ flex: "1 1 180px" }}
                  />
                  <button className="btn secondary tiny" disabled={busy || !receiptFile}>
                    <Upload size={14} /> Chek yuborish
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      )}

      {/* CENTERED CURATED PRICING HEADER (Reference Style) */}
      <div className="bp-pricing-head">
        <span className="bp-pricing-pill"><CreditCard size={13} /> Tarif rejalari</span>
        <h1>O‘zingizga mos tarifni tanlang</h1>
        <p>
          O‘quvchilar va ota-onalar uchun platforma doim bepul. O‘qituvchi studiosi imkoniyatlarini kengaytiring.
        </p>

        <div className="bp-period-switch">
          {[
            [1, "1 oy", ""],
            [3, "3 oy", ""],
            [6, "6 oy", ""],
            [12, "12 oy", "Yillik"],
          ].map(([m, label, tag]: any) => (
            <button
              key={m}
              type="button"
              className={months === m ? "bp-period-btn is-active" : "bp-period-btn"}
              onClick={() => setMonths(m)}
            >
              {label}
              {tag && <span className="bp-save-tag">{tag}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* 3-COLUMN ELEVATED PRICING CARDS */}
      <div className="bp-cards-grid">
        {(d?.plans || []).map((pl: any) => {
          const isPro = pl.id === "pro";
          const isCurrent = plan.id === pl.id;
          const meta = PLAN_FEATURES[pl.id] || PLAN_FEATURES.free;
          const total = pl.price * months;
          return (
            <div key={pl.id} className={"bp-plan-shell" + (isPro ? " is-recommended" : "")}>
              {isPro && (
                <div className="bp-rec-ribbon">
                  <Zap size={13} /> Eng ommabop tanlov
                </div>
              )}
              <div className="bp-plan-card">
                <div className="bp-plan-title-row">
                  <h3>{pl.name}</h3>
                  {isCurrent && <Pill tone="green">Joriy</Pill>}
                </div>

                <div className="bp-price-row">
                  <strong>{pl.price === 0 ? "0 so‘m" : total.toLocaleString("ru-RU") + " so‘m"}</strong>
                  <span>/ {months === 1 ? "oy" : months + " oy"}</span>
                </div>

                <p className="bp-plan-tagline">{meta.tagline}</p>

                {pl.id === "free" ? (
                  <button type="button" className="bp-cta-btn is-soft" disabled>
                    {isCurrent ? "Joriy bepul tarif" : "Boshlang‘ich tarif"}
                  </button>
                ) : isCurrent && daysLeft > 5 ? (
                  <button type="button" className="bp-cta-btn is-soft" disabled>
                    Faol tarif ({daysLeft} kun qoldi)
                  </button>
                ) : (
                  <button
                    type="button"
                    className={"bp-cta-btn " + (isPro ? "is-primary" : "is-soft")}
                    disabled={busy}
                    onClick={() => startOrder(pl.id)}
                  >
                    {isCurrent ? pl.name + " ni uzaytirish" : pl.name + " ga o‘tish"}
                  </button>
                )}

                <ul className="bp-feat-list">
                  {meta.features.map((ft) => (
                    <li key={ft}>
                      <CheckCircle2 size={15} />
                      <span>{ft}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* ORDER HISTORY */}
      {d?.orders?.length > 0 && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>To‘lovlar tarixi</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tarif</th>
                  <th>Aniq summa</th>
                  <th>Holat</th>
                  <th>Sana</th>
                </tr>
              </thead>
              <tbody>
                {d.orders.map((o: any) => (
                  <tr key={o.id}>
                    <td><strong>{(o.plan === "center" ? "ULTRA" : o.plan.toUpperCase())}</strong> ({o.months} oy)</td>
                    <td>{Number(o.unique_amount).toLocaleString("ru-RU")} so‘m</td>
                    <td>
                      <Pill tone={o.status === "paid" ? "green" : o.status === "rejected" ? "red" : "amber"}>
                        {o.status === "paid" ? "To‘landi" : o.status === "rejected" ? "Rad etildi" : "Kutilmoqda"}
                      </Pill>
                    </td>
                    <td>{new Date(Number(o.created_at) * 1000).toLocaleString("uz-UZ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
