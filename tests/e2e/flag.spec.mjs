// Flag, from the player's side: one form at a time, a button that waits for some words, and a message that says where
// the flag went. A flag is only saved on the device; the way to send it on is a GitHub issue the player chooses to open.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
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
  page.on("request", (r) => requests.push({ method: r.method(), url: r.url() }));
  await missFirstQuestion(page);
  await button(page, "🚩 Flag").click();

  const send = button(page, "Flag it");
  await expect(send).toBeDisabled();
  await field(page).fill("   ");
  await expect(send).toBeDisabled();
  await field(page).fill("The wording is unclear");
  await expect(send).toBeEnabled();
  await send.click();

  await expect(field(page)).toHaveCount(0);
  await expect(button(page, "Flag it")).toHaveCount(0);
  await expect(page.getByText("Saved on this device. To send it to me,")).toBeVisible();
  await expect(page.getByText("It'll be reviewed")).toHaveCount(0);
  await expect(button(page, "🚩 Flagged")).toBeDisabled();

  // The flag is in the local record, and nothing has left the page.
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")));
  expect(record.find((e) => e.kind === "flag")).toMatchObject({ challenge: multi.id, note: "The wording is unclear" });
  expect(requests.every((r) => r.method === "GET" && r.url.startsWith("http://127.0.0.1:4181/"))).toBe(true);

  // The way out is a link the player chooses to click: a GitHub issue with their words already in it.
  const link = page.getByRole("link", { name: "report it on GitHub" });
  const url = new URL((await link.getAttribute("href")) ?? "");
  expect(`${url.origin}${url.pathname}`).toBe("https://github.com/dao-wolf/system-design-quest/issues/new");
  expect(url.searchParams.get("template")).toBe("wrong-answer.yml");
  expect(url.searchParams.get("challenge")).toContain(multi.id);
  expect(url.searchParams.get("why")).toBe("The wording is unclear");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
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

  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});
