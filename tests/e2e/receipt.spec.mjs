// The sum behind the points, from the player's side: every feedback card says how its points add up, in one line,
// with a folded table that works it out. Played on the fixture host (/types/), where every answer is known. The
// wording of each row is in tests/receipt.test.mjs; these journeys show it reaches the card.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, playChapter, seen } from "./helpers.mjs";

const duel = chapter("drill-duel").challenges[0]; // evaluate, worth 40
const [multi, , boss] = chapter("full-run").challenges; // understand 15, remember 10, a duel boss

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

// Answers a duel, getting the choice, the reason and the cost right unless told otherwise.
async function answerDuel(page, c, { choice = c.correct, reason = c.reason, cost = c.cost } = {}) {
  await button(page, c.choices[choice]).click();
  await button(page, c.reasons[reason]).click();
  await button(page, c.costs[cost]).click();
  await button(page, "Check").click();
}
const rightMulti = async (page) => {
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
};
const gotRecall = async (page) => {
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
};
const next = (page) => button(page, "Next ▶").click();
const sure = (page) => button(page, "😎 Sure (×1.5 if right)").click();

const receipt = (page) => page.locator(".feedback .receipt");
const sum = (page) => receipt(page).locator(".sum");
// Opens the folded table, then checks the cell beside each heading given.
async function tableHas(page, rows) {
  await receipt(page).getByText("How this was worked out").click();
  for (const [heading, text] of Object.entries(rows)) {
    const row = receipt(page).locator("tr", { has: page.locator("th", { hasText: new RegExp(`^${heading}$`) }) });
    await seen(row.locator("td"), text);
  }
}
const seriousViolations = async (page) => {
  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  return axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
};

test("a partly right duel shows its sum on one line, and a folded table works it out", async ({ page }) => {
  await playChapter(page, "drill-duel");
  await answerDuel(page, duel, { cost: 0 }); // two of three parts
  await seen(page.locator(".feedback .plus"), "+27");
  await seen(sum(page), "Evaluate 40 × 2 of 3 parts = +27");
  await expect(receipt(page).locator("table")).toBeHidden(); // folded until asked for
  await tableHas(page, { Worth: "Evaluate: 40", Right: "2 of 3 parts = 67%", Total: "26.7 → +27" });
});

test("an answer under the pass mark says so, instead of a sum that does not add up", async ({ page }) => {
  await playChapter(page, "drill-duel");
  await answerDuel(page, duel, { reason: 1, cost: 0 }); // one of three parts
  await expect(page.locator(".feedback .verdict")).toContainText("❌ Not this time");
  await seen(sum(page), "Evaluate 40 × 1 of 3 parts, under 50% = +0");
  await tableHas(page, { Right: "1 of 3 parts = 33% (under the 50% needed to score)", Total: "0 → +0" });
});

test("the boss on a third right answer in a row pays ×2, and the streak row says so", async ({ page }) => {
  await playChapter(page, "full-run");
  await rightMulti(page);
  await next(page);
  await gotRecall(page);
  await next(page);
  await answerDuel(page, boss);
  await seen(sum(page), "Boss 100 × all right × streak 2 = +200");
  await tableHas(page, { Worth: "Boss: 100", Streak: "×2 (3 right in a row)", Total: "200 → +200" });
});

test("a boss answered partly ends the streak: the row says why, and Sure pays nothing", async ({ page }) => {
  await playChapter(page, "full-run");
  await rightMulti(page);
  await next(page);
  await gotRecall(page);
  await next(page);
  await sure(page);
  await answerDuel(page, boss, { choice: 1 }); // two of three parts
  await expect(page.getByText("Streak reset, best this run: 2.")).toBeVisible();
  await tableHas(page, { "Sure bonus": "×1 (Sure pays only when all of it is right)", Total: "66.7 → +67" });
});

// The card at 375 px, in both colour schemes and (in the dark) all right too, for its green card: the table fits inside
// it, the points keep clear of the verdict's words, and axe finds nothing serious. The capture goes to the report.
for (const [scheme, kind, answer, total] of [
  ["light", "partly right", { cost: 0 }, "26.7 → +27"],
  ["dark", "partly right", { cost: 0 }, "26.7 → +27"],
  ["dark", "right", {}, "40 → +40"],
]) {
  test(`at 375 px in ${scheme} mode a ${kind} card fits, keeps its points clear of the words and passes axe`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 900 });
    await playChapter(page, "drill-duel");
    await answerDuel(page, duel, answer);
    await tableHas(page, { Total: total });

    const box = (sel) => page.locator(sel).first().boundingBox();
    const [card, plus, table] = await Promise.all([".feedback", ".feedback .plus", ".feedback .receipt"].map(box));
    // The verdict's box is as wide as the card, so it is its words that must keep clear of the points.
    const words = await page.locator(".feedback .verdict").evaluate((el) => {
      const range = globalThis.document.createRange();
      range.selectNodeContents(el);
      return [...range.getClientRects()].map(({ x, y, width, height }) => ({ x, y, width, height }));
    });
    const overlaps = (a, b) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    for (const line of [...words, table]) expect(overlaps(plus, line)).toBe(false);
    expect(table.x).toBeGreaterThanOrEqual(card.x);
    expect(table.x + table.width).toBeLessThanOrEqual(card.x + card.width);
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    );
    // The points pop in over a second; axe would read the colour half way through the fade.
    await page.locator(".feedback .plus").evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    expect(await seriousViolations(page)).toEqual([]);
    await testInfo.attach(`receipt-${scheme}-${kind}-375`, {
      body: await page.locator(".feedback").screenshot(),
      contentType: "image/png",
    });
  });
}
