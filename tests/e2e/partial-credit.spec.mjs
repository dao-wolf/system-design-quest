// Partial answers, from the player's side: anything from a little right to nearly all right is amber (red is for
// nothing right), the points say what a full answer would have paid, the pass mark is written out, and a written or
// timed answer lists what was covered and what to add. Played on the fixture host (/types/).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, playChapter, seen } from "./helpers.mjs";

const duel = chapter("drill-duel").challenges[0]; // evaluate, worth 40
const write = chapter("drill-write").challenges[0]; // apply, worth 20, two key points
const sprint = chapter("drill-sprint").challenges[0]; // create, worth 60, three checks
const [multi, , boss] = chapter("full-run").challenges;

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

async function answerDuel(page, c, { choice = c.correct, reason = c.reason, cost = c.cost } = {}) {
  await button(page, c.choices[choice]).click();
  await button(page, c.reasons[reason]).click();
  await button(page, c.costs[cost]).click();
  await button(page, "Check").click();
}
// Ticks the checks at these places on the sprint's list, then scores it.
async function doSprint(page, places) {
  await button(page, "Start the clock").click();
  await button(page, "I'm done").click();
  for (const i of places) await page.getByRole("checkbox", { name: sprint.checks[i] }).check();
  await button(page, "Score it").click();
}
async function doWrite(page, places) {
  await page.getByPlaceholder("Write your answer").fill("Ten million uploads a day, and 200 ms to load a photo.");
  await button(page, "Done: show the key points").click();
  for (const i of places) await page.getByRole("checkbox", { name: write.key_points[i] }).check();
  await button(page, "Score it").click();
}
const seriousViolations = async (page) => {
  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  return axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
};

test("a third right is amber, not red, and the points say what a full answer would have paid", async ({ page }) => {
  await playChapter(page, "drill-sprint");
  await doSprint(page, [0]);
  await expect(page.locator(".feedback.part .verdict")).toContainText("🟡 Partly");
  await seen(page.locator(".feedback .plus"), "+0 of 60");
  await seen(page.locator(".feedback .receipt .sum"), "Create 60 × 1 of 3 checks = +0");
  await expect(page.locator(".feedback .receipt")).toContainText("Needed to score: 2 of 3 checks");
  await page.getByText("How this was worked out").click();
  await expect(page.getByRole("cell", { name: "1 of 3 checks = 33% (50% needed to score)" })).toBeVisible();
  await button(page, "Next ▶").click();
  await expect(page.locator(".runbar .dots i.part")).toHaveCount(1); // the run's dots are amber too
});

test("nothing right is red, and it still says what was possible", async ({ page }) => {
  await playChapter(page, "drill-duel");
  await answerDuel(page, duel, { choice: 1, reason: 1, cost: 0 });
  await expect(page.locator(".feedback.wrong .verdict")).toContainText("❌ Not this time");
  await seen(page.locator(".feedback .plus"), "+0 of 40");
  await button(page, "Next ▶").click();
  await expect(page.locator(".runbar .dots i.wrong")).toHaveCount(1);
});

test("two of three is paid, and still says what a full answer would have paid", async ({ page }) => {
  await playChapter(page, "drill-duel");
  await answerDuel(page, duel, { cost: 0 });
  await seen(page.locator(".feedback .plus"), "+27 of 40");
  await expect(page.locator(".feedback .receipt .muted")).toHaveCount(0); // not short of the mark: no note
  await page.getByText("How this was worked out").click();
  await expect(page.getByRole("cell", { name: "2 of 3 parts = 67% (50% needed to score)" })).toBeVisible();
});

test("what a full answer would have paid counts the streak it would have kept", async ({ page }) => {
  await playChapter(page, "full-run");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await button(page, "Next ▶").click();
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
  await button(page, "Next ▶").click();
  await answerDuel(page, boss, { choice: 1 }); // two of three, with two right in a row behind it
  await seen(page.locator(".feedback .plus"), "+67 of 200"); // a full answer was the third in a row: ×2
});

test("a written answer lists what it covered and what to add next time; all covered adds nothing to list", async ({
  page,
}) => {
  await playChapter(page, "drill-write");
  await doWrite(page, [0]);
  const lists = page.locator(".feedback .coverage ul");
  await expect(page.locator(".feedback .coverage")).toBeVisible();
  await expect(lists.nth(0).locator("li")).toHaveText(["A scale figure"]); // what it covered, one item to a line
  await expect(lists.nth(1).locator("li")).toHaveText(["A latency target"]); // and what to add next time
  await seen(page.locator(".feedback .plus"), "+10 of 20");

  await playChapter(page, "drill-write");
  await doWrite(page, [0, 1]);
  await expect(lists).toHaveCount(1); // everything covered: nothing to add
  await expect(lists.locator("li")).toHaveText(["A scale figure", "A latency target"]);
  await expect(page.locator(".feedback .coverage")).not.toContainText("Add next time");
});

