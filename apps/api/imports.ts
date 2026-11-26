import { Hono } from "hono";
import { z } from "zod";
import {
  questionSchema,
  levelNames,
  kindNames,
  type Question,
} from "../../packages/shared/schema";
import type { AppEnv, Bindings, Ctx, Row } from "./types";
import {
  body,
  digest,
  fail,
  first,
  id,
  json,
  now,
  paging,
  rate,
  rows,
  scoped,
  stmt,
} from "./core";
import { parseCsv, parseXlsx, type Cell } from "./spreadsheet";
export const headers = [
  "Savol matni",
  "Fan / kategoriya",
  "Mavzu",
  "Qiyinchilik darajasi",
  "Savol turi",
  ...Array.from("ABCDEFGH").map((c) => c + " varianti"),
  "To‘g‘ri javob",
  "Javob izohi",
  "Ball",
  "Dastur kodi",
];
const fields = [
  "title",
  "category",
  "topic",
  "level",
  "kind",
  ...Array.from("abcdefgh").map((c) => "option_" + c),
  "correct",
  "explanation",
  "points",
  "code",
];
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[’‘ʻʼ`]/g, "'");
export type PreviewRow = {
  row: number;
  status: "valid" | "invalid" | "duplicate";
  errors: { column: string; message: string }[];
  question?: Question;
  fingerprint?: string;
};
async function loadPreview(
  c: Ctx,
  job: Row,
): Promise<{ rows: PreviewRow[]; summary: { invalid: number } }> {
  if (!job.preview_key) return JSON.parse(job.preview_json);
  if (job.preview_key !== `tenants/${job.tenant_id}/imports/${job.id}.json`)
    fail("Import fayli ruxsat etilmagan", 403);
  const object = await c.env.FILES.get(job.preview_key);
  if (!object || object.customMetadata?.tenant_id !== job.tenant_id)
    fail("Import fayli muddati tugagan", 409);
  if (object.size > 20 * 1024 * 1024) fail("Import preview hajmi katta", 413);
  return object.json();
}
function chunks<T>(items: T[], maxBytes = 500000): T[][] {
  const result: T[][] = [];
  let group: T[] = [],
    size = 2;
  const encoder = new TextEncoder();
  for (const item of items) {
    const n = encoder.encode(json(item)).length + 1;
    if (size + n > maxBytes && group.length) {
      result.push(group);
      group = [];
      size = 2;
    }
    group.push(item);
    size += n;
  }
  if (group.length) result.push(group);
  return result;
}
export async function purgeTenantImportFiles(env: Bindings, tenantId: string) {
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({
      prefix: `tenants/${tenantId}/imports/`,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    if (page.objects.length)
      await env.FILES.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
export async function validateImport(cells: Cell[][]) {
  if (!cells.length) fail("Fayl bo‘sh");
  const mapping = cells[0].map((c) => {
    const h = norm(c?.value || "");
    const i = headers.findIndex((t) => norm(t) === h);
    return i >= 0 ? fields[i] : fields.includes(h) ? h : "";
  });
  if (new Set(mapping.filter(Boolean)).size !== mapping.filter(Boolean).length)
    fail("Ustun sarlavhasi takrorlangan");
  if (
    !mapping.includes("title") ||
    !mapping.includes("category") ||
    !mapping.includes("correct")
  )
    fail("Savol matni, Fan / kategoriya va To‘g‘ri javob ustunlari kerak");
  if (cells.length > 1001) fail("Bir importda ko‘pi bilan 1000 savol", 413);
  const seen = new Set<string>(),
    output: PreviewRow[] = [];
  for (let i = 1; i < cells.length; i++) {
    const r = cells[i];
    if (!r.some((c) => c?.value?.trim())) continue;
    const errors: PreviewRow["errors"] = [];
    const raw: Record<string, string> = {};
    mapping.forEach((f, j) => {
      const cell = r[j];
      if (cell?.formula || /^\s*[=+@]/.test(cell?.value || ""))
        errors.push({
          column: headers[fields.indexOf(f)] || String(j + 1),
          message: "Formula yoki bajariluvchi katak ruxsat etilmagan",
        });
      if (f) raw[f] = (cell?.value || "").trim();
    });
    const level =
      Object.keys(levelNames).find(
        (k) => norm(levelNames[k]) === norm(raw.level || ""),
      ) ||
      raw.level ||
      "medium";
    const kind =
      Object.keys(kindNames).find(
        (k) => norm(kindNames[k]) === norm(raw.kind || ""),
      ) ||
      raw.kind ||
      "single";
    const options = Array.from("abcdefgh")
      .filter((l) => raw["option_" + l])
      .map((l) => ({ id: l.toUpperCase(), text: raw["option_" + l] }));
    const input = {
      title: raw.title,
      category: raw.category,
      topic: raw.topic || "",
      level,
      kind,
      options,
      correct: (raw.correct || "")
        .split("|")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      explanation: raw.explanation || "",
      points: raw.points ? Number(raw.points.replace(",", ".")) : 1,
      code: raw.code || "",
    };
    const parsed = questionSchema.safeParse(input);
    if (!parsed.success)
      for (const e of parsed.error.issues) {
        const index = fields.indexOf(String(e.path[0]));
        errors.push({
          column:
            index >= 0
              ? headers[index]
              : e.path[0] === "options"
                ? "Variantlar"
                : "To‘g‘ri javob",
          message: e.message,
        });
      }
    if (errors.length || !parsed.success) {
      output.push({ row: i + 1, status: "invalid", errors });
      continue;
    }
    const fingerprint = await digest(json(parsed.data));
    const duplicate = seen.has(fingerprint);
    seen.add(fingerprint);
    output.push({
      row: i + 1,
      status: duplicate ? "duplicate" : "valid",
      errors: duplicate
        ? [{ column: "Savol matni", message: "Fayl ichida takrorlangan savol" }]
        : [],
      question: parsed.data,
      fingerprint,
    });
  }
  if (!output.length) fail("Import qilinadigan savollar yo‘q");
  return output;
}
export const imports = new Hono<AppEnv>();
imports.post("/preview", async (c) => {
  await rate(c, "import-preview", 10, 3600, c.get("principal").userId);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) fail("Faylni tanlang");
  if (file.size > 10 * 1024 * 1024) fail("Fayl 10 MB dan oshmasin", 413);
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext !== "csv" && ext !== "xlsx")
    fail("Faqat XLSX yoki CSV qabul qilinadi");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (
    (ext === "xlsx" && !isZip) ||
    (ext === "csv" && (isZip || bytes.includes(0)))
  )
    fail("Fayl tarkibi formatiga mos emas");
  let cells: Cell[][];
  if (ext === "xlsx") cells = parseXlsx(bytes);
  else {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
        bytes,
      );
    } catch {
      fail("CSV UTF-8 formatida bo‘lsin");
    }
    cells = parseCsv(text);
  }
  const preview = await validateImport(cells);
  const tid = c.get("principal").tenantId!;
  const existing = await rows(
    c.env.DB,
    "SELECT fingerprint FROM questions WHERE tenant_id=? AND fingerprint IN (SELECT value FROM json_each(?))",
    tid,
    json(preview.filter((x) => x.fingerprint).map((x) => x.fingerprint)),
  );
  const hashes = new Set(existing.map((x) => x.fingerprint));
  for (const r of preview)
    if (r.status === "valid" && hashes.has(r.fingerprint)) {
      r.status = "duplicate";
      r.errors = [
        { column: "Savol matni", message: "Bazangizda bu savol mavjud" },
      ];
    }
  const summary = {
    valid: preview.filter((x) => x.status === "valid").length,
    invalid: preview.filter((x) => x.status === "invalid").length,
    duplicate: preview.filter((x) => x.status === "duplicate").length,
  };
  const jobId = id();
  const previewKey = `tenants/${tid}/imports/${jobId}.json`;
  await c.env.FILES.put(previewKey, json({ rows: preview, summary }), {
    customMetadata: { tenant_id: tid },
    httpMetadata: { contentType: "application/json" },
  });
  try {
    await stmt(
      c.env.DB,
      "INSERT INTO import_jobs(id,tenant_id,uploaded_by,filename,status,preview_json,preview_key,file_hash,created_at,expires_at) VALUES(?,?,?,?,'preview',?,?,?,?,?)",
      jobId,
      tid,
      c.get("principal").userId,
      file.name.slice(0, 200),
      json({ summary }),
      previewKey,
      await digest(bytes),
      now(),
      now() + 3600,
    ).run();
  } catch (error) {
    await c.env.FILES.delete(previewKey);
    throw error;
  }
  return c.json({
    id: jobId,
    rows: preview,
    summary,
    expires_at: now() + 3600,
    policy: "fail-all yoki valid-only. Savollar private holatda saqlanadi.",
  });
});
imports.get("/", async (c) => {
  const { limit, offset } = paging(c);
  return c.json({
    items: await rows(
      c.env.DB,
      "SELECT id,filename,status,result_json,created_at,expires_at FROM import_jobs WHERE tenant_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      c.get("principal").tenantId,
      limit,
      offset,
    ),
  });
});
imports.get("/:id", async (c) => {
  const r = await scoped(c, "import_jobs", c.req.param("id"));
  return c.json({
    id: r.id,
    status: r.status,
    ...(await loadPreview(c, r)),
    result: r.result_json ? JSON.parse(r.result_json) : null,
  });
});
imports.post("/:id/commit", async (c) => {
  const d = await body(
    c,
    z.object({ policy: z.enum(["fail-all", "valid-only"]) }).strict(),
  );
  const job = await scoped(c, "import_jobs", c.req.param("id"));
  if (job.status === "committed") return c.json(JSON.parse(job.result_json));
  if (job.expires_at <= now())
    fail("Import ko‘rib chiqish muddati tugagan", 409);
  const preview = await loadPreview(c, job);
  if (d.policy === "fail-all" && preview.rows.some((r) => r.status !== "valid"))
    fail(
      "Noto‘g‘ri yoki takroriy qatorlar bor. Tuzating yoki faqat yaroqlilarni tanlang.",
      422,
    );
  const valid = preview.rows.filter((r) => r.status === "valid");
  if (!valid.length) fail("Yaroqli savol yo‘q", 422);
  const tid = c.get("principal").tenantId!,
    t = now();
  const quota = await first(
    c.env.DB,
    "SELECT (SELECT COUNT(*) FROM questions WHERE tenant_id=?) count,json_extract(quotas_json,'$.questions') quota FROM tenants WHERE id=?",
    tid,
    tid,
  );
  if (quota!.count + valid.length > quota!.quota)
    fail("Workspace savollar limiti yetarli emas", 429);
  const data = valid.map((r) => ({
    id: id(),
    version_id: id(),
    ...r.question!,
    fingerprint: r.fingerprint,
  }));
  const statements: D1PreparedStatement[] = [];
  for (const chunk of chunks(data))
    statements.push(
      stmt(
        c.env.DB,
        `INSERT INTO questions(id,tenant_id,title,category,topic,level,kind,content_json,fingerprint,created_at,updated_at)
  SELECT json_extract(value,'$.id'),?,json_extract(value,'$.title'),json_extract(value,'$.category'),json_extract(value,'$.topic'),json_extract(value,'$.level'),json_extract(value,'$.kind'),
  json_remove(value,'$.id','$.version_id','$.fingerprint'),json_extract(value,'$.fingerprint'),?,? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM import_jobs WHERE tenant_id=? AND id=? AND status='preview' AND expires_at>?)
  ON CONFLICT(tenant_id,fingerprint) DO NOTHING`,
        tid,
        t,
        t,
        json(chunk),
        tid,
        job.id,
        t,
      ),
      stmt(
        c.env.DB,
        `INSERT INTO question_versions SELECT json_extract(j.value,'$.version_id'),q.tenant_id,q.id,1,q.content_json,? FROM json_each(?) j JOIN questions q ON q.id=json_extract(j.value,'$.id') AND q.tenant_id=?`,
        t,
        json(chunk),
        tid,
      ),
    );
  statements.push(
    stmt(
      c.env.DB,
      `UPDATE import_jobs SET status='committed',result_json=json_object('inserted',(SELECT COUNT(*) FROM questions WHERE tenant_id=? AND id IN (SELECT value FROM json_each(?)))) WHERE tenant_id=? AND id=? AND status='preview' AND expires_at>?`,
      tid,
      json(data.map((r) => r.id)),
      tid,
      job.id,
      t,
    ),
  );
  await c.env.DB.batch(statements);
  const result = await first(
    c.env.DB,
    "SELECT status,result_json FROM import_jobs WHERE tenant_id=? AND id=?",
    tid,
    job.id,
  );
  if (result?.status !== "committed") fail("Import muddati tugadi", 409);
  if (c.get("principal").scope === "teacher") {
    try {
      const tRow = await first(c.env.DB, "SELECT name FROM tenants WHERE id=?", tid);
      const attr = String(tRow?.name || "");
      for (const chunk of chunks(data)) {
        await stmt(
          c.env.DB,
          `INSERT OR IGNORE INTO store_submissions(id,tenant_id,question_id,source_version,content_json,fingerprint,consent_at,license,attribution)
           SELECT lower(hex(randomblob(12))), q.tenant_id, q.id, q.content_version, q.content_json, q.fingerprint, ?, 'CC-BY-4.0', ?
           FROM questions q
           WHERE q.tenant_id=? AND q.id IN (SELECT json_extract(value,'$.id') FROM json_each(?))`,
          t,
          attr,
          tid,
          json(chunk),
        ).run();
      }
    } catch {}
  }
  return c.json(JSON.parse(result.result_json));
});
