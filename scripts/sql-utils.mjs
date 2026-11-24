import { execFileSync } from "node:child_process";
export function splitSql(sql) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `import json,sqlite3,sys
out=[]
current=''
for line in sys.stdin:
 current+=line
 if sqlite3.complete_statement(current):
  out.append(current)
  current=''
if current.strip(): raise ValueError('Incomplete SQL')
print(json.dumps(out))`,
      ],
      { input: sql, encoding: "utf8" },
    ),
  );
}
export async function applySql(db, sql) {
  for (const statement of splitSql(sql)) await db.prepare(statement).run();
}
