import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDecipheriv, createCipheriv, randomBytes } from "node:crypto";
import {
  harness,
  createQuestion,
  createCard,
  randomToken,
  sample,
  tick,
  hash,
} from "./harness.mjs";
import { makeXlsx } from "../apps/api/spreadsheet.ts";
import { headers } from "../apps/api/imports.ts";
import { totp } from "../apps/api/auth.ts";
let h,
  a,
  b,
  owner,
  sequence = 0;
const q = () => ++sequence;
const request = (u, path, options = {}) =>
  h.request("/api/v2/" + path, { ...u, ...options });
const start = (card, name = "Ali Valiyev", more = {}) =>
  request({}, "public/cards/" + card.slug + "/attempts", {
    method: "POST",
    data: { name, resume_key: randomToken(), ...more },
  });
const cookieFrom = (r) =>
  ["testlab_session", "testlab_csrf"]
    .map((name) => {
      const match = new RegExp(name + "=([^;, ]+)").exec(
        r.headers.get("set-cookie") || "",
      );
      return match ? name + "=" + match[1] : "";
    })
    .filter(Boolean)
    .join("; ");
beforeAll(async () => {
  h = await harness();
  a = await h.seedTeacher("Teacher A");
  b = await h.seedTeacher("Teacher B");
  owner = await h.seedTeacher("SysOne Owner", "platform_owner");
});
afterAll(async () => {
  if (h) await h.close();
});
beforeEach(async () => {
  await h.db.exec("DELETE FROM rate_limits;");
});
describe("real Worker + D1 authentication", () => {
  it("registers two public teachers and provisions private workspaces; verification is required", async () => {
    for (const email of ["signup-a@example.test", "signup-b@example.test"]) {
      const r = await request({}, "auth/register", {
        method: "POST",
        data: {
          email,
          password: "Long-password-123!",
          display_name: email,
          consent: true,
          turnstile_token: "test:register",
        },
      });
      expect(r.status, r.text).toBe(202);
      const u = await h.db
        .prepare("SELECT * FROM users WHERE email=?")
        .bind(email)
        .first();
      expect(u.role).toBe("teacher");
      const tenant = await h.db
        .prepare("SELECT id FROM tenants WHERE owner_user_id=?")
        .bind(u.id)
        .first();
      expect(tenant.id).toBeTruthy();
      const noVerify = await request({}, "auth/login", {
        method: "POST",
        data: {
          email,
          password: "Long-password-123!",
          turnstile_token: "test:login",
        },
      });
      expect(noVerify.status).toBe(403);
    }
    const link = /https:\/\/\S+/.exec(h.mails[0].text)[0];
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
    expect(
      (await request({}, "auth/verify", { method: "POST", data: { token } }))
        .status,
    ).toBe(200);
    expect(
      (await request({}, "auth/verify", { method: "POST", data: { token } }))
        .status,
    ).toBe(400);
    const r = await request({}, "auth/login", {
      method: "POST",
      data: {
        email: "signup-a@example.test",
        password: "Long-password-123!",
        turnstile_token: "test:login",
      },
    });
    expect(r.status, r.text).toBe(200);
    expect(r.headers.get("set-cookie")).toContain("HttpOnly");
    const me = await request({ cookie: cookieFrom(r) }, "auth/me");
    expect(me.data.tenant.id).toBeTruthy();
    expect(me.data.user.scope).toBe("teacher");
  });
  it("blocks registration mass assignment, missing consent, fake Turnstile and cross-origin login", async () => {
    const form = {
      email: "attack@example.test",
      password: "Long-password-123!",
      display_name: "Attack Teacher",
      consent: true,
      turnstile_token: "test:register",
    };
    expect(
      (
        await request({}, "auth/register", {
          method: "POST",
          data: { ...form, role: "platform_owner" },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request({}, "auth/register", {
          method: "POST",
          data: { ...form, consent: false },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request({}, "auth/register", {
          method: "POST",
          data: { ...form, turnstile_token: "evil" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request({}, "auth/login", {
          method: "POST",
          data: {},
          headers: { Origin: "https://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request({}, "auth/login", {
          method: "POST",
          data: {},
          headers: { "X-Requested-With": "" },
        })
      ).status,
    ).toBe(403);
  });
  it("CSRF token is tied to the server session", async () => {
    const r = await request({ ...a, csrf: b.csrf }, "teacher/groups", {
      method: "POST",
      data: { name: "CSRF attempt" },
    });
    expect(r.status).toBe(403);
    expect((await request({}, "teacher/questions")).status).toBe(401);
  });
  it("revokes sessions on logout and password reset", async () => {
    const u = await h.seedTeacher("Reset User");
    const forgotten = await request({}, "auth/forgot", {
      method: "POST",
      data: { email: u.email, turnstile_token: "test:forgot" },
    });
    expect(forgotten.status).toBe(202);
    const link = /https:\/\/\S+/.exec(h.mails.at(-1).text)[0];
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get("token");
    expect(
      (
        await request({}, "auth/reset", {
          method: "POST",
          data: { token, password: "Another-strong-password-123" },
        })
      ).status,
    ).toBe(200);
    expect((await request(u, "auth/me")).status).toBe(401);
    expect(
      (
        await request({}, "auth/reset", {
          method: "POST",
          data: { token, password: "Another-strong-password-123" },
        })
      ).status,
    ).toBe(400);
    const u2 = await h.seedTeacher("Logout User");
    expect(
      (await request(u2, "auth/logout", { method: "POST", data: {} })).status,
    ).toBe(200);
    expect((await request(u2, "auth/me")).status).toBe(401);
  });
  it("throttles repeated failed logins", async () => {
    let r;
    for (let n = 0; n < 11; n++)
      r = await request({}, "auth/login", {
        method: "POST",
        data: {
          email: "missing@example.test",
          password: "wrong",
          turnstile_token: "test:login",
        },
      });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
  it("Telegram code flow uses state, browser binding, PKCE, nonce, verified phone consent and stable subject", async () => {
    const s = await request({}, "auth/telegram/start", {
      method: "POST",
      data: {
        consent: true,
        phone_consent: true,
        turnstile_token: "test:telegram",
      },
    });
    expect(s.status, s.text).toBe(200);
    const url = new URL(s.data.url);
    expect(url.searchParams.get("scope")).toBe("openid profile phone");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    h.telegram.nonce = url.searchParams.get("nonce");
    const cookie = /testlab_oidc=([^;]+)/.exec(s.headers.get("set-cookie"))[0];
    expect(
      (
        await request(
          {},
          "auth/telegram/callback?state=" +
            url.searchParams.get("state") +
            "&code=code",
          { cookie: "testlab_oidc=wrong" },
        )
      ).status,
    ).toBe(401);
    const login = await request(
      {},
      "auth/telegram/callback?state=" +
        url.searchParams.get("state") +
        "&code=code",
      { cookie },
    );
    expect(login.status, login.text).toBe(302);
    const u = await h.db
      .prepare("SELECT * FROM users WHERE telegram_sub=?")
      .bind(h.telegram.sub)
      .first();
    expect(u.phone_verified).toBe(1);
    expect(u.phone_e164).toBe("+998901234567");
    expect(
      (
        await request(
          {},
          "auth/telegram/callback?state=" +
            url.searchParams.get("state") +
            "&code=code",
          { cookie },
        )
      ).status,
    ).toBe(401);
    h.telegram.phone = false;
    h.telegram.sub = "telegram-no-phone";
    const denied = await request({}, "auth/telegram/start", {
      method: "POST",
      data: {
        consent: true,
        phone_consent: false,
        turnstile_token: "test:telegram",
      },
    });
    const u2 = new URL(denied.data.url);
    expect(u2.searchParams.get("scope")).toBe("openid profile");
    h.telegram.nonce = u2.searchParams.get("nonce");
    const c2 = /testlab_oidc=([^;]+)/.exec(denied.headers.get("set-cookie"))[0];
    expect(
      (
        await request(
          {},
          "auth/telegram/callback?state=" +
            u2.searchParams.get("state") +
            "&code=code",
          { cookie: c2 },
        )
      ).status,
    ).toBe(302);
    expect(
      (
        await h.db
          .prepare("SELECT phone_verified FROM users WHERE telegram_sub=?")
          .bind(h.telegram.sub)
          .first()
      ).phone_verified,
    ).toBe(0);
  });
  it("Teacher cannot log in to Owner OS or grant owner membership", async () => {
    const r = await request({}, "auth/owner-login", {
      method: "POST",
      data: {
        email: a.email,
        password: "Correct horse battery staple",
        otp: "123456",
        turnstile_token: "test:owner",
      },
    });
    expect(r.status).toBe(401);
    expect((await request(a, "owner/overview")).status).toBe(403);
    expect((await request(owner, "teacher/questions")).status).toBe(403);
    expect(
      (
        await request(a, "teacher/settings", {
          method: "PUT",
          data: {
            display_name: "Teacher",
            workspace_name: "Workspace",
            role: "platform_owner",
          },
        })
      ).status,
    ).toBe(422);
  });
  it("requires valid Owner TOTP and rejects replayed MFA time steps", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", Buffer.alloc(32, 1), iv);
    const encrypted = Buffer.concat([
      cipher.update(secret),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    await h.db
      .prepare("UPDATE users SET mfa_secret=?,mfa_last_step=-1 WHERE id=?")
      .bind(
        iv.toString("base64") + "." + encrypted.toString("base64"),
        owner.uid,
      )
      .run();
    const otp = await totp(secret, Math.floor(tick() / 30));
    const data = {
      email: owner.email,
      password: "Correct horse battery staple",
      otp,
      turnstile_token: "test:owner",
    };
    const login = await request({}, "auth/owner-login", {
      method: "POST",
      data,
    });
    expect(login.status, login.text).toBe(200);
    expect(
      (await request({ cookie: cookieFrom(login) }, "owner/overview")).status,
    ).toBe(200);
    expect(
      (await request({}, "auth/owner-login", { method: "POST", data })).status,
    ).toBe(401);
  });
  it("rejects Telegram callback with a forged signature, wrong audience or wrong nonce", async () => {
    for (const broken of ["signature", "audience", "nonce"]) {
      const s = await request({}, "auth/telegram/start", {
        method: "POST",
        data: {
          consent: true,
          phone_consent: false,
          turnstile_token: "test:telegram",
        },
      });
      const url = new URL(s.data.url);
      h.telegram.nonce =
        broken === "nonce" ? "wrong-nonce" : url.searchParams.get("nonce");
      h.telegram.badSignature = broken === "signature";
      h.telegram.aud = broken === "audience" ? "wrong-client" : "123456789";
      const cookie = /testlab_oidc=([^;]+)/.exec(
        s.headers.get("set-cookie"),
      )[0];
      const r = await request(
        {},
        "auth/telegram/callback?state=" +
          url.searchParams.get("state") +
          "&code=code",
        { cookie },
      );
      expect(r.status, broken + " " + r.text).toBe(401);
    }
    h.telegram.badSignature = false;
    h.telegram.aud = "123456789";
  });
});
describe("multi-tenant resource and database boundaries", () => {
  it("enforces composite foreign keys even if the application filter is bypassed", async () => {
    const g = (
      await request(a, "teacher/groups", {
        method: "POST",
        data: { name: "Composite group" },
      })
    ).data.id;
    await expect(
      h.db
        .prepare(
          "INSERT INTO students(id,tenant_id,group_id,student_code,name,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(crypto.randomUUID(), b.tid, g, "CMP", "Other tenant", tick())
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
  it("allows same group and student codes in different tenants", async () => {
    for (const u of [a, b]) {
      expect(
        (
          await request(u, "teacher/groups", {
            method: "POST",
            data: { name: "Same group" },
          })
        ).status,
      ).toBe(201);
      expect(
        (
          await request(u, "teacher/students", {
            method: "POST",
            data: { name: "Ali Valiyev", student_code: "SAME-001" },
          })
        ).status,
      ).toBe(201);
    }
  });
  it("prevents IDOR for question/group/student/card/analytics/export/mutation resources", async () => {
    const qid = await createQuestion(h, a, q());
    const gid = (
      await request(a, "teacher/groups", {
        method: "POST",
        data: { name: "A private group" },
      })
    ).data.id;
    const sid = (
      await request(a, "teacher/students", {
        method: "POST",
        data: {
          name: "Private Student A",
          student_code: "PRIVATE",
          group_id: gid,
        },
      })
    ).data.id;
    const card = await createCard(h, a, [qid]);
    const attempt = await start(card);
    expect(attempt.status).toBe(201);
    for (const [path, method, data] of [
      [`questions/${qid}`, "GET"],
      [`questions/${qid}`, "PUT", sample(q())],
      [`questions/${qid}`, "DELETE"],
      [
        `questions/${qid}/submit-store`,
        "POST",
        { consent: true, original: true, license: "CC-BY-4.0" },
      ],
      [`groups/${gid}`, "GET"],
      [`groups/${gid}`, "PUT", { name: "Intrusion" }],
      [`groups/${gid}`, "DELETE"],
      [`students/${sid}`, "GET"],
      [
        `students/${sid}`,
        "PUT",
        { name: "Intrusion", student_code: "PRIVATE" },
      ],
      [`students/${sid}`, "DELETE"],
      [`cards/${card.id}`, "GET"],
      [`cards/${card.id}`, "PUT", { title: "Intrusion" }],
      [`cards/${card.id}/status`, "POST", { status: "active" }],
      [`cards/${card.id}/duplicate`, "POST", {}],
      [`cards/${card.id}/analytics`, "GET"],
      [`cards/${card.id}/export`, "GET"],
      [`cards/${card.id}/export?format=xlsx`, "GET"],
      [`attempts/${attempt.data.attempt_id}`, "GET"],
    ]) {
      const r = await request(b, "teacher/" + path, { method, data });
      expect(r.status, path + " " + r.text).toBe(404);
    }
    expect(
      (
        await request(b, "teacher/students", {
          method: "POST",
          data: { name: "Intrusion", student_code: "ATTACK", group_id: gid },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(b, "teacher/cards", {
          method: "POST",
          data: {
            title: "Intrusion",
            mode: "manual",
            selected_ids: [qid],
            question_count: 1,
          },
        })
      ).status,
    ).toBe(404);
    const search = await request(
      b,
      "teacher/questions?q=" + encodeURIComponent(sample(sequence).title),
    );
    expect(search.text).not.toContain(qid);
    const overview = await request(b, "teacher/overview");
    expect(overview.text).not.toContain("Private Student A");
    const exported = await request(b, "teacher/account/export");
    expect(exported.text).not.toContain("Private Student A");
  });
  it("resists SQL injection, active HTML and forged tenant IDs", async () => {
    const s = sample(q(), { title: "<img src=x onerror=alert(1)> question?" });
    const qid = await createQuestion(h, a, q(), s);
    const r = await request(
      b,
      "teacher/questions?q=" + encodeURIComponent("' OR 1=1 --"),
    );
    expect(r.status).toBe(200);
    expect(r.text).not.toContain(qid);
    expect(
      (
        await request(a, "teacher/questions", {
          method: "POST",
          data: { ...s, tenant_id: b.tid },
        })
      ).status,
    ).toBe(422);
  });
});
describe("Uzbek XLSX/CSV preview and atomic idempotent import", () => {
  it("imports exactly 100 Uzbek XLSX rows into A only and commit is idempotent", async () => {
    const data = [
      headers,
      ...Array.from({ length: 100 }, (_, i) => [
        `Import savoli ${i} ${q()}`,
        "Import fan",
        "",
        "O‘rtacha",
        "Bir nechta javob",
        "A",
        "B",
        "C",
        "",
        "",
        "",
        "",
        "",
        "A|C",
        "Izoh",
        2,
        "",
      ]),
    ];
    const form = new FormData();
    form.append("file", new File([makeXlsx(data)], "savollar.xlsx"));
    const before = await h.db
      .prepare("SELECT COUNT(*) n FROM questions WHERE tenant_id=?")
      .bind(a.tid)
      .first();
    const r = await request(a, "teacher/imports/preview", {
      method: "POST",
      form,
    });
    expect(r.status, r.text).toBe(200);
    expect(r.data.summary).toEqual({ valid: 100, invalid: 0, duplicate: 0 });
    expect(
      (
        await h.db
          .prepare("SELECT COUNT(*) n FROM questions WHERE tenant_id=?")
          .bind(a.tid)
          .first()
      ).n,
    ).toBe(before.n);
    expect((await request(b, "teacher/imports/" + r.data.id)).status).toBe(404);
    expect(
      (
        await request(b, "teacher/imports/" + r.data.id + "/commit", {
          method: "POST",
          data: { policy: "fail-all" },
        })
      ).status,
    ).toBe(404);
    const results = await Promise.all([
      request(a, "teacher/imports/" + r.data.id + "/commit", {
        method: "POST",
        data: { policy: "fail-all" },
      }),
      request(a, "teacher/imports/" + r.data.id + "/commit", {
        method: "POST",
        data: { policy: "fail-all" },
      }),
    ]);
    for (const result of results) {
      expect(result.status, result.text).toBe(200);
      expect(result.data.inserted).toBe(100);
    }
    expect(
      (
        await h.db
          .prepare("SELECT COUNT(*) n FROM questions WHERE tenant_id=?")
          .bind(a.tid)
          .first()
      ).n,
    ).toBe(before.n + 100);
    expect(
      (await request(b, "teacher/questions?category=Import%20fan")).data.total,
    ).toBe(0);
  });
  it("keeps previews larger than D1's 2 MB row limit in private R2 and commits bounded SQL batches", async () => {
    const text = "Izoh ".repeat(998);
    const lines = [
      "Savol matni,Fan / kategoriya,A varianti,B varianti,To‘g‘ri javob,Javob izohi",
    ];
    for (let i = 0; i < 450; i++)
      lines.push(`Katta import savoli ${i}?,Large Import,Ha,Yo‘q,A,${text}`);
    const form = new FormData();
    form.append("file", new File([lines.join("\n")], "large.csv"));
    const r = await request(a, "teacher/imports/preview", {
      method: "POST",
      form,
    });
    expect(r.status, r.text).toBe(200);
    expect(r.data.summary.valid).toBe(450);
    const job = await h.db
      .prepare("SELECT preview_json,preview_key FROM import_jobs WHERE id=?")
      .bind(r.data.id)
      .first();
    expect(job.preview_json.length).toBeLessThan(500);
    expect(job.preview_key).toContain(a.tid);
    const stored = await (await h.mf.getR2Bucket("FILES")).get(job.preview_key);
    expect(stored.size).toBeGreaterThan(2000000);
    const commit = await request(
      a,
      "teacher/imports/" + r.data.id + "/commit",
      { method: "POST", data: { policy: "fail-all" } },
    );
    expect(commit.status, commit.text).toBe(200);
    expect(commit.data.inserted).toBe(450);
    expect((await request(b, "teacher/imports/" + r.data.id)).status).toBe(404);
    await h.db
      .prepare("DELETE FROM questions WHERE tenant_id=? AND category=?")
      .bind(a.tid, "Large Import")
      .run();
  });
  it("reports invalid/formula/duplicate rows; fail-all changes nothing; valid-only commits valid rows", async () => {
    const form = new FormData();
    const title = "Legacy " + q();
    form.append(
      "file",
      new File(
        [
          `\ufefftitle,category,level,kind,option_a,option_b,correct\n${title},Legacy,easy,single,Ha,Yo‘q,A\n${title},Legacy,easy,single,Ha,Yo‘q,A\n=EVIL(),Legacy,easy,single,Ha,Yo‘q,Z\n`,
        ],
        "questions.csv",
      ),
    );
    const r = await request(a, "teacher/imports/preview", {
      method: "POST",
      form,
    });
    expect(r.status, r.text).toBe(200);
    expect(r.data.summary).toEqual({ valid: 1, invalid: 1, duplicate: 1 });
    expect(
      (
        await request(a, "teacher/imports/" + r.data.id + "/commit", {
          method: "POST",
          data: { policy: "fail-all" },
        })
      ).status,
    ).toBe(422);
    const committed = await request(
      a,
      "teacher/imports/" + r.data.id + "/commit",
      { method: "POST", data: { policy: "valid-only" } },
    );
    expect(committed.status, committed.text).toBe(200);
    expect(committed.data.inserted).toBe(1);
  });
  it("rejects disguised file types and oversize requests; real templates are downloadable", async () => {
    const form = new FormData();
    form.append("file", new File(["not a zip"], "fake.xlsx"));
    expect(
      (await request(a, "teacher/imports/preview", { method: "POST", form }))
        .status,
    ).toBe(400);
    const x = await request({}, "templates/questions.xlsx");
    expect(x.status).toBe(200);
    expect(x.headers.get("content-disposition")).toContain("Shablon");
    expect((await request({}, "templates/not-a-template")).status).toBe(404);
    expect(
      (
        await request({}, "auth/login", {
          method: "POST",
          data: { padding: "x".repeat(600 * 1024) },
        })
      ).status,
    ).toBe(413);
  });
});
describe("server-authoritative examination, immutable versions and privacy", () => {
  it("preserves the legacy automatic difficulty mix with per-student random selection", async () => {
    for (const [level, count] of [
      ["easy", 3],
      ["medium", 5],
      ["hard", 2],
    ])
      for (let i = 0; i < count; i++)
        await createQuestion(h, a, q(), { category: "Auto mix", level });
    const card = await createCard(h, a, [], {
      mode: "auto",
      category: "Auto mix",
      question_count: 10,
      mix: { easy: 30, medium: 50, hard: 20, expert: 0 },
    });
    const key = randomToken(),
      s = await start(card, "Auto Mix Student", { resume_key: key });
    expect(s.status, s.text).toBe(201);
    const view = await request(
      { attempt: key },
      "public/attempts/" + s.data.attempt_id,
    );
    const count = {};
    for (const question of view.data.questions)
      count[question.level] = (count[question.level] || 0) + 1;
    expect(count).toEqual({ easy: 3, medium: 5, hard: 2 });
  });
  it("grades multiple-choice exact matches with weighted points and no partial credit", async () => {
    const first = await createQuestion(h, a, q(), {
      kind: "multiple",
      points: 2,
      options: [
        { id: "A", text: "Bir" },
        { id: "B", text: "Ikki" },
        { id: "C", text: "Uch" },
      ],
      correct: ["A", "C"],
    });
    const second = await createQuestion(h, a, q(), { points: 3 });
    const card = await createCard(h, a, [first, second], {
      show_answers: true,
    });
    const key = randomToken(),
      s = await start(card, "Weighted Student", { resume_key: key }),
      uri = "public/attempts/" + s.data.attempt_id;
    await request({ attempt: key }, uri + "/answers", {
      method: "PUT",
      data: {
        answers: [
          { position: 1, selected: ["A"], revision: 1 },
          { position: 2, selected: ["A"], revision: 1 },
        ],
      },
    });
    await request({ attempt: key }, uri + "/finish", {
      method: "POST",
      data: {},
    });
    const result = await request({ attempt: key }, uri + "/result");
    expect(result.data.result.score).toBe(3);
    expect(result.data.result.max_score).toBe(5);
    expect(result.data.result.percentage).toBe(60);
    expect(result.data.result.incorrect_count).toBe(1);
  });
  it("preserves autosave on resume and grades only saved answers; concurrent finalization produces one result", async () => {
    const ids = [
        await createQuestion(h, a, q()),
        await createQuestion(h, a, q()),
      ],
      card = await createCard(h, a, ids, {
        show_answers: true,
        show_leaderboard: true,
      });
    const key = randomToken();
    const s = await start(card, "Ali Valiyev", { resume_key: key });
    expect(s.status, s.text).toBe(201);
    const aid = s.data.attempt_id;
    const uri = "public/attempts/" + aid;
    const auth = { attempt: key };
    const view = await request(auth, uri);
    expect(view.status).toBe(200);
    expect(view.text).not.toContain('"correct"');
    expect(view.text).not.toContain('"explanation"');
    expect((await request({}, uri)).status).toBe(401);
    expect((await request({ attempt: randomToken() }, uri)).status).toBe(401);
    const answer = await request(auth, uri + "/answers", {
      method: "PUT",
      data: {
        answers: [
          { position: 1, selected: ["A"], revision: 2, active_time_ms: 0 },
          { position: 2, selected: ["B"], revision: 1, active_time_ms: 0 },
        ],
      },
    });
    expect(answer.status, answer.text).toBe(200);
    expect(
      (
        await request(auth, uri + "/answers", {
          method: "PUT",
          data: {
            answers: [
              { position: 1, selected: ["B"], revision: 1, active_time_ms: 0 },
            ],
          },
        })
      ).status,
    ).toBe(200);
    const restored = await request(auth, uri);
    expect(restored.data.questions[0].answer).toEqual(["A"]);
    expect(restored.data.attempt.expires_at).toBe(s.data.expires_at);
    const replay = await start(card, "Ali Valiyev", { resume_key: key });
    expect(replay.data.attempt_id).toBe(aid);
    const finished = await Promise.all([
      request(auth, uri + "/finish", { method: "POST", data: {} }),
      request(auth, uri + "/finish", { method: "POST", data: {} }),
    ]);
    expect(finished.map((x) => x.status)).toEqual([200, 200]);
    const r = await request(auth, uri + "/result");
    expect(r.status, r.text).toBe(200);
    expect(r.data.result.percentage).toBe(50);
    expect(r.data.result.correct_count).toBe(1);
    expect(r.data.result.questions[0].correct).toEqual(["A"]);
    expect(
      (
        await request(auth, uri + "/answers", {
          method: "PUT",
          data: { answers: [{ position: 1, selected: ["B"], revision: 3 }] },
        })
      ).status,
    ).toBe(409);
    const leaderboard = await request(
      {},
      "public/cards/" + card.slug + "/leaderboard",
    );
    expect(leaderboard.data.items[0].name).toBe("Ali V.");
    expect(leaderboard.text).not.toContain("Valiyev");
  });
  it("pins the published question version when teacher edits the original", async () => {
    const qid = await createQuestion(h, a, q());
    const card = await createCard(h, a, [qid], { show_answers: true });
    const original = await request(a, "teacher/questions/" + qid);
    const modified = sample(q(), { correct: ["B"] });
    const r = await request(a, "teacher/questions/" + qid, {
      method: "PUT",
      data: modified,
      headers: { "If-Match": String(original.data.question.content_version) },
    });
    expect(r.status, r.text).toBe(200);
    const key = randomToken();
    const s = await start(card, "Snapshot Student", { resume_key: key });
    const uri = "public/attempts/" + s.data.attempt_id;
    const view = await request({ attempt: key }, uri);
    expect(view.data.questions[0].title).toBe(original.data.question.title);
    await request({ attempt: key }, uri + "/answers", {
      method: "PUT",
      data: { answers: [{ position: 1, selected: ["A"], revision: 1 }] },
    });
    await request({ attempt: key }, uri + "/finish", {
      method: "POST",
      data: {},
    });
    expect(
      (await request({ attempt: key }, uri + "/result")).data.result.percentage,
    ).toBe(100);
  });
  it("expiry auto-submits, refresh cannot restart timer and hidden results remain private", async () => {
    const card = await createCard(h, a, [await createQuestion(h, a, q())], {
      show_results: false,
      show_answers: false,
      show_leaderboard: false,
    });
    const key = randomToken(),
      s = await start(card, "Timer Student", { resume_key: key });
    await h.db
      .prepare("UPDATE attempts SET expires_at=? WHERE id=?")
      .bind(tick() - 1, s.data.attempt_id)
      .run();
    const auth = { attempt: key },
      uri = "public/attempts/" + s.data.attempt_id;
    const r = await request(auth, uri);
    expect(r.status, r.text).toBe(200);
    expect(r.data.attempt.status).toBe("submitted");
    expect((await request(auth, uri + "/result")).data.hidden).toBe(true);
    expect(
      (await request({}, "public/cards/" + card.slug + "/leaderboard")).status,
    ).toBe(403);
    expect(
      (
        await request(auth, uri + "/answers", {
          method: "PUT",
          data: { answers: [{ position: 1, selected: ["A"], revision: 1 }] },
        })
      ).status,
    ).toBe(409);
  });
  it("group roster, tenant-local student codes and PIN are enforced", async () => {
    const gid = (
      await request(a, "teacher/groups", {
        method: "POST",
        data: { name: "Roster group" },
      })
    ).data.id;
    await request(a, "teacher/students", {
      method: "POST",
      data: {
        name: "Roster Student",
        student_code: "ROSTER-ONE",
        group_id: gid,
      },
    });
    await request(b, "teacher/students", {
      method: "POST",
      data: { name: "Other Student", student_code: "OTHER-ONLY" },
    });
    const card = await createCard(h, a, [await createQuestion(h, a, q())], {
      group_id: gid,
      access_mode: "pin",
      pin: "4321",
    });
    expect((await start(card, "Not roster", { pin: "4321" })).status).toBe(403);
    expect(
      (
        await start(card, "Not roster", {
          pin: "wrong",
          student_code: "ROSTER-ONE",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await start(card, "Not roster", {
          pin: "4321",
          student_code: "OTHER-ONLY",
        })
      ).status,
    ).toBe(403);
    const key = randomToken(),
      s = await start(card, "Spoofed Name", {
        pin: "4321",
        student_code: "ROSTER-ONE",
        resume_key: key,
      });
    expect(s.status, s.text).toBe(201);
    expect(
      (await request({ attempt: key }, "public/attempts/" + s.data.attempt_id))
        .data.attempt.student_name,
    ).toBe("Roster Student");
  });
  it("atomic admission enforces attempt limits under concurrent starts", async () => {
    const card = await createCard(h, a, [await createQuestion(h, a, q())]);
    const r = await Promise.all([
      start(card, "Concurrent Student"),
      start(card, "Concurrent Student"),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  });
  it("concurrent start retries with the same secret create only one attempt", async () => {
    const card = await createCard(h, a, [await createQuestion(h, a, q())]);
    const resume_key = randomToken();
    const r = await Promise.all([
      start(card, "Retry Student", { resume_key }),
      start(card, "Retry Student", { resume_key }),
    ]);
    expect(
      r.every((x) => [200, 201].includes(x.status)),
      JSON.stringify(r),
    ).toBe(true);
    expect(r[0].data.attempt_id).toBe(r[1].data.attempt_id);
  });
  it("conflicting answers at the same revision are rejected atomically", async () => {
    const card = await createCard(h, a, [await createQuestion(h, a, q())]);
    const key = randomToken(),
      s = await start(card, "Revision Student", { resume_key: key }),
      uri = "public/attempts/" + s.data.attempt_id;
    const r = await Promise.all(
      ["A", "B"].map((value) =>
        request({ attempt: key }, uri + "/answers", {
          method: "PUT",
          data: { answers: [{ position: 1, selected: [value], revision: 1 }] },
        }),
      ),
    );
    expect(r.map((x) => x.status).sort()).toEqual([200, 409]);
    const saved = await request({ attempt: key }, uri);
    const accepted = r[0].status === 200 ? "A" : "B";
    expect(saved.data.questions[0].answer).toEqual([accepted]);
  });
  it("rejects forged grades, repeated option IDs and out-of-range answer positions", async () => {
    const card = await createCard(h, a, [await createQuestion(h, a, q())]);
    const key = randomToken(),
      s = await start(card, "Tamper Student", { resume_key: key }),
      uri = "public/attempts/" + s.data.attempt_id + "/answers";
    expect(
      (
        await request({ attempt: key }, uri, {
          method: "PUT",
          data: {
            answers: [{ position: 1, selected: ["A"], revision: 1 }],
            score: 100,
          },
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await request({ attempt: key }, uri, {
          method: "PUT",
          data: {
            answers: [{ position: 1, selected: ["A", "A"], revision: 1 }],
          },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request({ attempt: key }, uri, {
          method: "PUT",
          data: { answers: [{ position: 2, selected: ["A"], revision: 1 }] },
        })
      ).status,
    ).toBe(404);
  });
});
describe("Store consent, Owner moderation and operations", () => {
  it("only Owner-approved immutable question snapshots become public; copies belong to the recipient", async () => {
    const title = "Store private question " + q();
    const qid = await createQuestion(h, a, q(), { title });
    expect(
      (await request({}, "store?q=" + encodeURIComponent(title))).data.items,
    ).toHaveLength(0);
    expect(
      (
        await request(a, "teacher/questions/" + qid + "/submit-store", {
          method: "POST",
          data: { consent: false, original: true, license: "CC-BY-4.0" },
        })
      ).status,
    ).toBe(422);
    const offer = await request(
      a,
      "teacher/questions/" + qid + "/submit-store",
      {
        method: "POST",
        data: {
          consent: true,
          original: true,
          license: "CC-BY-4.0",
          attribution: "Teacher A",
        },
      },
    );
    expect(offer.status, offer.text).toBe(201);
    expect(
      (await request({}, "store?q=" + encodeURIComponent(title))).data.items,
    ).toHaveLength(0);
    expect(
      (
        await request(a, "owner/moderation/" + offer.data.id, {
          method: "POST",
          data: {
            decision: "approved",
            reason: "Mualliflik va javoblar tekshirildi.",
          },
        })
      ).status,
    ).toBe(403);
    const approved = await request(owner, "owner/moderation/" + offer.data.id, {
      method: "POST",
      data: {
        decision: "approved",
        reason: "Mualliflik va javoblar tekshirildi.",
      },
    });
    expect(approved.status, approved.text).toBe(200);
    const store = await request({}, "store?q=" + encodeURIComponent(title));
    expect(store.data.items).toHaveLength(1);
    expect(store.text).not.toMatch(
      /tenant_id|student_name|phone|email|identity_hash|token_hash/,
    );
    const item = store.data.items[0];
    const copied = await request(b, "teacher/store/" + item.id + "/copy", {
      method: "POST",
      data: {},
    });
    expect(copied.status, copied.text).toBe(201);
    expect(copied.data.id).not.toBe(qid);
    expect(
      (await request(b, "teacher/questions/" + copied.data.id)).status,
    ).toBe(200);
    expect(
      (await request(a, "teacher/questions/" + copied.data.id)).status,
    ).toBe(404);
    await request(owner, "owner/moderation/" + offer.data.id, {
      method: "POST",
      data: {
        decision: "revoked",
        reason: "Takedown tekshiruvi bo‘yicha bekor qilindi.",
      },
    });
    expect((await request({}, "store/" + item.id)).status).toBe(404);
    expect(
      (
        await request(b, "teacher/store/" + item.id + "/copy", {
          method: "POST",
          data: {},
        })
      ).status,
    ).toBe(404);
    expect(
      (await request(b, "teacher/questions/" + copied.data.id)).status,
    ).toBe(200);
  });
  it("Owner overview does not leak individual students and teacher block revokes sessions/exams", async () => {
    const r = await request(owner, "owner/overview");
    expect(r.status, r.text).toBe(200);
    expect(r.text).not.toContain("Private Student A");
    const teacher = await h.seedTeacher("Blockable Teacher");
    const card = await createCard(h, teacher, [
      await createQuestion(h, teacher, q()),
    ]);
    expect(
      (
        await request(owner, "owner/teachers/" + teacher.tid + "/status", {
          method: "POST",
          data: {
            status: "blocked",
            reason: "Xavfsizlik bo‘yicha test bloklash amali.",
          },
        })
      ).status,
    ).toBe(200);
    expect((await request(teacher, "auth/me")).status).toBe(401);
    expect((await start(card)).status).toBe(404);
  });
  it("Support is tenant-scoped and Owner replies appear only in the origin workspace", async () => {
    const r = await request(a, "teacher/support", {
      method: "POST",
      data: {
        subject: "Yordam kerak",
        message: "Import qilishda yordam kerak.",
      },
    });
    expect(r.status).toBe(201);
    const list = await request(a, "teacher/support"),
      ticket = list.data.items[0];
    expect((await request(b, "teacher/support")).text).not.toContain(
      ticket.message,
    );
    const reply = await request(
      owner,
      "owner/support/" + ticket.id + "/reply",
      {
        method: "POST",
        data: {
          reply: "Shablondagi ustunlarni tekshiring.",
          status: "resolved",
        },
      },
    );
    expect(reply.status).toBe(200);
    expect((await request(a, "teacher/support")).text).toContain("Shablondagi");
    expect((await request(b, "teacher/support")).text).not.toContain(
      "Shablondagi",
    );
  });
  it("encrypts an R2 backup, validates its hash and restores a fresh database with exact table counts", async () => {
    const backup = await request(owner, "owner/backups", {
      method: "POST",
      data: { reason: "Avtomatlashtirilgan backup restore sinovi." },
    });
    expect(backup.status, backup.text).toBe(201);
    const manifest = await h.db
      .prepare("SELECT * FROM backup_manifest WHERE id=?")
      .bind(backup.data.id)
      .first();
    const object = await (
      await h.mf.getR2Bucket("FILES")
    ).get(manifest.object_key);
    const encrypted = await object.text();
    expect(hash(encrypted)).toBe(manifest.sha256);
    expect(encrypted).not.toContain("Teacher A");
    const [iv, cipher] = encrypted.split(".");
    const buffer = Buffer.from(cipher, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.alloc(32, 2),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(buffer.subarray(-16));
    const plain = Buffer.concat([
      decipher.update(buffer.subarray(0, -16)),
      decipher.final(),
    ]);
    const data = JSON.parse(plain);
    expect(data.data.sessions).toBeUndefined();
    const fresh = await harness();
    try {
      for (const [table, list] of Object.entries(data.data)) {
        if (table === "system_settings")
          await fresh.db.exec("DELETE FROM system_settings;");
        for (const row of list) {
          const names = Object.keys(row);
          await fresh.db
            .prepare(
              `INSERT INTO ${table}(${names.join(",")}) VALUES(${names.map(() => "?").join(",")})`,
            )
            .bind(...Object.values(row))
            .run();
        }
        const count = await fresh.db
          .prepare(`SELECT COUNT(*) n FROM ${table}`)
          .first();
        expect(count.n, table).toBe(backup.data.table_counts[table]);
      }
      expect(
        (await fresh.db.prepare("PRAGMA foreign_key_check").all()).results,
      ).toHaveLength(0);
      expect(
        (await fresh.db.prepare("SELECT COUNT(*) n FROM sessions").first()).n,
      ).toBe(0);
    } finally {
      await fresh.close();
    }
  });
  it("deletes an account and its tenant contents while retaining no active session", async () => {
    const u = await h.seedTeacher("Delete Teacher");
    const qid = await createQuestion(h, u, q());
    const card = await createCard(h, u, [qid]);
    await start(card, "Deleted Student");
    const r = await request(u, "teacher/account", {
      method: "DELETE",
      data: { confirmation: "HISOBIMNI O‘CHIRISH" },
    });
    expect(r.status, r.text).toBe(200);
    expect(
      (
        await h.db
          .prepare("SELECT COUNT(*) n FROM questions WHERE tenant_id=?")
          .bind(u.tid)
          .first()
      ).n,
    ).toBe(0);
    expect((await request(u, "auth/me")).status).toBe(401);
    expect((await request({}, "public/cards/" + card.slug)).status).toBe(404);
  });
});
