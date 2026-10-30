// The question's tags and the quest map's spacing, from the player's side: the tags can be read, the Bloom tag
// explains itself by hover, tap and keyboard, and icons keep a gap from the words beside them.
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
  await expect(bloom).toHaveAttribute("title", `Understand: explain it in your own words. ${LADDER}`);
  await expect(bloom).toHaveCSS("text-decoration-style", "dotted");
  await expect(page.locator(".kind .pill:not(.bloom)").first()).not.toHaveCSS("text-decoration-style", "dotted");
});

test("a tap or the keyboard opens the Bloom explanation under the tags, and closes it again", async ({ page }) => {
  await playChapter(page, "drill-recall"); // remember
  const bloom = page.getByRole("button", { name: "remember" });
  const note = page.locator(".bloom-note");
  await expect(note).toBeHidden();
  await expect(bloom).toHaveAttribute("aria-expanded", "false");

  await bloom.click();
  await expect(note).toHaveText(`Remember: recall the fact. ${LADDER}`);
  await expect(bloom).toHaveAttribute("aria-expanded", "true");
  await bloom.click();
  await expect(note).toBeHidden();

  await bloom.focus();
  await page.keyboard.press("Enter");
  await expect(note).toBeVisible();
});

test("the tags read at 7:1 or better, at 13px or more, and pass the accessibility check on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await playChapter(page, "full-run");
  const pills = page.locator(".kind .pill:not(.boss-tag)");
  expect(await pills.count()).toBeGreaterThan(1);
  for (const pill of await pills.all()) {
    const { size, ratio } = await pill.evaluate((el) => {
      const style = globalThis.getComputedStyle(el);
      const channels = (css) =>
        css
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const light = (css) => {
        const [r, g, b] = channels(css).map((v) => v / 255);
        const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const [a, b] = [light(style.color), light(style.backgroundColor)].sort((x, y) => y - x);
      return { size: parseFloat(style.fontSize), ratio: (a + 0.05) / (b + 0.05) };
    });
    expect(size).toBeGreaterThanOrEqual(13);
    expect(ratio).toBeGreaterThanOrEqual(7);
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

for (const [width, label, cardPadding] of [
  [1000, "a laptop", 22],
  [375, "a phone", 16], // a phone keeps its tighter cards
  [320, "a small phone", 16],
]) {
  test(`on ${label} the map keeps a gap between icons and their titles, and nothing overflows`, async ({ page }) => {
    await page.addInitScript(() =>
      globalThis.localStorage.setItem("sdq-profile-v1", JSON.stringify({ role: "Engineer", company: "Acme" })),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/types/");
    await expect(page.locator(".next-up")).toContainText(chapter("drill-recall").title);
    const icons = await page.locator(".next-up .icon, h2.section .icon, .hero .icon").all();
    expect(icons.length).toBeGreaterThanOrEqual(4); // the next action, its title, the profile line, a section head
    for (const icon of icons) expect(await gapAfterIcon(icon)).toBeGreaterThanOrEqual(8);
    const padding = (sel) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => parseFloat(globalThis.getComputedStyle(el).paddingLeft));
    expect(await padding(".chapter")).toBe(cardPadding);
    expect(await padding(".next-up")).toBe(width > 600 ? 24 : 16);
    expect(await fits(page)).toBe(true);
    expect(await seriousViolations(page)).toEqual([]);
  });
}