test("a sprint with nothing ticked says so, and lists everything to add", async ({ page }) => {
  await playChapter(page, "drill-sprint");
  await doSprint(page, []);
  await expect(page.locator(".feedback .coverage")).toContainText("You covered: none of them");
  await expect(page.locator(".feedback .coverage li")).toHaveText(sprint.checks);
});

// A boss counts as beaten at 80%, but the card is amber for any partial answer: it says which side of the line it is on.
async function playToBoss(page) {
  await playChapter(page, "full-run");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await button(page, "Next ▶").click();
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
  await button(page, "Next ▶").click();
}
for (const [label, answer] of [
  ["a third", { reason: 1, cost: 0 }],
  ["two thirds", { cost: 0 }],
]) {
  test(`a boss answered ${label} right says it is not beaten, and what it needs`, async ({ page }) => {
    await playToBoss(page);
    await answerDuel(page, boss, answer);
    await expect(page.locator(".feedback.part .verdict")).toContainText("🟡 Partly");
    await seen(page.locator(".feedback .boss-note"), "Not beaten yet: a boss needs 80%.");
  });
}

test("a boss answered all right is beaten and says nothing about falling short, and a question that is not a boss never does", async ({
  page,
}) => {
  await playToBoss(page);
  await answerDuel(page, boss);
  await expect(page.locator(".feedback .verdict")).toContainText("👹 Boss beaten!");
  await expect(page.locator(".feedback .boss-note")).toHaveCount(0);
  await playChapter(page, "drill-duel");
  await answerDuel(page, duel, { cost: 0 });
  await expect(page.locator(".feedback .boss-note")).toHaveCount(0);
});

// The points beside a long verdict on the narrowest phone: a boss beaten on a streak is the longest verdict there is.
test("at 320 px a long verdict and the points do not run into each other", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await playChapter(page, "full-run");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await button(page, "Next ▶").click();
  await button(page, "Show the answer").click();
  await button(page, "✅ Got it").click();
  await button(page, "Next ▶").click();
  await answerDuel(page, boss);
  await expect(page.locator(".feedback .verdict")).toContainText("👹 Boss beaten!");
  await expect(page.locator(".feedback .verdict")).toContainText("×2");
  await expect(button(page, "Next ▶")).toBeFocused(); // the feedback has scrolled itself into view by now
  const plus = await page.locator(".feedback .plus").boundingBox();
  const lines = await page.locator(".feedback .verdict").evaluate((el) => {
    const range = globalThis.document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].map(({ x, y, width, height }) => ({ x, y, width, height }));
  });
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (const line of lines) expect(overlaps(plus, line)).toBe(false);
});

// The amber card at the width of a small phone, in each colour scheme: the points keep clear of the verdict and the
// lists, nothing runs off the card, and axe finds nothing serious.
for (const scheme of ["light", "dark"]) {
  test(`at 375 px in ${scheme} mode the amber card keeps its points clear of the words and passes the accessibility check`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 900 });
    await playChapter(page, "drill-sprint");
    await doSprint(page, [0]);
    await expect(button(page, "Next ▶")).toBeFocused(); // the feedback has scrolled itself into view by now
    await page.getByText("How this was worked out").click();

    const words = (sel) =>
      page.locator(sel).evaluateAll((els) =>
        els.flatMap((el) => {
          const range = globalThis.document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].map(({ x, y, width, height }) => ({ x, y, width, height }));
        }),
      );
    const overlaps = (a, b) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    const plus = await page.locator(".feedback .plus").boundingBox();
    const lines = [".feedback .verdict", ".feedback .muted", ".feedback .receipt .sum", ".feedback .coverage"];
    for (const sel of lines) for (const line of await words(sel)) expect(overlaps(plus, line), sel).toBe(false);
    const card = await page.locator(".feedback").boundingBox();
    expect(plus.x + plus.width).toBeLessThanOrEqual(card.x + card.width);
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    );
    await page.locator(".feedback .plus").evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
    expect(await seriousViolations(page)).toEqual([]);
    await testInfo.attach(`amber-${scheme}-375`, {
      body: await page.locator(".feedback").screenshot(),
      contentType: "image/png",
    });
  });
}
