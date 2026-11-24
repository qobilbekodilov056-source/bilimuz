import { questionSchema, type Question } from "../../packages/shared/schema";
import type { Ctx, Row } from "./types";
import { digest, fail, first, id, json, now, stmt } from "./core";
export const questionView = (r: Row) => ({
  ...JSON.parse(r.content_json),
  id: r.id,
  content_version: r.content_version,
  archived: !!r.archived,
  provenance: JSON.parse(r.provenance_json || "{}"),
});
export async function questionRecord(q: Question) {
  const content = questionSchema.parse(q);
  return { content, fingerprint: await digest(json(content)) };
}
export async function insertQuestion(
  c: Ctx,
  q: Question,
  provenance: Record<string, unknown> = {},
) {
  const { content, fingerprint } = await questionRecord(q);
  const qid = id(),
    tid = c.get("principal").tenantId!;
  const t = now();
  const limit = await first(
    c.env.DB,
    "SELECT (SELECT COUNT(*) FROM questions WHERE tenant_id=?) n,json_extract(quotas_json,'$.questions') quota FROM tenants WHERE id=?",
    tid,
    tid,
  );
  if (limit!.n >= limit!.quota) fail("Workspace savollar limiti tugagan", 429);
  await c.env.DB.batch([
    stmt(
      c.env.DB,
      "INSERT INTO questions(id,tenant_id,title,category,topic,level,kind,content_json,fingerprint,provenance_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      qid,
      tid,
      content.title,
      content.category,
      content.topic,
      content.level,
      content.kind,
      json(content),
      fingerprint,
      json(provenance),
      t,
      t,
    ),
    stmt(
      c.env.DB,
      "INSERT INTO question_versions VALUES(?,?,?,?,?,?)",
      id(),
      tid,
      qid,
      1,
      json(content),
      t,
    ),
  ]);
  return qid;
}
