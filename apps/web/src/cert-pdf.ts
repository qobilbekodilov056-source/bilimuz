export type CertInfo = {
  studentName: string;
  studentCode?: string;
  groupName?: string;
  tenantName?: string;
  subtitle?: string;
  testTitle: string;
  category?: string;
  percentage: number;
  score: number;
  maxScore: number;
  correct?: number;
  incorrect?: number;
  unanswered?: number;
  passed: boolean;
  reward?: string;
  dateText: string;
  certCode: string;
  verifyUrl?: string;
};

function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================================
// Pure-TypeScript ISO/IEC 18004 QR Code SVG Generator (Versions 1-6, EC Level L)
// Zero npm dependencies, zero external requests, 100% browser-side (0 bytes server)
// ============================================================================
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenPoly(deg: number): number[] {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGenPoly(ecLen);
  const res = new Uint8Array(data.length + ecLen);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], factor);
      }
    }
  }
  return res.slice(data.length);
}

const QR_VERSIONS: Array<[number, number, number, number[]] | null> = [
  null,
  [19, 7, 1, []],
  [34, 10, 1, [6, 18]],
  [55, 15, 1, [6, 22]],
  [80, 20, 1, [6, 26]],
  [108, 26, 1, [6, 30]],
  [136, 18, 2, [6, 34]],
];

export function makeQrSvg(text: string, pxSize = 98): string {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= 6; ver++) {
    const spec = QR_VERSIONS[ver]!;
    if (4 + 8 + bytes.length * 8 <= spec[0] * 8) break;
  }
  if (ver > 6) {
    bytes.length = 134;
    ver = 6;
  }
  const [totalData, ecLen, numBlocks, aligns] = QR_VERSIONS[ver]!;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (const b of bytes) pushBits(b, 8);
  const maxBits = totalData * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }
  const pads = [0xec, 0x11];
  let pi = 0;
  while (codewords.length < totalData) {
    codewords.push(pads[pi & 1]);
    pi++;
  }

  const blockSize = totalData / numBlocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  for (let b = 0; b < numBlocks; b++) {
    const blk = Uint8Array.from(codewords.slice(b * blockSize, (b + 1) * blockSize));
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, ecLen));
  }
  const finalBytes: number[] = [];
  for (let i = 0; i < blockSize; i++) for (let b = 0; b < numBlocks; b++) finalBytes.push(dataBlocks[b][i]);
  for (let i = 0; i < ecLen; i++) for (let b = 0; b < numBlocks; b++) finalBytes.push(ecBlocks[b][i]);

  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r: number, c: number, v: boolean | number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      mod[r][c] = v ? 1 : 0;
      isFunc[r][c] = 1;
    }
  };
  const placeFinder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark =
          inside &&
          (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        setFunc(r0 + r, c0 + c, dark);
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, (i & 1) === 0);
    setFunc(i, 6, (i & 1) === 0);
  }
  for (const r of aligns) {
    for (const c of aligns) {
      if (isFunc[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFunc(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) setFunc(8, i, 0);
    if (!isFunc[i][8]) setFunc(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, 0);
    setFunc(size - 1 - i, 8, 0);
  }
  setFunc(size - 8, 8, 1);

  const bitStream: number[] = [];
  for (const b of finalBytes) for (let i = 7; i >= 0; i--) bitStream.push((b >>> i) & 1);
  let bi = 0;
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col = 5;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!isFunc[r][c]) {
          const bit = bi < bitStream.length ? bitStream[bi++] : 0;
          mod[r][c] = bit ^ (((r + c) & 1) === 0 ? 1 : 0);
        }
      }
    }
    upward = !upward;
  }

  // Format info for EC Level L (01) + Mask 0 (000) -> 0x77c4
  const fmt = 0x77c4;
  for (let i = 0; i < 6; i++) setFunc(8, i, (fmt >>> (14 - i)) & 1);
  setFunc(8, 7, (fmt >>> 8) & 1);
  setFunc(8, 8, (fmt >>> 7) & 1);
  setFunc(7, 8, (fmt >>> 6) & 1);
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, (fmt >>> (14 - i)) & 1);
  for (let i = 0; i < 8; i++) setFunc(8, size - 1 - i, (fmt >>> i) & 1);
  for (let i = 8; i < 15; i++) setFunc(size - 15 + i, 8, (fmt >>> i) & 1);

  const quiet = 3;
  const vb = size + quiet * 2;
  let paths = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (mod[r][c] === 1) {
        paths += `M${c + quiet},${r + quiet}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb} ${vb}" width="${pxSize}" height="${pxSize}" shape-rendering="crispEdges"><rect width="${vb}" height="${vb}" fill="#ffffff"/><path d="${paths}" fill="#162d3d"/></svg>`;
}

