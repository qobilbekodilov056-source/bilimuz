import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { HTTPException } from "hono/http-exception";
import { fail } from "./core";
export type Cell = { value: string; formula?: boolean };
const array = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  transformTagName: (name: string) => name.split(":").pop()!,
  transformAttributeName: (name: string) => (name === "r:id" ? "r:id" : name),
  parseTagValue: false,
  trimValues: false,
  processEntities: true,
});
function parse(bytes: Uint8Array) {
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail("XML entity/DTD ruxsat etilmagan");
  return xmlParser.parse(text);
}
function decodeNumEntities(str: string): string {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}
function textOf(value: any): string {
  if (typeof value === "string" || typeof value === "number")
    return decodeNumEntities(String(value));
  if (value === undefined || value === null) return "";
  if (value["#text"] !== undefined) return decodeNumEntities(String(value["#text"]));
  if (value.r)
    return array(value.r)
      .map((r: any) => textOf(r.t))
      .join("");
  return textOf(value.t);
}
export function parseXlsx(bytes: Uint8Array): Cell[][] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(f) {
        if (
          f.name.includes("..") ||
          f.name.startsWith("/") ||
          f.originalSize > 8 * 1024 * 1024
        )
          fail("XLSX arxiv o‘lchami yoki yo‘li noto‘g‘ri");
        total += f.originalSize;
        if (total > 20 * 1024 * 1024)
          fail("XLSX ochilgan hajmi 20 MB dan oshmasin", 413);
        return /^(xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/sheet\d+.xml))$/.test(
          f.name,
        );
      },
    });
  } catch (e) {
    if (e instanceof HTTPException) throw e;
    fail("XLSX arxivi ochilmadi");
  }
  if (!files["xl/workbook.xml"] || !files["xl/_rels/workbook.xml.rels"])
    fail("XLSX tuzilmasi noto‘g‘ri");
  const book = parse(files["xl/workbook.xml"]);
  const sheet = array<any>(book.workbook?.sheets?.sheet).find(
    (s) => s["@_name"] === "Savollar",
  );
  if (!sheet) fail("«Savollar» varag‘i topilmadi");
  const rels = parse(files["xl/_rels/workbook.xml.rels"]);
  const rel = array<any>(rels.Relationships?.Relationship).find(
    (r) => r["@_Id"] === sheet["@_r:id"],
  );
  if (!rel || rel["@_TargetMode"] === "External")
    fail("XLSX varaq manzili noto‘g‘ri");
  let target = String(rel["@_Target"]);
  target = target.startsWith("/") ? target.slice(1) : "xl/" + target;
  if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(target) || !files[target])
    fail("XLSX varaq manzili noto‘g‘ri");
  const shared = files["xl/sharedStrings.xml"]
    ? array<any>(parse(files["xl/sharedStrings.xml"]).sst?.si).map(textOf)
    : [];
  const sheetData = parse(files[target]);
  const sheetRows = array<any>(sheetData.worksheet?.sheetData?.row);
  if (sheetRows.length > 1001) fail("Bir importda ko‘pi bilan 1000 savol", 413);
  const output: Cell[][] = [];
  for (const row of sheetRows) {
    const rowNumber = Number(row["@_r"]);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > 1001)
      fail("XLSX qator raqami limitdan tashqarida");
    const cells: Cell[] = [];
    for (const cell of array<any>(row.c)) {
      const match = /^([A-Z]{1,2})\d+$/.exec(String(cell["@_r"]));
      if (!match) fail("XLSX ustun manzili noto‘g‘ri");
      let col = 0;
      for (const ch of match[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      if (col > 32) fail("Importda ortiqcha ustunlar bor");
      const type = cell["@_t"];
      const value =
        type === "s"
          ? shared[Number(cell.v)] || ""
          : type === "inlineStr"
            ? textOf(cell.is)
            : textOf(cell.v);
      cells[col - 1] = { value, formula: cell.f !== undefined };
    }
    output[rowNumber - 1] = cells;
  }
  return Array.from({ length: output.length }, (_, i) => output[i] || []);
}
export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [],
    value = "",
    quoted = false,
    afterQuote = false;
  const input = text.replace(/^\uFEFF/, "");
  const delimiter =
    input.split(/\r?\n/, 1)[0].includes(";") &&
    !input.split(/\r?\n/, 1)[0].includes(",")
      ? ";"
      : ",";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else value += ch;
    } else if (ch === '"') {
      if (value || afterQuote) fail("CSV qo‘shtirnoqlari noto‘g‘ri");
      quoted = true;
    } else if (ch === delimiter) {
      row.push({ value });
      value = "";
      afterQuote = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push({ value });
      rows.push(row);
      row = [];
      value = "";
      afterQuote = false;
    } else {
      if (afterQuote && !/\s/.test(ch))
        fail("CSV qo‘shtirnoqdan keyin ajratgich kerak");
      if (!afterQuote) value += ch;
    }
    if (value.length > 16000 || row.length > 32) fail("CSV maydoni juda uzun");
    if (rows.length > 1001) fail("Bir importda ko‘pi bilan 1000 savol", 413);
  }
  if (quoted) fail("CSV qo‘shtirnog‘i yopilmagan");
  if (value || row.length) {
    row.push({ value });
    rows.push(row);
  }
  return rows;
}
const escape = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function makeXlsx(data: (string | number)[][]) {
  const col = (n: number) => {
    let out = "";
    for (n++; n; n = Math.floor((n - 1) / 26))
      out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    return out;
  };
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => (typeof v === "number" ? `<c r="${col(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${col(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${escape(v)}</t></is></c>`)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const entries: Record<string, string> = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Savollar" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet,
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([k, v]) => [k, strToU8(v)]),
    ),
    { level: 6 },
  );
}
export const csvSafe = (v: unknown) => {
  const s = String(v ?? "");
  return /^[\s]*[=+@\-\t\r]/.test(s) ? "'" + s : s;
};
export const toCsv = (data: unknown[][]) =>
  "\uFEFF" +
  data
    .map((r) =>
      r.map((v) => '"' + csvSafe(v).replace(/"/g, '""') + '"').join(","),
    )
    .join("\r\n");
