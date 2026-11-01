// After an answer the page scrolls to the feedback, and its verdict (right, partly right, not this time) is the first
// thing to read. Moving focus to Next used to do that scrolling, by centring Next: with a feedback taller than half
// the screen, as 1.3.0's receipt made them, the verdict ended up above the top (found by daowolf.com's phone
// test). Played on the fixture host (/types/), whose header offset and smooth scrolling are daowolf.com's.
import { test, expect } from "@playwright/test";
import { button, playChapter } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

// Waits until the page has stopped scrolling: the host scrolls smoothly, so a scroll can still be under way.
async function stoppedScrolling(page) {
  let last = Number.NaN;
  await expect
    .poll(
      async () => {
        const y = await page.evaluate(() => globalThis.scrollY);
        const still = y === last;
        last = y;
        return still;
      },
      { message: "the page stops scrolling", intervals: [250] },
    )
    .toBe(true);
}

// Where the verdict is, against the game's stuck top bar above it and the bottom of the screen.
const verdictBox = (page) =>
  page.locator(".feedback .verdict").evaluate((verdict) => {
    const bar = verdict.getRootNode().querySelector("header.top");
    return {
      top: verdict.getBoundingClientRect().top,
      bottom: verdict.getBoundingClientRect().bottom,
      barBottom: bar.getBoundingClientRect().bottom,
      screen: globalThis.innerHeight,
    };
  });

async function expectVerdictInReach(page) {
  await expect(button(page, "Next ▶")).toBeFocused();
  await stoppedScrolling(page);
  const { top, bottom, barBottom, screen } = await verdictBox(page);
  expect(top, "the verdict is not under the top bar").toBeGreaterThanOrEqual(barBottom - 1);
  expect(bottom, "the verdict is above the foot of the screen").toBeLessThanOrEqual(screen);
}

// A tall phone and a short one. The feedback of the "Tall feedback drill" is about 700 px high, and Next is at its foot.
for (const [width, height] of [
  [390, 844],
  [360, 640],
]) {
  test(`on a ${width} by ${height} phone a tall feedback lands with its verdict below the top bar, and Next in focus`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await playChapter(page, "drill-tall");
    await button(page, "Check").click();
    await expectVerdictInReach(page);
  });
}

// A timed answer can run out while the player has scrolled away, so that the feedback appears above the screen.
// A host page has more below the game too (daowolf.com's footer): here, a tall block.
test("a feedback that appears above the screen is brought back, verdict first", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await playChapter(page, "drill-tall");
  await page.evaluate(() => {
    const below = globalThis.document.createElement("div");
    below.style.height = "3000px";
    globalThis.document.body.append(below);
    globalThis.scrollTo({ top: globalThis.document.body.scrollHeight, behavior: "instant" });
  });
  await stoppedScrolling(page);
  await button(page, "Check").evaluate((check) => check.click()); // a click without scrolling to the button
  await expectVerdictInReach(page);
});

// One that fits is brought up just far enough to show it all, so the question stays on screen above it as far as it can.
test("a feedback that fits the screen comes up only as far as its foot", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await playChapter(page, "drill-order");
  await button(page, "Check").click();
  await expectVerdictInReach(page);

  const foot = await page.locator(".feedback").evaluate((card) => card.getBoundingClientRect().bottom);
  const screen = await page.evaluate(() => globalThis.innerHeight);
  expect(Math.abs(foot - screen), "the foot of the feedback is the foot of the screen").toBeLessThanOrEqual(1);
});
