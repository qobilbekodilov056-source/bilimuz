const origin = process.env.APP_ORIGIN;
if (!origin || !origin.startsWith("https://"))
  throw Error("APP_ORIGIN HTTPS required");
const results = [];
for (const path of [
  "/api/health",
  "/api/v2/config",
  "/",
  "/api/v2/templates/questions.xlsx",
  "/api/v2/store",
]) {
  const r = await fetch(new URL(path, origin));
  results.push({ path, status: r.status });
  if (r.status !== 200) throw Error(`${path}: ${r.status}`);
  if (!r.headers.get("x-content-type-options"))
    throw Error("Security header missing");
}
for (const path of ["/api/v2/teacher/questions", "/api/v2/owner/overview"]) {
  const r = await fetch(new URL(path, origin));
  if (r.status !== 401) throw Error("Anonymous access was not denied: " + path);
  results.push({ path, status: r.status });
}
console.log(
  JSON.stringify({ origin, at: new Date().toISOString(), results }, null, 2),
);
