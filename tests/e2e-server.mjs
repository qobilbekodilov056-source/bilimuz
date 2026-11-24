import { harness, createQuestion, createCard } from "./harness.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const port = Number(process.env.E2E_PORT || 8789);
const origin = `http://127.0.0.1:${port}`;
const h = await harness({ port, origin });
const a = await h.seedTeacher("SAVIOR Teacher"),
  b = await h.seedTeacher("Second Teacher"),
  owner = await h.seedTeacher("SysOne Owner", "platform_owner");
const ids = [];
for (let i = 0; i < 20; i++) ids.push(await createQuestion(h, a, 20000 + i));
const card = await createCard(h, a, ids.slice(0, 3), {
  show_answers: true,
  show_leaderboard: true,
});
await mkdir("tmp", { recursive: true });
await writeFile("tmp/e2e.json", JSON.stringify({ a, b, owner, card, origin }), {
  mode: 0o600,
});
console.log("TestLab E2E test server ready at " + origin);
process.on("SIGTERM", async () => {
  await h.close();
  process.exit(0);
});
process.on("SIGINT", async () => {
  await h.close();
  process.exit(0);
});
await new Promise(() => {});