export function openCertificatePrint(c: CertInfo) {
  const win = window.open("", "_blank", "width=1140,height=810");
  if (!win) {
    alert("Brauzerda pop-up oynalarga ruxsat bering (sertifikatni chop etish uchun).");
    return;
  }

  const pct = Number(c.percentage || 0);
  const heading = c.passed || pct >= 70 ? "SERTIFIKAT" : "NATIJA VARAQASI";
  const tier =
    pct >= 90
      ? { label: "OLTIN DARAJA · A’LO NATIJA", color: "#b7851a", bg: "#fef9e7" }
      : pct >= 80
        ? { label: "KUMUSH DARAJA · YUKSAK NATIJA", color: "#0c8066", bg: "#ecfdf5" }
        : c.passed || pct >= 70
          ? { label: "MUVAFFAQIYATLI TOPSHIRDI", color: "#162d3d", bg: "#eff6ff" }
          : { label: "TEST NATIJASI", color: "#475569", bg: "#f1f5f9" };

  const origin = location.origin || "https://bilimuz.dpdns.org";
  const verifyUrl =
    c.verifyUrl ||
    (c.studentCode
      ? `${origin}/parent/${encodeURIComponent(c.studentCode)}`
      : origin);
  const qrSvg = makeQrSvg(verifyUrl, 96);
  const logoUrl = origin + "/logo.png";

  const subMeta = [c.subtitle, c.tenantName, c.groupName, c.studentCode ? `Kod: ${c.studentCode}` : ""]
    .filter(Boolean)
    .join(" · ");

  const statsLine =
    typeof c.correct === "number"
      ? `To‘g‘ri: ${c.correct} · Xato: ${c.incorrect ?? 0} · Bo‘sh: ${c.unanswered ?? 0}`
      : "";

  const html = `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<title>${escHtml(heading)} — ${escHtml(c.studentName)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px; background: #e8eef3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .toolbar {
    margin-bottom: 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
  }
  .toolbar button {
    padding: 10px 20px; border-radius: 10px; border: 0; cursor: pointer;
    font-weight: 700; font-size: 14px; background: #162d3d; color: #fff;
  }
  .toolbar button.sec {
    background: #fff; color: #162d3d; border: 1px solid #cbd5e1;
  }
  .sheet {
    width: 1054px; height: 744px; background: #ffffff; position: relative;
    padding: 26px; box-shadow: 0 22px 54px rgba(22, 45, 61, 0.2);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .frame-outer {
    flex: 1; border: 4px solid #162d3d; padding: 8px; display: flex; flex-direction: column;
    position: relative;
  }
  .frame-inner {
    flex: 1; border: 1.8px solid #c89b3c; padding: 28px 46px 24px;
    display: flex; flex-direction: column; justify-content: space-between; text-align: center;
    background:
      radial-gradient(circle at top right, rgba(200, 155, 60, 0.11), transparent 44%),
      radial-gradient(circle at bottom left, rgba(12, 128, 102, 0.09), transparent 44%),
      #ffffff;
    position: relative;
  }
  .corner {
    position: absolute; width: 28px; height: 28px; border-color: #c89b3c; border-style: solid;
  }
  .c-tl { top: 8px; left: 8px; border-width: 3px 0 0 3px; }
  .c-tr { top: 8px; right: 8px; border-width: 3px 3px 0 0; }
  .c-bl { bottom: 8px; left: 8px; border-width: 0 0 3px 3px; }
  .c-br { bottom: 8px; right: 8px; border-width: 0 3px 3px 0; }

  .top { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 12px; text-align: left; }
  .brand img { width: 46px; height: 46px; border-radius: 10px; object-fit: cover; }
  .brand strong { display: block; font-size: 20px; color: #162d3d; letter-spacing: 0.4px; }
  .brand small { font-size: 11px; color: #64748b; letter-spacing: 0.9px; text-transform: uppercase; }
  .code { font-size: 11.5px; color: #64748b; text-align: right; }
  .code strong { display: block; font-size: 13.5px; color: #162d3d; letter-spacing: 0.6px; }

  .center { padding: 4px 12px; }
  .tier-pill {
    display: inline-block; padding: 5px 16px; border-radius: 999px;
    font-size: 11.5px; font-weight: 800; letter-spacing: 1.4px;
    color: ${tier.color}; background: ${tier.bg}; border: 1px solid ${tier.color}44;
    margin-bottom: 10px;
  }
  h1 {
    margin: 0; font-size: 46px; letter-spacing: 6px; color: #162d3d;
    font-family: Georgia, "Times New Roman", serif;
  }
  .subtitle {
    margin: 8px 0 6px; font-size: 14px; color: #64748b; letter-spacing: 0.4px;
  }
  .student-name {
    margin: 4px 0; font-size: 36px; font-weight: 800; color: #0c8066;
    font-family: Georgia, "Times New Roman", serif;
    border-bottom: 2px solid #e2e8f0; display: inline-block; padding: 0 28px 6px;
  }
  .sub-meta {
    margin: 6px 0 0; font-size: 13px; color: #475569; font-weight: 600;
  }
  .desc {
    margin: 14px auto 0; max-width: 720px; font-size: 15.5px; line-height: 1.55; color: #1e293b;
  }
  .desc strong { color: #162d3d; }
  .score-strip {
    margin: 16px auto 0; display: inline-flex; align-items: center; gap: 22px;
    padding: 10px 26px; border-radius: 14px; background: #f8fafc; border: 1px solid #e2e8f0;
  }
  .score-box { text-align: center; }
  .score-box small { display: block; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; }
  .score-box strong { font-size: 20px; color: #162d3d; }
  .score-box.is-main strong { color: #0c8066; font-size: 24px; }
  .reward-note {
    margin: 10px auto 0; display: inline-block; padding: 5px 14px; border-radius: 8px;
    background: #fef9e7; border: 1px solid #f3d58d; color: #92400e; font-size: 13px; font-weight: 700;
  }

  .bottom {
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 18px;
    padding-top: 10px; border-top: 1px dashed #cbd5e1;
  }
  .sign-col { text-align: left; }
  .sign-line { width: 200px; border-bottom: 1.5px solid #162d3d; margin-bottom: 6px; height: 22px; }
  .sign-col strong { display: block; font-size: 13.5px; color: #162d3d; }
  .sign-col small { display: block; font-size: 11.5px; color: #64748b; }

  .seal-col { display: flex; flex-direction: column; align-items: center; }
  .seal {
    width: 78px; height: 78px; border-radius: 50%;
    border: 2.5px dashed #c89b3c; background: radial-gradient(circle, #fffdf6 40%, #fef3c7 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #162d3d; font-weight: 800; font-size: 10px; letter-spacing: 0.8px;
    box-shadow: 0 4px 12px rgba(200, 155, 60, 0.25);
  }
  .seal span { color: #0c8066; font-size: 18px; line-height: 1; margin-bottom: 2px; }

  .qr-col {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px; text-align: right;
  }
  .qr-caption strong { display: block; font-size: 11.5px; color: #162d3d; }
  .qr-caption small { display: block; font-size: 10.5px; color: #64748b; max-width: 145px; line-height: 1.35; }
  .qr-box {
    padding: 4px; background: #fff; border: 1.5px solid #162d3d; border-radius: 8px;
    line-height: 0;
  }

  @media print {
    body { padding: 0; background: #fff; }
    .toolbar { display: none !important; }
    .sheet { width: 297mm; height: 210mm; box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ PDF saqlash / Chop etish</button>
    <button class="sec" onclick="window.close()">✕ Yopish</button>
  </div>
  <div class="sheet">
    <div class="frame-outer">
      <div class="frame-inner">
        <span class="corner c-tl"></span>
        <span class="corner c-tr"></span>
        <span class="corner c-bl"></span>
        <span class="corner c-br"></span>

        <div class="top">
          <div class="brand">
            <img src="${escHtml(logoUrl)}" alt="Bilim UZ" onerror="this.style.display='none'" />
            <div>
              <strong>Bilim UZ</strong>
              <small>Ta’lim platformasi · Powered by SysOne</small>
            </div>
          </div>
          <div class="code">
            <span>Sertifikat raqami</span>
            <strong>${escHtml(c.certCode)}</strong>
            <span>${escHtml(c.dateText)}</span>
          </div>
        </div>

        <div class="center">
          <div class="tier-pill">${escHtml(tier.label)}</div>
          <h1>${escHtml(heading)}</h1>
          <div class="subtitle">Ushbu sertifikat quyidagi ishtirokchiga beriladi:</div>
          <div class="student-name">${escHtml(c.studentName)}</div>
          ${subMeta ? `<div class="sub-meta">${escHtml(subMeta)}</div>` : ""}
          <p class="desc">
            <strong>“${escHtml(c.testTitle)}”</strong>${c.category ? ` (${escHtml(c.category)})` : ""}
            bo‘yicha o‘tkazilgan bilim sinovida qatnashib, yuksak natija qayd etgani uchun taqdirlanadi.
          </p>
          <div class="score-strip">
            <div class="score-box is-main">
              <small>Natija</small>
              <strong>${pct}%</strong>
            </div>
            <div class="score-box">
              <small>To‘plangan ball</small>
              <strong>${escHtml(c.score)} / ${escHtml(c.maxScore)}</strong>
            </div>
            ${statsLine ? `<div class="score-box"><small>Tafsilot</small><strong style="font-size:13.5px">${escHtml(statsLine)}</strong></div>` : ""}
          </div>
          ${c.reward ? `<div><span class="reward-note">🏆 Yutuq: ${escHtml(c.reward)}</span></div>` : ""}
        </div>

        <div class="bottom">
          <div class="sign-col">
            <div class="sign-line"></div>
            <strong>${escHtml(c.tenantName || "Bilim UZ Platformasi")}</strong>
            <small>Tasdiqlangan sana: ${escHtml(c.dateText)}</small>
          </div>
          <div class="seal-col">
            <div class="seal">
              <span>✓</span>
              BILIM UZ
              <div style="font-size:8px;opacity:0.75">VERIFIED</div>
            </div>
          </div>
          <div class="qr-col">
            <div class="qr-caption">
              <strong>QR-kod orqali tekshirish</strong>
              <small>Haqiqiyligini tekshirish uchun telefon kamerasi bilan skanerlang</small>
              <small style="color:#0c8066;font-weight:700;margin-top:2px">bilimuz.dpdns.org</small>
            </div>
            <div class="qr-box">${qrSvg}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}
