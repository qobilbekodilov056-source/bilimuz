import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { readFile } from "node:fs/promises";
import { questionSchema, cardSchema } from "../packages/shared/schema";
import { validateImport, headers } from "../apps/api/imports";
import { parseCsv, parseXlsx, makeXlsx, toCsv } from "../apps/api/spreadsheet";
import { totp, verifyTelegramIdToken } from "../apps/api/auth";
describe("shared validation and bounded import", () => {
  it.each(["single", "code", "truefalse"])(
    "rejects multiple correct for %s",
    (kind) => {
      expect(
        questionSchema.safeParse({
          title: "Savol matni",
          category: "Fan",
          kind,
          options: [
            { id: "A", text: "A" },
            { id: "B", text: "B" },
          ],
          correct: ["A", "B"],
        }).success,
      ).toBe(false);
    },
  );
  it("rejects role/tenant/score mass assignment", () => {
    expect(
      questionSchema.safeParse({
        title: "Savol matni",
        category: "Fan",
        options: [
          { id: "A", text: "A" },
          { id: "B", text: "B" },
        ],
        correct: ["A"],
        tenant_id: "other",
      }).success,
    ).toBe(false);
  });
  it("rejects malformed card mixes and hidden answer policy", () => {
    expect(
      cardSchema.safeParse({
        title: "Test",
        mix: { easy: 10, medium: 10, hard: 0, expert: 0 },
      }).success,
    ).toBe(false);
    expect(
      cardSchema.safeParse({
        title: "Test",
        show_results: false,
        show_answers: true,
      }).success,
    ).toBe(false);
  });
  it("roundtrips real Uzbek XLSX with 100 questions", async () => {
    const data = [
      headers,
      ...Array.from({ length: 100 }, (_, i) => [
        "Savol matni " + i,
        "Matematika",
        "Sonlar",
        "O‘rtacha",
        "Bir nechta javob",
        "Bir",
        "Ikki",
        "Uch",
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
    const rows = await validateImport(parseXlsx(makeXlsx(data)));
    expect(rows).toHaveLength(100);
    expect(rows.every((r) => r.status === "valid")).toBe(true);
    expect(rows[0].question!.correct).toEqual(["A", "C"]);
  });
  it("reads the supplied XLSX template and ignores examples", async () => {
    const cells = parseXlsx(
      new Uint8Array(
        await readFile(
          "apps/web/public/templates/SysOne_TestLab_Import_Shablon_UZ_v2.xlsx",
        ),
      ),
    );
    expect(cells[0].map((c) => c.value)).toEqual(headers);
    expect(
      cells.filter((row) => row.some((c) => c?.value?.trim())).length,
    ).toBeLessThan(10);
  });
  it("legacy CSV, UTF-8 BOM, quoted commas and CRLF", async () => {
    const rows = await validateImport(
      parseCsv(
        '\ufefftitle,category,level,kind,option_a,option_b,correct\r\n"Savol, matni",Fan,easy,single,Ha,Yo‘q,A\r\n',
      ),
    );
    expect(rows[0].status).toBe("valid");
    expect(rows[0].question!.title).toBe("Savol, matni");
  });
  it("reports formula and duplicates by row/column", async () => {
    const data = [
      headers,
      [
        "Savol matni",
        "Fan",
        "",
        "Oson",
        "Bitta javob",
        "Ha",
        "Yo‘q",
        "",
        "",
        "",
        "",
        "",
        "",
        "A",
        "",
        "1",
        "",
      ],
      [
        "Savol matni",
        "Fan",
        "",
        "Oson",
        "Bitta javob",
        "Ha",
        "Yo‘q",
        "",
        "",
        "",
        "",
        "",
        "",
        "A",
        "",
        "1",
        "",
      ],
      [
        '=HYPERLINK("evil")',
        "Fan",
        "",
        "Oson",
        "Bitta javob",
        "Ha",
        "Yo‘q",
        "",
        "",
        "",
        "",
        "",
        "",
        "Z",
        "",
        "1",
        "",
      ],
    ];
    const rows = await validateImport(
      data.map((r) => r.map((value) => ({ value: String(value) }))),
    );
    expect(rows.map((x) => x.status)).toEqual([
      "valid",
      "duplicate",
      "invalid",
    ]);
    expect(rows[2].row).toBe(4);
    expect(rows[2].errors.some((e) => e.column === "Savol matni")).toBe(true);
  });
  it("neutralizes spreadsheet formulas in CSV export", () => {
    expect(toCsv([["=1+1", "@evil", "+cmd", "-calc"]])).toContain("'=1+1");
  });
  it("rejects unclosed CSV and more than 1000 rows", () => {
    expect(() => parseCsv('"unclosed')).toThrow();
    expect(() =>
      parseXlsx(
        makeXlsx([
          headers,
          ...Array.from({ length: 1001 }, () => ["question"]),
        ]),
      ),
    ).toThrow();
  });
});
describe("Telegram verification and MFA", () => {
  it("TOTP matches the RFC 6238 known SHA-1 vector", async () => {
    expect(await totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1)).toBe("287082");
  });
  it("validates JWKS signature, issuer, audience, expiry and nonce", async () => {
    const pair = await generateKeyPair("RS256");
    const jwks = createLocalJWKSet({
      keys: [
        { ...(await exportJWK(pair.publicKey)), kid: "one", alg: "RS256" },
      ],
    });
    const sign = (extra: any = {}) =>
      new SignJWT({ nonce: "nonce", ...extra })
        .setProtectedHeader({ alg: "RS256", kid: "one" })
        .setIssuer("https://oauth.telegram.org")
        .setAudience("client")
        .setSubject("immutable-sub")
        .setIssuedAt()
        .setExpirationTime("2m")
        .sign(pair.privateKey);
    const valid = await sign();
    expect(
      (await verifyTelegramIdToken(valid, "client", "nonce", jwks)).sub,
    ).toBe("immutable-sub");
    await expect(
      verifyTelegramIdToken(valid, "wrong", "nonce", jwks),
    ).rejects.toThrow();
    await expect(
      verifyTelegramIdToken(valid, "client", "wrong", jwks),
    ).rejects.toThrow();
    const wrongIssuer = await new SignJWT({ nonce: "nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "one" })
      .setIssuer("https://evil.test")
      .setAudience("client")
      .setSubject("sub")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(pair.privateKey);
    await expect(
      verifyTelegramIdToken(wrongIssuer, "client", "nonce", jwks),
    ).rejects.toThrow();
    const expired = await new SignJWT({ nonce: "nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "one" })
      .setIssuer("https://oauth.telegram.org")
      .setAudience("client")
      .setSubject("sub")
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(pair.privateKey);
    await expect(
      verifyTelegramIdToken(expired, "client", "nonce", jwks),
    ).rejects.toThrow();
  });
});
