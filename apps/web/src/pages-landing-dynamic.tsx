import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Calculator,
  CalendarDays,
  CheckCircle2,
  Coins,
  FileSpreadsheet,
  Flame,
  Play,
  QrCode,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

type LandingStats = {
  students: number;
  questions: number;
  solves: number;
  books: number;
  teachers: number;
  hot_tests: { slug: string; title: string; description?: string; solves: number }[];
};

function useCountUp(target: number, durationMs = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target || target <= 0) {
      setVal(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

export function DynamicLandingShowcase() {
  const [stats, setStats] = useState<LandingStats | null>(null);
  const [tab, setTab] = useState<"quiz" | "telegram" | "excel">("quiz");

  // Interactive Quiz Demo state
  const [pickedOpt, setPickedOpt] = useState<string>("");
  const quizCorrect = "B";

  // Telegram Parent Bot Simulation state
  const [tgSent, setTgSent] = useState(false);

  // Excel 100-question Import Simulation state
  const [excelStep, setExcelStep] = useState<0 | 1 | 2>(0);

  // Time & Plan Calculator state
  const [calcStudents, setCalcStudents] = useState(60);
  const [calcTests, setCalcTests] = useState(4);

  useEffect(() => {
    fetch("/api/v2/public/landing-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setStats(d);
      })
      .catch(() => {});
  }, []);

  const cStudents = useCountUp(stats?.students || 0);
  const cSolves = useCountUp(stats?.solves || 0);
  const cQuestions = useCountUp(stats?.questions || 0);
  const cBooks = useCountUp(stats?.books || 0);

  // Saved hours per month: ~4 min checking + grading per student per test
  const savedHours = Math.max(2, Math.round((calcStudents * calcTests * 4) / 60));
  const recommendedPlan =
    calcStudents <= 30
      ? { name: "Start (Bepul)", price: "0 so‘m / oy", note: "2 guruh va 30 o‘quvchigacha bepul boshlang" }
      : calcStudents <= 300
        ? { name: "Ustoz Pro", price: "49 000 so‘m / oy", note: "20 guruh, 300 o‘quvchi, Excel import va A4 PDF" }
        : { name: "Ultra", price: "199 000 so‘m / oy", note: "200 guruh, 2 500 o‘quvchi + Ota-ona Telegram boti" };

  function runExcelSim() {
    if (excelStep === 1) return;
    setExcelStep(1);
    setTimeout(() => setExcelStep(2), 950);
  }

  return (
    <div className="lpd-wrap">
      {/* 1. JONLI D1 STATISTIKA LENTASI */}
      <section className="lpd-stats-bar" aria-label="Platforma jonli ko‘rsatkichlari">
        <div className="lpd-live-pill">
          <span className="lpd-live-dot" /> JONLI BAZA
        </div>
        <div className="lpd-stats-grid">
          <div className="lpd-stat">
            <strong>{cStudents.toLocaleString("uz-UZ")}+</strong>
            <span>Faol o‘quvchi</span>
          </div>
          <div className="lpd-stat">
            <strong>{cSolves.toLocaleString("uz-UZ")}+</strong>
            <span>Yechilgan test</span>
          </div>
          <div className="lpd-stat">
            <strong>{cQuestions.toLocaleString("uz-UZ")}+</strong>
            <span>Savollar bazasi</span>
          </div>
          <div className="lpd-stat">
            <strong>{cBooks.toLocaleString("uz-UZ")}+</strong>
            <span>Raqamli kitob</span>
          </div>
        </div>
      </section>

      {/* 2. 15 SONIYALIK JONLI SINOV OYNASI (INTERACTIVE PLAYGROUND) */}
      <section className="lpd-section">
        <div className="lpd-head">
          <span className="lpd-badge"><Sparkles size={14} /> RO‘YXATDAN O‘TMASDAN SINAB KO‘RING</span>
          <h2>Platforma qanday ishlashini 15 soniyada o‘zingiz sinang</h2>
          <p>Oddiy ta’rif o‘rniga quyidagi 3 ta jonli simulyatordan birini tanlab bosib ko‘ring.</p>
        </div>

        <div className="lpd-tabs">
          <button
            type="button"
            className={tab === "quiz" ? "lpd-tab is-active" : "lpd-tab"}
            onClick={() => setTab("quiz")}
          >
            <Coins size={16} /> 1. Savol + Coin &amp; QR Sertifikat
          </button>
          <button
            type="button"
            className={tab === "telegram" ? "lpd-tab is-active" : "lpd-tab"}
            onClick={() => setTab("telegram")}
          >
            <Bell size={16} /> 2. Ota-ona Telegram Boti
          </button>
          <button
            type="button"
            className={tab === "excel" ? "lpd-tab is-active" : "lpd-tab"}
            onClick={() => setTab("excel")}
          >
            <FileSpreadsheet size={16} /> 3. Excel’dan 100 ta savol
          </button>
        </div>

        <div className="lpd-stage">
          {tab === "quiz" && (
            <div className="lpd-demo-grid">
              <div className="lpd-demo-card">
                <div className="lpd-demo-top">
                  <span>NAMUNA SAVOL · KOMPYUTER SAVODXONLIGI</span>
                  <span className="lpd-coin-tag" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>+25 <Coins size={13} color="#b45309" /></span>
                </div>
                <h3>Veb-sayt manzili boshidagi «HTTPS» protokoli nimani ta’minlaydi?</h3>
                <div className="lpd-opts">
                  {[
                    ["A", "Faqat sayt dizaynini chiroyli qiladi"],
                    ["B", "Ma’lumotlarni shifrlab xavfsiz uzatadi"],
                    ["C", "Internet tezligini 10 baravar oshiradi"],
                  ].map(([k, txt]) => {
                    const isPicked = pickedOpt === k;
                    const isRight = pickedOpt && k === quizCorrect;
                    const isWrong = isPicked && k !== quizCorrect;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={
                          "lpd-opt" +
                          (isRight ? " is-right" : "") +
                          (isWrong ? " is-wrong" : "")
                        }
                        onClick={() => setPickedOpt(k)}
                      >
                        <span className="lpd-opt-k">{k}</span>
                        <span>{txt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lpd-demo-result">
                {!pickedOpt ? (
                  <div className="lpd-placeholder">
                    <Award size={36} />
                    <strong>Javobni tanlang</strong>
                    <p>To‘g‘ri javob berishingiz bilan Bilim Coin hisoblanishi va QR sertifikat namunasi shu yerda paydo bo‘ladi.</p>
                  </div>
                ) : pickedOpt === quizCorrect ? (
                  <div className="lpd-cert-pop">
                    <div className="lpd-coin-burst" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Sparkles size={15} /> +25 Bilim Coin qo‘shildi!</div>
                    <div className="lpd-mini-cert">
                      <div className="lpd-mini-cert-top">
                        <Award size={20} /> <strong>BILIM UZ · SERTIFIKAT</strong>
                      </div>
                      <p>Kompyuter savodxonligi · 100% natija</p>
                      <div className="lpd-mini-cert-foot">
                        <span className="lpd-qr-fake"><QrCode size={26} /></span>
                        <small>Skanerlanuvchi QR kod · A4 PDF tayyor</small>
                      </div>
                    </div>
                    <Link to="/practice" className="lpd-action-btn">
                      Haqiqiy testlarni yechish <ArrowRight size={15} />
                    </Link>
                  </div>
                ) : (
                  <div className="lpd-placeholder">
                    <CheckCircle2 size={32} />
                    <strong>Deyarli! Yana urinib ko‘ring</strong>
                    <p>To‘g‘ri javob — <strong>B</strong> (shifrlangan xavfsiz aloqa). Qayta bosib sertifikatni oching!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "telegram" && (
            <div className="lpd-demo-grid">
              <div className="lpd-demo-card">
                <div className="lpd-demo-top">
                  <span>ULTRA TARIFI · AVTOMATIK XABARNOMA</span>
                </div>
                <h3>O‘quvchi testni tugatishi bilan ota-onaga Telegram’da xabar boradi</h3>
                <p style={{ color: "#4a5b66", margin: "8px 0 18px", fontSize: 14.5 }}>
                  O‘qituvchi hech kimga qo‘lda yozib o‘tirmaydi: davomat, baho, vazifa va test natijasi soniyalar ichida ota-onaning Telegramiga tushadi.
                </p>
                <button
                  type="button"
                  className="lpd-action-btn"
                  onClick={() => setTgSent(true)}
                >
                  <Play size={15} /> {tgSent ? "Xabar yuborildi ✓ (Qayta ko‘rish)" : "Test yakunlanishini sinash"}
                </button>
              </div>

              <div className="lpd-phone">
                <div className="lpd-phone-head">
                  <strong>@BilimUZBot</strong>
                  <span>bot</span>
                </div>
                <div className="lpd-phone-body">
                  <div className="lpd-tg-msg">
                    <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarDays size={14} color="#38bdf8" /> Davomat</strong>
                    <p>Farzandingiz <b>Azizbek</b> bugungi Informatika darsiga <b>keldi ✓</b> (15:00).</p>
                  </div>
                  {tgSent ? (
                    <div className="lpd-tg-msg is-new">
                      <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Trophy size={14} color="#fbbf24" /> Test natijasi — 95%</strong>
                      <p>«Kompyuter savodxonligi» testidan <b>19 / 20</b> ball oldi! +40 Bilim Coin va QR sertifikat tayyor.</p>
                      <small>Hozirgina · Bilim UZ</small>
                    </div>
                  ) : (
                    <div className="lpd-tg-wait">Chapdagi tugmani bosing — jonli xabar kelishini ko‘ring</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "excel" && (
            <div className="lpd-demo-grid">
              <div className="lpd-demo-card">
                <div className="lpd-demo-top">
                  <span>O‘QITUVCHILAR UCHUN · 10X TEZLIK</span>
                </div>
                <h3>100 ta savolli Excel faylni 1 bosishda onlayn test va A4 PDF ga aylantiring</h3>
                <p style={{ color: "#4a5b66", margin: "8px 0 18px", fontSize: 14.5 }}>
                  Savollarni bitta-bitta yozib o‘tirish shart emas. Tayyor Excel jadvalini tashlang — tizim variantlarni aralashtirib ham onlayn kod, ham 4 variantli chop etiladigan A4 PDF chiqaradi.
                </p>
                <button type="button" className="lpd-action-btn" onClick={runExcelSim}>
                  <FileSpreadsheet size={15} /> {excelStep === 1 ? "Yuklanmoqda..." : "100 ta savolni import qilish"}
                </button>
              </div>

              <div className="lpd-demo-result">
                {excelStep === 0 && (
                  <div className="lpd-placeholder">
                    <FileSpreadsheet size={36} />
                    <strong>informatika_100_savol.xlsx</strong>
                    <p>Tugmani bosing va tizim 1 soniyada nimalar tayyorlab berishini ko‘ring.</p>
                  </div>
                )}
                {excelStep === 1 && (
                  <div className="lpd-placeholder">
                    <Flame size={34} />
                    <strong>100 ta savol tekshirilmoqda...</strong>
                    <div className="lpd-bar"><span /></div>
                  </div>
                )}
                {excelStep === 2 && (
                  <div className="lpd-excel-done">
                    <div className="lpd-coin-burst" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}><CheckCircle2 size={15} /> 100 ta savol 0.9 soniyada tayyor!</div>
                    <ul>
                      <li><CheckCircle2 size={15} /> Onlayn test kodi: <b>KP-84920</b></li>
                      <li><CheckCircle2 size={15} /> 4 variantli oflayn A4 PDF + javoblar kaliti</li>
                      <li><CheckCircle2 size={15} /> Anti-Cheat va avtomatik reyting yoqilgan</li>
                    </ul>
                    <Link to="/studio" className="lpd-action-btn">
                      O‘qituvchi studiosida sinash <ArrowRight size={15} />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 3. INTERAKTIV TEJALGAN VAQT VA TARIF KALKULYATORI */}
      <section className="lpd-calc-band">
        <div className="lpd-calc-left">
          <span className="lpd-badge dark"><Calculator size={14} /> VAQT VA TARIF KALKULYATORI</span>
          <h2>Bilim UZ sizga oyiga qancha vaqt tejaydi?</h2>
          <p>O‘quvchilaringiz va oylik testlar sonini surib ko‘ring — tizim tejaladigan soat va eng qulay tarifni darhol hisoblaydi.</p>

          <label className="lpd-slider-row">
            <div><span>O‘quvchilaringiz soni</span><strong>{calcStudents} nafar</strong></div>
            <input
              type="range"
              min={10}
              max={500}
              step={10}
              value={calcStudents}
              onChange={(e) => setCalcStudents(Number(e.target.value))}
            />
          </label>

          <label className="lpd-slider-row">
            <div><span>Oyiga test va vazifalar soni</span><strong>{calcTests} marta</strong></div>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={calcTests}
              onChange={(e) => setCalcTests(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="lpd-calc-right">
          <div className="lpd-calc-metric">
            <small>OYIGA TEJALADIGAN VAQT</small>
            <strong>{savedHours} soat</strong>
            <span>Yiliga ~{Math.round((savedHours * 10) / 8)} ta to‘liq ish kuni bo‘sh qoladi</span>
          </div>
          <div className="lpd-calc-plan">
            <small>SIZGA MOS TARIF</small>
            <div className="lpd-calc-plan-row">
              <strong>{recommendedPlan.name}</strong>
              <span>{recommendedPlan.price}</span>
            </div>
            <p>{recommendedPlan.note}</p>
            <Link to="/studio" className="lpd-action-btn light">
              Bepul boshlash <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. JONLI OCHIQ TESTLAR VITRINASI (REAL D1 DATA) */}
      {stats?.hot_tests && stats.hot_tests.length > 0 && (
        <section className="lpd-section">
          <div className="lpd-head-row">
            <div>
              <span className="lpd-badge"><BookOpen size={14} /> HOZIROQ YECHISH MUMKIN</span>
              <h2>Eng ommabop ochiq mashq testlari</h2>
            </div>
            <Link to="/practice" className="lpd-link-all">
              Barcha testlar <ArrowRight size={15} />
            </Link>
          </div>

          <div className="lpd-tests-grid">
            {stats.hot_tests.map((t) => (
              <Link key={t.slug} to={"/practice/" + encodeURIComponent(t.slug)} className="lpd-test-card">
                <div className="lpd-test-top">
                  <span className="lpd-slug">{t.slug}</span>
                  <span className="lpd-solves"><Users size={13} /> {t.solves} marta</span>
                </div>
                <h3>{t.title}</h3>
                {t.description && <p>{t.description.slice(0, 95)}{t.description.length > 95 ? "…" : ""}</p>}
                <span className="lpd-test-go">Hoziroq yechish <ArrowRight size={14} /></span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
