// Flag, from the player's side: one form at a time, a button that waits for some words, and a message that says where
// the flag went. A flag is only saved on the device; the way to send it on is a GitHub issue the player chooses to open.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { button, chapter, missMulti, playChapter } from "./helpers.mjs";

const multi = chapter("full-run").challenges[0];
const field = (page) => page.getByPlaceholder("What's wrong with it?");

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

async function missFirstQuestion(page) {
  await playChapter(page, "full-run");
  await missMulti(page, multi);
  await expect(page.locator(".feedback .verdict")).toContainText("❌ Not this time");
}

test("Flag opens one form, however often it is clicked, and a second click closes it", async ({ page }) => {
  await missFirstQuestion(page);
  const flag = button(page, "🚩 Flag");
  await expect(flag).toHaveAttribute("aria-expanded", "false");

  await flag.click();
  await expect(field(page)).toBeVisible();
  await expect(flag).toHaveAttribute("aria-expanded", "true");
  await flag.click();
  await expect(field(page)).toHaveCount(0);
  await expect(flag).toHaveAttribute("aria-expanded", "false");

  for (let i = 0; i < 3; i++) await flag.click(); // open, close, open
  await expect(field(page)).toHaveCount(1);
});

test("Flag it waits for some words, and sending folds the form into one honest line", async ({ page }) => {
  const requests = [];
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url(), body: r.postData() ?? "" }));
  await missFirstQuestion(page);
  await button(page, "🚩 Flag").click();

  const send = button(page, "Flag it");
  await expect(send).toBeDisabled();
  await field(page).fill("   ");
  await expect(send).toBeDisabled();
  const note = "Wrong & unclear: 100% sure? a+b #1, café 🚩";
  await field(page).fill(note);
  await expect(send).toBeEnabled();
  await send.click();

  await expect(field(page)).toHaveCount(0);
  await expect(button(page, "Flag it")).toHaveCount(0);
  const saved = page.getByText("Saved on this device. To send it to me,");
  await expect(saved).toBeVisible();
  await expect(saved).toBeFocused();
  await expect(page.getByText("It'll be reviewed")).toHaveCount(0);
  await expect(button(page, "🚩 Flagged")).toBeDisabled();

  // The flag is in the local record once, and nothing has left the page: no request carries the note.
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")));
  expect(record.filter((e) => e.kind === "flag")).toMatchObject([{ challenge: multi.id, note }]);
  const origin = new URL(page.url()).origin;
  expect(requests.every((r) => r.method === "GET" && r.url.startsWith(`${origin}/`))).toBe(true);
  expect(requests.some((r) => r.url.includes("Wrong") || r.body.includes("Wrong"))).toBe(false);

  // The way out is a link the player chooses to click: a GitHub issue with their words already in it.
  const link = page.getByRole("link", { name: "report it on GitHub" });
  const url = new URL((await link.getAttribute("href")) ?? "");
  expect(`${url.origin}${url.pathname}`).toBe("https://github.com/dao-wolf/system-design-quest/issues/new");
  expect(url.searchParams.get("template")).toBe("wrong-answer.yml");
  expect(url.searchParams.get("title")).toBe(`Wrong answer? ${multi.id}`);
  expect(url.searchParams.get("challenge")).toBe(`${multi.id}: ${multi.prompt}`);
  expect(url.searchParams.get("why")).toBe(note);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);

  // The issue form takes these fields by id, so a renamed field would quietly stop being filled in.
  const template = readFileSync(".github/ISSUE_TEMPLATE/wrong-answer.yml", "utf8");
  const ids = [...template.matchAll(/^\s+id: (\w+)/gm)].map((m) => m[1]);
  for (const name of ["challenge", "why"]) expect(ids).toContain(name);
});

test("a double click on Flag it saves one flag", async ({ page }) => {
  await missFirstQuestion(page);
  await button(page, "🚩 Flag").click();
  await field(page).fill("The wording is unclear");
  await button(page, "Flag it").dblclick();
  await expect(page.getByText("Saved on this device. To send it to me,")).toBeVisible();
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")));
  expect(record.filter((e) => e.kind === "flag")).toHaveLength(1);
});

test("Enter sends the flag, and a note over 500 characters is cut whole, never through an emoji", async ({ page }) => {
  await missFirstQuestion(page);
  await button(page, "🚩 Flag").click();
  await field(page).fill(`${"a".repeat(499)}🚩🚩`);
  await field(page).press("Enter");

  await expect(page.getByText("Saved on this device. To send it to me,")).toBeVisible();
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")));
  expect(record.filter((e) => e.kind === "flag").map((e) => e.note)).toEqual([`${"a".repeat(499)}🚩`]);
  const url = new URL((await page.getByRole("link", { name: "report it on GitHub" }).getAttribute("href")) ?? "");
  expect(url.searchParams.get("why")).toBe(`${"a".repeat(499)}🚩`);
});

test("on a phone the Flag form fits the screen and passes the accessibility check", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await missFirstQuestion(page);
  await button(page, "🚩 Flag").click();
  await expect(field(page)).toBeInViewport({ ratio: 1 });
  await expect(button(page, "Flag it")).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
    true,
  );

  const seriousViolations = async () => {
    const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
    return axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  };
  expect(await seriousViolations()).toEqual([]);

  await field(page).fill("The wording is unclear");
  await button(page, "Flag it").click();
  await expect(page.getByRole("link", { name: "report it on GitHub" })).toBeInViewport({ ratio: 1 });
  expect(await seriousViolations()).toEqual([]);
});
