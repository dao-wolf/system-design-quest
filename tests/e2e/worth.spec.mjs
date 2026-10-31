// What a question is worth, said before the player answers: the tag reads "evaluate · worth 40" (a boss is worth 100),
// and the Sure button says it pays only when everything is right. Played on the fixture host (/types/).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, playChapter, seen } from "./helpers.mjs";

const [multi] = chapter("full-run").challenges; // understand 15, then a recall (remember 10), then a duel boss

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const bloom = (page) => page.locator(".kind .pill.bloom");

test("the tag says what the question is worth, and a boss is worth 100 whatever its tag", async ({ page }) => {
  await playChapter(page, "drill-duel");
  await seen(bloom(page), "evaluate · worth 40");
  await playChapter(page, "full-run");
  await seen(bloom(page), "understand · worth 15");
});

test("each question in a run says its worth, and the boss says 100", async ({ page }) => {
  await playChapter(page, "full-run");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await button(page, "Next ▶").click();
  await seen(bloom(page), "remember · worth 10");
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
  await button(page, "Next ▶").click();
  await expect(page.locator(".kind")).toContainText("👹 Boss");
  await seen(bloom(page), "evaluate · worth 100");
});

test("the Sure button says it pays only when all of it is right", async ({ page }) => {
  await playChapter(page, "drill-duel");
  await expect(button(page, "😎 Sure (×1.5 if all right)")).toBeVisible();
});

// The tags and the Sure button at 375 px in each colour scheme, on a boss (the most pills): they wrap inside the card,
// no pill sits on another, and axe finds nothing serious. The capture goes to the report.
for (const scheme of ["light", "dark"]) {
  test(`at 375 px in ${scheme} mode the tags wrap without overlapping and pass the accessibility check`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 900 });
    await playChapter(page, "full-run");
    for (const i of multi.correct) await button(page, multi.options[i]).click();
    await button(page, "Check").click();
    await button(page, "Next ▶").click();
    await button(page, "Show the answer").click();
    await button(page, "✅ Got it").click();
    await button(page, "Next ▶").click();
    const boxes = await page
      .locator(".kind .pill")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
    const card = await page.locator(".card.challenge").boundingBox();
    for (const b of boxes) expect(b.x + b.width).toBeLessThanOrEqual(card.x + card.width);
    for (const b of boxes) expect(b.height).toBeLessThan(40); // each tag stays on one line
    const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
    expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    await testInfo.attach(`worth-${scheme}-375`, {
      body: await page.locator(".card.challenge").screenshot(),
      contentType: "image/png",
    });
  });
}

// The countdown turns red in the last ten seconds: in the dark theme its text must still read.
test("the countdown's last ten seconds read in the dark theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.clock.install();
  await playChapter(page, "drill-lightning");
  await button(page, "Start: 90 seconds").click();
  await page.clock.runFor(81_000);
  await expect(page.locator(".timer.low")).toBeVisible();
  await page.clock.resume(); // axe needs real time
  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});
