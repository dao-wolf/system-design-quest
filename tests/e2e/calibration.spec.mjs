// The calibration line on the results screen: how often each confidence was right on the first try, so "Sure" can be
// compared with how often Sure was right. Second chances and self-graded questions do not count. Played on /types/.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, missMulti, playChapter, seen } from "./helpers.mjs";

const [multi, , boss] = chapter("full-run").challenges;
const SURE = "😎 Sure (×1.5 if all right)";
const FAIRLY = "🙂 Fairly";
const GUESS = "😬 Guess";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const next = (page) => button(page, "Next ▶").click();
const rightMulti = async (page) => {
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
};
const gotRecall = async (page) => {
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
};
async function playBoss(page, { right }) {
  const pick = (list, ok) => list.findIndex((_, i) => (i === ok) === right);
  await button(page, boss.choices[pick(boss.choices, boss.correct)]).click();
  await button(page, boss.reasons[pick(boss.reasons, boss.reason)]).click();
  await button(page, boss.costs[pick(boss.costs, boss.cost)]).click();
  await button(page, "Check").click();
}
const line = (page) => page.locator(".calibration");

test("the results say how often Sure and Fairly were right on first tries", async ({ page }) => {
  await playChapter(page, "full-run");
  await button(page, SURE).click();
  await rightMulti(page);
  await next(page);
  await gotRecall(page); // self-graded: no confidence to count
  await next(page);
  await button(page, FAIRLY).click();
  await playBoss(page, { right: true });
  await next(page);
  await seen(line(page), "On first tries: Sure 1 of 1 right · Fairly 1 of 1 right.");
});

test("a second chance does not count: Sure that missed first stays a miss", async ({ page }) => {
  await playChapter(page, "full-run");
  await button(page, SURE).click();
  await missMulti(page, multi);
  await next(page);
  await gotRecall(page);
  await next(page);
  await button(page, "Start now").click();
  await button(page, SURE).click();
  await rightMulti(page); // right now, but it is a second chance
  await next(page);
  await playBoss(page, { right: true }); // no confidence chosen
  await next(page);
  await seen(line(page), "On first tries: Sure 0 of 1 right.");
});

test("a replay of the misses is not a first try, so a Sure that was told the answer is not counted", async ({
  page,
}) => {
  await playChapter(page, "full-run");
  await button(page, SURE).click();
  await missMulti(page, multi);
  await next(page);
  await gotRecall(page);
  await next(page);
  await button(page, "Save for later").click();
  await playBoss(page, { right: true });
  await next(page);
  await seen(line(page), "On first tries: Sure 0 of 1 right.");
  await button(page, "Replay the misses").click();
  await button(page, SURE).click();
  await rightMulti(page);
  await next(page);
  await expect(page.getByText("best run of")).toBeVisible();
  await expect(line(page)).toHaveCount(0); // the only Sure in this run was at a question already answered
});

test("with no confidence chosen there is no calibration line", async ({ page }) => {
  await playChapter(page, "full-run");
  await rightMulti(page);
  await next(page);
  await gotRecall(page);
  await next(page);
  await playBoss(page, { right: true });
  await next(page);
  await expect(page.getByText("best run of")).toBeVisible();
  await expect(line(page)).toHaveCount(0);
});

// The results screen with its line, at 375 px in each colour scheme: it wraps inside the card and axe finds nothing.
for (const scheme of ["light", "dark"]) {
  test(`at 375 px in ${scheme} mode the calibration line fits and the results pass the accessibility check`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 1000 });
    await playChapter(page, "full-run");
    await button(page, SURE).click();
    await rightMulti(page);
    await next(page);
    await gotRecall(page);
    await next(page);
    await button(page, GUESS).click();
    await playBoss(page, { right: false });
    await next(page);
    await seen(line(page), "On first tries: Sure 1 of 1 right · Guess 0 of 1 right.");
    // It sits under the stats and above the next action, and wraps inside its box instead of running past it.
    await expect(line(page).locator("xpath=preceding-sibling::*[1]")).toContainText("best run of");
    await expect(line(page).locator("xpath=following-sibling::*[1]")).toHaveText("▶️ One next action");
    expect(await line(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    );
    const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
    expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    await testInfo.attach(`calibration-${scheme}-375`, {
      body: await page.locator(".card").screenshot(),
      contentType: "image/png",
    });
  });
}
