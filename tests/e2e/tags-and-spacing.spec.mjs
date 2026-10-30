// The question's tags and the quest map's spacing, from the player's side: the tags can be read, the Bloom tag
// explains itself, and icons keep a gap from the words beside them.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { chapter, playChapter } from "./helpers.mjs";

const LADDER = "Levels go remember, understand, apply, analyse, evaluate, create.";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const seriousViolations = async (page) => {
  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  return axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
};
const fits = (page) => page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth);

test("the Bloom tag explains its level and the whole ladder, and looks like it has more to read", async ({ page }) => {
  await playChapter(page, "drill-multi"); // understand
  const bloom = page.locator(".kind .pill.bloom");
  await expect(bloom).toHaveText("understand");
  await expect(bloom).toHaveAttribute("title", new RegExp(`^Understand: .+\\. ${LADDER}$`));
  await expect(bloom).toHaveCSS("text-decoration-style", "dotted");
  await expect(page.locator(".kind .pill:not(.bloom)").first()).not.toHaveCSS("text-decoration-style", "dotted");
});

test("the Bloom tag for remember says what the notes asked for", async ({ page }) => {
  await playChapter(page, "drill-recall");
  await expect(page.locator(".kind .pill.bloom")).toHaveAttribute("title", `Remember: recall the fact. ${LADDER}`);
});

test("on a phone the tags fit, are at least 13px, and pass the accessibility check", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await playChapter(page, "full-run");
  await expect(page.locator(".kind .pill").first()).toBeVisible();
  for (const pill of await page.locator(".kind .pill").all()) {
    expect(await pill.evaluate((el) => parseFloat(globalThis.getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(
      13,
    );
  }
  expect(await fits(page)).toBe(true);
  expect(await seriousViolations(page)).toEqual([]);
});

// The gap between an icon and the words after it, measured from the icon's right edge to the first letter.
async function gapAfterIcon(icon) {
  return icon.evaluate((el) => {
    const range = globalThis.document.createRange();
    range.setStart(el.nextSibling, 0);
    range.setEnd(el.nextSibling, 1);
    return range.getBoundingClientRect().left - el.getBoundingClientRect().right;
  });
}

for (const [width, label] of [
  [1000, "a laptop"],
  [375, "a phone"],
]) {
  test(`on ${label} the map keeps a gap between icons and their titles, and nothing overflows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/types/");
    const nextUp = page.locator(".next-up");
    await expect(nextUp).toContainText(chapter("drill-recall").title);
    for (const icon of await page.locator(".next-up .icon, h2.section .icon, .hero .icon").all()) {
      expect(await gapAfterIcon(icon)).toBeGreaterThanOrEqual(8);
    }
    const padding = (sel) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => parseFloat(globalThis.getComputedStyle(el).paddingLeft));
    expect(await padding(".chapter")).toBeGreaterThanOrEqual(width > 600 ? 22 : 16); // a phone keeps its tighter cards
    expect(await fits(page)).toBe(true);
    expect(await seriousViolations(page)).toEqual([]);
  });
}
