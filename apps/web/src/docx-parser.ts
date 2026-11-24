export interface ParsedChapter {
  title: string;
  summary: string;
  content: string;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(new Uint8Array(data));
  writer.close();
  const out = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(out);
}

async function extractZipEntry(buf: ArrayBuffer, targetName: string): Promise<string> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // Find End of Central Directory (0x06054b50)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("Yaroqsiz .docx (ZIP) fayl");

  const cdCount = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder("utf-8");

  for (let i = 0; i < cdCount; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const name = dec.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

    if (name === targetName) {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const slice = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return dec.decode(slice);
      if (method === 8) return dec.decode(await inflateRaw(slice));
      throw new Error("Qo‘llab-quvvatlanmaydigan siqish usuli: " + method);
    }
    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("Word hujjati tarkibi (word/document.xml) topilmadi");
}

function splitLongTextIntoChapters(rawText: string, fallbackTitle: string): ParsedChapter[] {
  const paras = rawText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) return [];

  const chapters: ParsedChapter[] = [];
  let buf: string[] = [];
  let charCount = 0;
  let part = 1;

  for (const p of paras) {
    if (charCount > 3200 && buf.length >= 2) {
      chapters.push({
        title: part === 1 ? fallbackTitle : `${part}-qism`,
        summary: "",
        content: buf.join("\n\n"),
      });
      buf = [];
      charCount = 0;
      part++;
    }
    buf.push(p);
    charCount += p.length;
  }
  if (buf.length) {
    chapters.push({
      title: part === 1 ? fallbackTitle : `${part}-qism`,
      summary: "",
      content: buf.join("\n\n"),
    });
  }
  return chapters;
}

export async function parseBookFileToChapters(file: File): Promise<ParsedChapter[]> {
  const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "1-bob";

  // Plain text / Markdown
  if (/\.(txt|md)$/i.test(file.name)) {
    const text = await file.text();
    const lines = text.split(/\r?\n/);
    const chapters: ParsedChapter[] = [];
    let curTitle = "";
    let curLines: string[] = [];

    for (const line of lines) {
      const m = /^#\s+(.+)$/.exec(line.trim());
      if (m) {
        if (curLines.join("\n").trim()) {
          chapters.push({
            title: curTitle || `${chapters.length + 1}-bob`,
            summary: "",
            content: curLines.join("\n").trim(),
          });
        }
        curTitle = m[1].trim().slice(0, 170);
        curLines = [];
      } else {
        curLines.push(line);
      }
    }
    if (curLines.join("\n").trim()) {
      chapters.push({
        title: curTitle || (chapters.length ? `${chapters.length + 1}-bob` : baseName),
        summary: "",
        content: curLines.join("\n").trim(),
      });
    }
    if (chapters.length === 1 && chapters[0].content.length > 5000) {
      return splitLongTextIntoChapters(chapters[0].content, chapters[0].title);
    }
    return chapters;
  }

  // Microsoft Word (.docx)
  const buf = await file.arrayBuffer();
  const xmlStr = await extractZipEntry(buf, "word/document.xml");
  const doc = new DOMParser().parseFromString(xmlStr, "application/xml");
  const bodyEl = doc.getElementsByTagName("w:body")[0];
  if (!bodyEl) throw new Error("Word faylida matn topilmadi");

  const blocks: { isChapterHeading: boolean; isSubHeading: boolean; text: string }[] = [];

  for (const child of Array.from(bodyEl.children)) {
    if (child.tagName === "w:p") {
      const pStyleEl = child.getElementsByTagName("w:pStyle")[0];
      const styleVal = (pStyleEl?.getAttribute("w:val") || "").toLowerCase();
      const numPr = child.getElementsByTagName("w:numPr")[0];

      const runs = Array.from(child.getElementsByTagName("w:r"));
      let text = "";
      for (const r of runs) {
        const tEls = Array.from(r.getElementsByTagName("w:t"));
        const chunk = tEls.map((t) => t.textContent || "").join("");
        if (!chunk) continue;
        const isBold = r.getElementsByTagName("w:b").length > 0;
        text += isBold && chunk.trim().length > 1 && chunk.trim().length < 90 && !styleVal.includes("heading")
          ? `**${chunk}**`
          : chunk;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text) continue;

      const cleanText = text.replace(/\*\*/g, "").trim();
      const looksLikeChapter =
        styleVal === "heading1" ||
        styleVal === "title" ||
        styleVal === "1" ||
        /^(\d+\s*[-.]?\s*(bob|mavzu|dars)|bob\s+\d+)/i.test(cleanText);
      const looksLikeSub = styleVal === "heading2" || styleVal === "heading3" || styleVal === "2";

      if (looksLikeChapter && cleanText.length <= 150) {
        blocks.push({ isChapterHeading: true, isSubHeading: false, text: cleanText });
      } else if (looksLikeSub && cleanText.length <= 150) {
        blocks.push({ isChapterHeading: false, isSubHeading: true, text: "## " + cleanText });
      } else if (numPr) {
        blocks.push({ isChapterHeading: false, isSubHeading: false, text: "- " + text });
      } else {
        blocks.push({ isChapterHeading: false, isSubHeading: false, text });
      }
    } else if (child.tagName === "w:tbl") {
      const trs = Array.from(child.getElementsByTagName("w:tr"));
      const rowsMd: string[] = [];
      trs.forEach((tr, rIdx) => {
        const cells = Array.from(tr.getElementsByTagName("w:tc")).map((tc) =>
          (tc.textContent || "").replace(/\s+/g, " ").replace(/\|/g, "/").trim() || "—",
        );
        if (cells.length) {
          rowsMd.push("| " + cells.join(" | ") + " |");
          if (rIdx === 0) rowsMd.push("| " + cells.map(() => "---").join(" | ") + " |");
        }
      });
      if (rowsMd.length) {
        blocks.push({ isChapterHeading: false, isSubHeading: false, text: rowsMd.join("\n") });
      }
    }
  }

  const chapters: ParsedChapter[] = [];
  let curTitle = "";
  let curBody: string[] = [];

  for (const b of blocks) {
    if (b.isChapterHeading) {
      if (curBody.length) {
        chapters.push({
          title: curTitle || `${chapters.length + 1}-bob`,
          summary: "",
          content: curBody.join("\n\n"),
        });
      }
      curTitle = b.text.slice(0, 170);
      curBody = [];
    } else {
      curBody.push(b.text);
    }
  }
  if (curBody.length) {
    chapters.push({
      title: curTitle || (chapters.length ? `${chapters.length + 1}-bob` : baseName),
      summary: "",
      content: curBody.join("\n\n"),
    });
  }

  if (chapters.length === 1 && chapters[0].content.length > 5000) {
    return splitLongTextIntoChapters(chapters[0].content, chapters[0].title);
  }
  if (!chapters.length) {
    throw new Error("Fayldan o‘qiladigan matn topilmadi");
  }
  return chapters.slice(0, 80);
}
