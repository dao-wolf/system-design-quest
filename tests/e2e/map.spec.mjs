// The quest map's words, from the player's side: what the one next action is, what is left to beat, and what a locked
// chapter is waiting for. The fixture host (/types/) has every chapter open; the real host (/) has the real order.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { button, chapter, fixture, playChapter } from "./helpers.mjs";

const bundle = JSON.parse(readFileSync("dist/chapters.json", "utf8"));
const lockedCard = (page, number) =>
  page.locator(".chapter.locked", {
    has: page.getByRole("heading", { name: bundle.chapters.find((c) => c.chapter === number).title, exact: true }),
  });

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

// Chapter 1 of the fixture is a recall card, then its boss: play the card, then leave before the boss.
async function playFirstChapterWithoutItsBoss(page) {
  await playChapter(page, "drill-recall");
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
  await button(page, "Next ▶").click();
  await expect(page.locator(".kind")).toContainText("👹 Boss");
  await button(page, "Map").click();
}

test("a new player's next action is to play the first chapter, with nothing yet to beat", async ({ page }) => {
  await page.goto("/types/");
  const next = page.locator(".next-up");
  await expect(next.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  await expect(page.getByText("boss still to beat")).toHaveCount(0);
});

test("once a chapter is played, the next action is its boss, and the header says what is left", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await playFirstChapterWithoutItsBoss(page);

  const next = page.locator(".next-up");
  await expect(next.getByRole("button", { name: "Replay" })).toHaveCount(0);
  await expect(page.getByText("Chapter 1 played, boss still to beat.")).toBeVisible();
  await expect(page.getByText(`0 of ${fixture.chapters.length} bosses beaten.`, { exact: false })).toBeVisible();
  await expect(next.getByRole("button", { name: "Try the Chapter 1 boss" })).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
    true,
  );
  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);

  // The button plays that boss alone.
  await next.getByRole("button", { name: "Try the Chapter 1 boss" }).click();
  await expect(page.locator(".kind")).toContainText("👹 Boss");
  await expect(page.getByText(chapter("drill-recall").challenges[1].prompt)).toBeVisible();
});

test("a locked chapter says how many more bosses open it, and names one to try", async ({ page }) => {
  await page.goto("/");
  await expect(lockedCard(page, 3)).toContainText("Opens when you beat one more boss, such as the Chapter 1 boss");
  await expect(lockedCard(page, 4)).toContainText("Opens when you beat 2 more bosses, such as the Chapter 1 boss");
  await expect(page.getByText("Opens when you beat another boss")).toHaveCount(0);
});
