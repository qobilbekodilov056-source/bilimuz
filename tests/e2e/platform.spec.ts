import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
const fixture = async () => JSON.parse(await readFile("tmp/e2e.json", "utf8"));
async function login(page: any, which = "a") {
  const f = await fixture(),
    u = f[which];
  const cookies = u.cookie.split("; ").map((x: string) => {
    const [name, value] = x.split("=");
    return {
      name,
      value,
      url: f.origin,
      httpOnly: name === "testlab_session",
      sameSite: "Lax" as const,
    };
  });
  await page.context().addCookies(cookies);
  return f;
}
test("landing, registration and public store render without page errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Bilimni baholang. Imkoniyatni oching.",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Workspace yaratish" }).click();
  await expect(
    page.getByRole("heading", { name: "Yangi imkoniyatlar shu yerdan." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email manzil")).toBeVisible();
  await expect(page.getByLabel("Ism va familiya")).toBeVisible();
  await page.goto("/store");
  await expect(
    page.getByRole("heading", { name: "Savollar do‘koni" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("teacher dashboard, question editor, groups and student form work against real API", async ({
  page,
}) => {
  await login(page);
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "Bilim sari navbatdagi qadam." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /SysOne Support/ }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Savollar bazasi", exact: true })
    .click();
  await page.getByRole("button", { name: "Savol qo‘shish" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Savol matni", { exact: true })
    .fill("Brauzer orqali qo‘shilgan savol qanday?");
  await dialog.getByLabel("Fan / kategoriya").fill("Brauzer Fan");
  for (const [letter, text] of [
    ["A", "To‘g‘ri"],
    ["B", "Xato"],
    ["C", "Variant uch"],
    ["D", "Variant to‘rt"],
  ])
    await dialog.getByLabel(letter + " varianti", { exact: true }).fill(text);
  await dialog.getByRole("button", { name: "Savolni saqlash" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Brauzer orqali qo‘shilgan savol qanday?",
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Guruhlar", exact: true }).click();
  await page.getByRole("button", { name: "Guruh yaratish" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Guruh nomi")
    .fill("Brauzer guruhi");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saqlash", exact: true })
    .click();
  await expect(page.getByText("Brauzer guruhi", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "O‘quvchilar", exact: true }).click();
  await page.getByRole("button", { name: "O‘quvchi qo‘shish" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Ism va familiya")
    .fill("Brauzer Student");
  await page.getByRole("dialog").getByLabel("O‘quvchi kodi").fill("WEB-001");
  await page
    .getByRole("dialog")
    .getByLabel("Guruh", { exact: true })
    .selectOption({ label: "Brauzer guruhi" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Saqlash", exact: true })
    .click();
  await expect(
    page.getByText("Brauzer Student", { exact: true }),
  ).toBeVisible();
});
test("Uzbek import file uploads, previews and commits in three steps", async ({
  page,
}) => {
  await login(page);
  await page.goto("/studio/imports");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "browser.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Savol matni,Fan / kategoriya,Qiyinchilik darajasi,Savol turi,A varianti,B varianti,To‘g‘ri javob\nBrauzer import savoli qaysi?,Import,Oson,Bitta javob,Ha,Yo‘q,A\n",
      ),
    });
  await page.getByRole("button", { name: "Faylni tekshirish" }).click();
  await expect(
    page.getByRole("heading", { name: "Tekshiruv natijasi" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Importni tasdiqlash" }).click();
  await expect(
    page.getByRole("heading", { name: "1 ta savol saqlandi" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Excel shabloni" }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("Shablon");
});
test("student autosave survives reload and temporary network loss, then grades and displays results", async ({
  page,
}) => {
  const f = await fixture();
  await page.goto("/t/" + f.card.slug);
  await page.getByLabel("Ism va familiya").fill("Browser Exam Student");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Testni boshlash" }).click();
  await expect(
    page.getByRole("heading", { name: /Python savoli/ }),
  ).toBeVisible();
  await page.getByLabel("A. To‘g‘ri").check();
  await expect(page.getByText("Barcha javoblar saqlangan")).toBeVisible({
    timeout: 15000,
  });
  const before = await page.getByRole("timer").innerText();
  await page.reload();
  await expect(page.getByLabel("A. To‘g‘ri")).toBeChecked();
  expect((await page.getByRole("timer").innerText()) <= before).toBeTruthy();
  await page.getByRole("button", { name: "Keyingi", exact: true }).click();
  await page.context().setOffline(true);
  await page.getByLabel("A. To‘g‘ri").check();
  await expect(page.getByText("Ulanish uzildi.", { exact: false })).toBeVisible(
    { timeout: 15000 },
  );
  await page.context().setOffline(false);
  await expect(page.getByText("Barcha javoblar saqlangan")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Keyingi", exact: true }).click();
  await page.getByLabel("A. To‘g‘ri").check();
  await page.getByRole("button", { name: "Yakunlash", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ha, yakunlash" })
    .click();
  await expect(
    page.getByText("Browser Exam Student, natijangiz tayyor."),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("100%", { exact: true }).first()).toBeVisible();
});
test("owner moderation uses a separate protected console and blocks teacher sessions", async ({
  page,
}) => {
  await login(page);
  await page.goto("/owner");
  await expect(
    page.getByRole("heading", { name: "Owner OS — xavfsiz kirish." }),
  ).toBeVisible();
  await page.context().clearCookies();
  await login(page, "owner");
  await page.goto("/owner");
  await expect(
    page.getByRole("heading", { name: "Owner OS", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Store moderatsiyasi" }).click();
  await expect(
    page.getByRole("heading", { name: "Store moderatsiyasi" }),
  ).toBeVisible();
  await expect(page.getByText("Navbat bo‘sh")).toBeVisible();
});
test("mobile dock, keyboard navigation, responsive overflow and WCAG checks", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio");
  await expect(
    page.getByRole("heading", { name: "Bilim sari navbatdagi qadam." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Menyuni ochish" }).click();
  await page
    .getByRole("link", { name: "Savollar bazasi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Savollar bazasi", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Savol qo‘shish" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
});
test("desktop dashboard and public landing pass accessibility checks", async ({
  page,
}) => {
  await login(page);
  for (const path of [
    "/studio",
    "/",
    "/studio/imports",
    "/studio/cards",
    "/studio/settings",
  ]) {
    await page.goto(path);
    await page.locator("h1").waitFor();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations, path).toEqual([]);
  }
});
