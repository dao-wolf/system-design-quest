// A recall question that has key points, as the player meets it: commit an answer first (typed, or said aloud), see the
// principle and one way to say it, then tick the key points that answer covered. The ticks set the points by the
// same rule as every other question. A recall without key points keeps its four buttons. Played on the fixture host.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, playChapter, seen } from "./helpers.mjs";

const [kp] = chapter("drill-keypoints").challenges; // understand, worth 15, three key points
const LOCK = "Lock in my answer, then show the model";
const ANSWER = "Reads come from memory, so they are quicker.";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const box = (page) => page.getByPlaceholder(/Type your answer/);
async function lockAndTick(page, places) {
  await box(page).fill(ANSWER);
  await button(page, LOCK).click();
  for (const i of places) await page.getByRole("checkbox", { name: kp.key_points[i] }).check();
  await button(page, "Score it").click();
}

test("the answer is locked in first: not empty, not a few letters, and not changed afterwards", async ({ page }) => {
  await playChapter(page, "drill-keypoints");
  await expect(button(page, LOCK)).toBeDisabled();
  await box(page).fill("too short"); // nine characters
  await expect(button(page, LOCK)).toBeDisabled();
  await box(page).fill("          "); // spaces are not an answer
  await expect(button(page, LOCK)).toBeDisabled();
  await box(page).fill("ten chars!"); // ten is enough
  await expect(button(page, LOCK)).toBeEnabled();
  await box(page).fill(ANSWER);
  await box(page).fill("");
  await page.getByRole("checkbox", { name: "I said it out loud" }).check();
  await expect(button(page, LOCK)).toBeEnabled(); // spoken answers have no text to count
  await button(page, LOCK).click();
  await seen(page.getByText("Locked: your answer can't change now."), "Locked: your answer can't change now.");
  await expect(box(page)).toBeDisabled();
  await expect(button(page, LOCK)).toBeDisabled(); // a second press cannot add a second answer
  await expect(page.getByRole("checkbox", { name: "I said it out loud" })).toBeDisabled();
  await expect(page.getByRole("status")).toBeFocused(); // the pressed button is gone: the page says what happened
  await expect(page.getByRole("group", { name: /Tick the key points/ })).toBeVisible();
  await expect(button(page, "✅ Got it")).toHaveCount(0); // the four grade buttons are gone for these questions
});

test("the principle comes first, then one way to say it, then the key points to tick", async ({ page }) => {
  await playChapter(page, "drill-keypoints");
  await box(page).fill(ANSWER);
  await button(page, LOCK).click();
  await expect(page.locator(".answerbox")).toHaveText([`The idea: ${kp.principle}`, `One way to say it: ${kp.answer}`]);
  await expect(page.getByText("Tick the key points your answer covered. They set your points.")).toBeVisible();
  await expect(page.locator(".options input[type=checkbox]")).toHaveCount(kp.key_points.length);
});

test("the ticks set the points by the same rule: two of three pays, one of three is under the pass mark", async ({
  page,
}) => {
  await playChapter(page, "drill-keypoints");
  await lockAndTick(page, [0, 1]);
  await seen(page.locator(".feedback .plus"), "+10 of 15");
  await seen(page.locator(".feedback .receipt .sum"), "Understand 15 × 2 of 3 key points = +10");
  await expect(page.locator(".feedback .coverage ul").nth(1).locator("li")).toHaveText([kp.key_points[2]]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")).at(-1));
  expect(saved.response).toEqual({ ticked: [0, 1], text: ANSWER }); // what was typed and ticked is kept

  await playChapter(page, "drill-keypoints");
  await lockAndTick(page, [2]);
  await seen(page.locator(".feedback .plus"), "+0 of 15");
  await expect(page.locator(".feedback .receipt")).toContainText("Needed to score: 2 of 3 key points");

  await playChapter(page, "drill-keypoints");
  await lockAndTick(page, [0, 1, 2]);
  await expect(page.locator(".feedback .verdict")).toContainText("✅ Right");
  await seen(page.locator(".feedback .plus"), "+15");
});

test("a key-point recall without a principle shows no principle box and no stray words", async ({ page }) => {
  await playChapter(page, "drill-keypoints");
  await lockAndTick(page, [0, 1, 2]); // all right, so no hand-off before the boss
  await button(page, "Next ▶").click(); // the boss has key points and no principle
  await box(page).fill(ANSWER);
  await button(page, LOCK).click();
  await expect(page.locator(".answerbox")).toHaveText([
    `One way to say it: ${chapter("drill-keypoints").challenges[1].answer}`,
  ]);
  await expect(page.locator(".card.challenge")).not.toContainText("null");
  await expect(page.locator(".card.challenge")).not.toContainText("undefined");
});

test("a recall without key points keeps its four buttons", async ({ page }) => {
  await playChapter(page, "drill-recall");
  await button(page, "Show the answer").click();
  for (const grade of ["❌ Missed it", "🟡 Partly", "✅ Got it", "⚡ Easy"])
    await expect(button(page, grade)).toBeVisible();
});

// The locked card with its ticks, at 375 px in each colour scheme: nothing runs off the page and axe finds nothing.
for (const scheme of ["light", "dark"]) {
  test(`at 375 px in ${scheme} mode the locked card and its key points fit and pass the accessibility check`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 375, height: 1100 });
    await playChapter(page, "drill-keypoints");
    await box(page).fill(ANSWER);
    await button(page, LOCK).click();
    await page.getByRole("checkbox", { name: kp.key_points[0] }).check();
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(
      true,
    );
    const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
    expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    await testInfo.attach(`recall-points-${scheme}-375`, {
      body: await page.locator(".card.challenge").screenshot(),
      contentType: "image/png",
    });
  });
}
