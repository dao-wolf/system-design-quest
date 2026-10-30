// The quest map's words, from the player's side: what the one next action is, what is left to beat, and what a locked
// chapter is waiting for. The fixture host (/types/) has every chapter open; the real host (/) has the real order.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { OPEN_AT_START } from "../../web/engine.js";

const bundle = JSON.parse(readFileSync("dist/chapters.json", "utf8"));
const fixture = JSON.parse(readFileSync("tests/e2e/fixtures/chapters.json", "utf8"));
const chapter = (slug) => fixture.chapters.find((c) => c.slug === slug);
const button = (page, name) => page.getByRole("button", { name, exact: true });
async function playChapter(page, slug) {
  await page.goto("/types/");
  await page
    .locator(".chapter", { has: page.getByRole("heading", { name: chapter(slug).title, exact: true }) })
    .getByRole("button", { name: "Play" })
    .click();
}
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
  await expect(page.getByText(/still to beat/)).toHaveCount(0);
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

// The record as a player who has tried everything but the boss in the first n chapters would have left it.
const triedAllButTheBoss = (n) =>
  fixture.chapters
    .slice(0, n)
    .flatMap((ch) => ch.challenges.filter((c) => c.id !== ch.boss))
    .map((c) => ({ v: 1, kind: "answer", challenge: c.id, day: "2026-10-30", correct: true, fraction: 1, points: 10 }));

for (const [n, said] of [
  [2, "Chapter 1 and Chapter 2 played, bosses still to beat."],
  [3, "Chapter 1, Chapter 2 and Chapter 3 played, bosses still to beat."],
  [4, "4 chapters played, bosses still to beat."],
]) {
  test(`with ${n} chapters played and their bosses still to beat, the header says so`, async ({ page }) => {
    await page.addInitScript(
      (events) => globalThis.localStorage.setItem("sdq-events-v1", JSON.stringify(events)),
      triedAllButTheBoss(n),
    );
    await page.goto("/types/");
    await expect(page.getByText(said)).toBeVisible();
  });
}

// Each locked training chapter waits for as many more bosses as it sits places beyond the ones open at the start.
test("a locked chapter says how many more bosses open it, and names one to try", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const training = bundle.chapters.filter((c) => c.kind !== "quest" && !c.open).sort((a, b) => a.chapter - b.chapter);
  const locked = training.slice(OPEN_AT_START);
  expect(locked.length).toBeGreaterThan(1);
  for (const [i, ch] of locked.entries()) {
    const more = i === 0 ? "one more boss" : `${i + 1} more bosses`;
    await expect(lockedCard(page, ch.chapter)).toContainText(
      `Opens when you beat ${more}, such as the Chapter ${training[0].chapter} boss`,
    );
  }
  await expect(page.getByText("Opens when you beat another boss")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
    true,
  );
  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});
