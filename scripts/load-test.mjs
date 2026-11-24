import { writeFile } from "node:fs/promises";
import {
  harness,
  createQuestion,
  createCard,
  randomToken,
} from "../tests/harness.mjs";
const h = await harness();
const timings = [],
  failures = [];
let lost = 0,
  duplicate = 0,
  leaks = 0;
async function measured(path, options) {
  const start = performance.now();
  const r = await h.request(path, options);
  timings.push({
    path: path.replace(/[0-9a-f-]{36}/g, ":id"),
    ms: performance.now() - start,
    status: r.status,
  });
  return r;
}
try {
  const a = await h.seedTeacher("Load Teacher A"),
    b = await h.seedTeacher("Load Teacher B");
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push(await createQuestion(h, a, i + 10000));
  const card = await createCard(h, a, ids, {
    show_leaderboard: true,
    show_answers: false,
    duration_minutes: 10,
  });
  // Barrier starts all 100 students concurrently against one real D1 database.
  const sessions = await Promise.all(
    Array.from({ length: 100 }, async (_, i) => {
      const key = randomToken();
      const r = await measured(
        "/api/v2/public/cards/" + card.slug + "/attempts",
        {
          method: "POST",
          data: { name: "Load Student " + i, resume_key: key },
        },
      );
      if (r.status !== 201) {
        failures.push({ phase: "start", i, status: r.status });
        return null;
      }
      return { key, id: r.data.attempt_id };
    }),
  );
  for (const session of sessions)
    if (!session) throw Error("A student could not start");
  const answerBatch = Array.from({ length: 20 }, (_, i) => ({
    position: i + 1,
    selected: ["A"],
    revision: 1,
    active_time_ms: 0,
  }));
  await Promise.all(
    sessions.map(async (s) => {
      const uri = "/api/v2/public/attempts/" + s.id;
      const saved = await measured(uri + "/answers", {
        method: "PUT",
        attempt: s.key,
        data: { answers: answerBatch },
      });
      if (saved.status !== 200)
        failures.push({ phase: "save", status: saved.status });
      const restored = await measured(uri, { attempt: s.key });
      if (
        restored.status !== 200 ||
        restored.data.questions.filter((q) => q.answer[0] === "A").length !== 20
      )
        lost++;
      const finished = await Promise.all([
        measured(uri + "/finish", { method: "POST", attempt: s.key, data: {} }),
        measured(uri + "/finish", { method: "POST", attempt: s.key, data: {} }),
      ]);
      if (finished.some((x) => x.status !== 200))
        failures.push({ phase: "finish" });
      const r = await measured(uri + "/result", { attempt: s.key });
      if (
        r.status !== 200 ||
        r.data.result.percentage !== 100 ||
        r.data.result.correct_count !== 20
      )
        lost++;
      const blocked = await measured("/api/v2/teacher/attempts/" + s.id, b);
      if (blocked.status !== 404) leaks++;
    }),
  );
  const counted = await h.db
    .prepare("SELECT COUNT(*) n FROM attempts WHERE tenant_id=? AND card_id=?")
    .bind(a.tid, card.id)
    .first();
  duplicate = Math.max(0, counted.n - 100);
  const ordered = timings.map((r) => r.ms).sort((a, b) => a - b);
  const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1];
  const report = {
    environment:
      "local workerd + SQLite-backed D1 + R2 emulation; external auth mocked; cloud CPU/network NOT measured",
    at: new Date().toISOString(),
    scenario:
      "100 concurrent students x 20 questions; batch autosave + refresh + concurrent duplicate finish + IDOR",
    concurrent_students: 100,
    questions_each: 20,
    requests: timings.length,
    p50_ms: +ordered[Math.floor(ordered.length * 0.5)].toFixed(2),
    p95_ms: +p95.toFixed(2),
    max_ms: +ordered.at(-1).toFixed(2),
    errors: failures,
    error_rate: failures.length / timings.length,
    lost_answers: lost,
    duplicate_results: duplicate,
    cross_tenant_leaks: leaks,
    target_p95_ms: 800,
    passed: !failures.length && !lost && !duplicate && !leaks && p95 < 800,
  };
  await writeFile("reports/load.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await h.close();
}
