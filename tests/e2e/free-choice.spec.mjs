// Pick-all-that-apply as the player meets it: free choice from one tick up, wrong ticks cost, and each option says what
// it was worth once checked (+1, −1 or missed on a multi; a third or nothing on a duel). Played on the fixture host.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, contrastOf, playChapter, seen } from "./helpers.mjs";

const multi = chapter("drill-multi").challenges[0]; // understand, worth 15: Redis and Memcached are right
const duel = chapter("drill-duel").challenges[0];
const flaw = chapter("drill-flaw").challenges[0];
const [REDIS, POSTGRES, MEMCACHED, S3] = multi.options;

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const opt = (page, text) => page.locator("button.opt", { hasText: text });
const badge = (page, text) => opt(page, text).locator(".badge");
const tick = async (page, ...options) => {
  for (const o of options) await button(page, o).click();
};

test("Check waits for one tick, not for a number of them", async ({ page }) => {
  await playChapter(page, "drill-multi");
  await expect(button(page, "Check")).toBeDisabled();
  await expect(button(page, "Check")).toHaveAttribute("aria-describedby", "multi-hint"); // the hint is read with it
  await tick(page, REDIS);
  await expect(button(page, "Check")).toBeEnabled();
  await tick(page, REDIS); // ticked off again: nothing ticked
  await expect(button(page, "Check")).toBeDisabled();
});

test("ticking everything scores nothing, and every option says why", async ({ page }) => {
  await playChapter(page, "drill-multi");
  await tick(page, REDIS, POSTGRES, MEMCACHED, S3);
  await button(page, "Check").click();
  await expect(page.locator(".feedback.wrong .verdict")).toContainText("❌ Not this time");
  await seen(page.locator(".feedback .plus"), "+0 of 15");
  await expect(page.getByText("They are picks, not points.")).toBeVisible(); // so "+1" beside "+0" is not a contradiction
  await expect(page.getByRole("button", { name: /Redis.*mark: \+1/ })).toBeVisible(); // a screen reader hears it as a mark
  for (const [text, mark] of [
    [REDIS, "+1"],
    [MEMCACHED, "+1"],
    [POSTGRES, "−1"],
    [S3, "−1"],
  ])
    await seen(badge(page, text), mark);
});

test("a right option left out says missed, and an option not ticked that was wrong says nothing", async ({ page }) => {
  await playChapter(page, "drill-multi");
  await tick(page, REDIS);
  await button(page, "Check").click();
  await expect(page.locator(".feedback.part .verdict")).toContainText("🟡 Partly");
  await seen(badge(page, REDIS), "+1");
  await seen(badge(page, MEMCACHED), "missed");
  await expect(badge(page, POSTGRES)).toHaveCount(0);
  await expect(badge(page, S3)).toHaveCount(0);
});

test("a duel marks a third for each part right, nothing for a wrong pick, and missed for the right one left", async ({
  page,
}) => {
  await playChapter(page, "drill-duel");
  await tick(page, duel.choices[duel.correct], duel.reasons[duel.reason], duel.costs[0]); // the cost is wrong
  await button(page, "Check").click();
  await seen(badge(page, duel.choices[duel.correct]), "⅓");
  await seen(badge(page, duel.reasons[duel.reason]), "⅓");
  await seen(badge(page, duel.costs[0]), "0");
  await seen(badge(page, duel.costs[duel.cost]), "missed");
});

test("a flaw question marks its options right or wrong but gives them no badges", async ({ page }) => {
  await playChapter(page, "drill-flaw");
  const node = flaw.diagram.nodes.findIndex((n) => n.id === flaw.flaw);
  await page.locator("svg.diagram g.node").nth(node).click();
  await button(page, flaw.fixes[flaw.fix]).click();
  await button(page, "Check").click();
  await expect(page.locator(".feedback .verdict")).toBeVisible();
  await expect(page.locator(".opt .badge")).toHaveCount(0);
});

// The marks at 375 px, in both colour schemes: they stay inside their options, nothing runs off the page, axe is clean.
for (const scheme of ["light", "dark"]) {
  test(`at 375 px in ${scheme} mode the marks fit inside their options and pass the accessibility check`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 900 });
    await playChapter(page, "drill-multi");
    await tick(page, REDIS, POSTGRES, S3);
    await button(page, "Check").click();
    await seen(badge(page, S3), "−1");
    for (const o of await page.locator("button.opt").all()) {
      const [box, mark] = await Promise.all([o.boundingBox(), o.locator(".badge").boundingBox()]);
      if (mark) {
        expect(mark.x + mark.width).toBeLessThanOrEqual(box.x + box.width);
        expect(mark.x + mark.width).toBeGreaterThan(box.x + box.width - 24); // pushed to the right edge
      }
    }
    expect(await contrastOf(badge(page, S3))).toBeGreaterThanOrEqual(4.5); // axe skips disabled buttons
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    );
    await page.locator(".feedback .plus").evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
    expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    await testInfo.attach(`marks-${scheme}-375`, {
      body: await page.locator(".challenge").screenshot(),
      contentType: "image/png",
    });
  });
}
