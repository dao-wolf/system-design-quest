// A run from the player's side: where they are in it, the hand-off to the second chances, how a lightning round ends,
// which rating they chose, and what happens to a streak. Played on the fixture host (/types/).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { button, chapter, missMulti, playChapter } from "./helpers.mjs";

const [multi, recall, boss] = chapter("full-run").challenges;
const lightning = chapter("drill-lightning").challenges[0];

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

const rating = (page, name) => button(page, name);
const next = (page) => button(page, "Next ▶").click();
const missRecall = async (page) => {
  await button(page, "Show the answer").click();
  await rating(page, "❌ Missed it").click();
};
const gotRecall = async (page) => {
  await button(page, "Show the answer").click();
  await rating(page, "✅ Got it").click();
};

test("a run says where you are: 1 of 2, 2 of 2, then the boss", async ({ page }) => {
  await playChapter(page, "full-run");
  await expect(page.locator(".runbar")).toContainText("1 of 2");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await next(page);
  await expect(page.locator(".runbar")).toContainText("2 of 2");
  await gotRecall(page);
  await next(page);
  await expect(page.locator(".handoff")).toHaveCount(0); // nothing missed: no hand-off
  await expect(page.locator(".kind")).toContainText("👹 Boss");
  await expect(page.locator(".runbar")).toContainText("Boss");
});

test("the first pass hands over to the second chances: how it went, what is next, and a choice", async ({ page }) => {
  await playChapter(page, "full-run");
  await missMulti(page, multi);
  await expect(page.getByText("It gets a second chance after this pass, for half points.")).toBeVisible();
  await next(page);
  await missRecall(page);
  await next(page);

  const card = page.locator(".handoff");
  await expect(card).toBeVisible();
  await expect(card).toContainText("First pass done: 0 of 2 right.");
  await expect(card.getByRole("heading")).toBeFocused();
  await expect(card).toContainText("2 second chances next, for half points");
  await expect(card.getByRole("listitem")).toHaveText([multi.prompt, recall.prompt]);
  await expect(page.locator(".kind")).toHaveCount(0); // no challenge until the player says go

  await button(page, "Start now").click();
  await expect(page.locator(".runbar")).toContainText("Second chance 1 of 2");
  await expect(page.locator(".kind")).toContainText("🔁 Second chance · half points");
  await expect(page.getByText(multi.prompt)).toBeVisible();
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await expect(page.locator(".feedback .plus")).toHaveText("+8");
  await next(page);
  await expect(page.locator(".runbar")).toContainText("Second chance 2 of 2");
});

test("Save for later skips the second chances: the boss comes next and the misses wait on the results", async ({
  page,
}) => {
  await playChapter(page, "full-run");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await next(page);
  await missRecall(page);
  await next(page);
  await expect(page.locator(".handoff")).toContainText("First pass done: 1 of 2 right.");
  await expect(page.locator(".handoff")).toContainText("1 second chance next");

  await button(page, "Save for later").click();
  await expect(page.locator(".kind")).toContainText("👹 Boss");
  await button(page, boss.choices[boss.correct]).click();
  await button(page, boss.reasons[boss.reason]).click();
  await button(page, boss.costs[boss.cost]).click();
  await button(page, "Check").click();
  await next(page);

  await expect(page.getByText("Missed first time:")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: recall.prompt })).toBeVisible();
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")));
  expect(record.filter((e) => e.kind === "answer" && e.second_chance)).toHaveLength(0);
});

test("a miss that ends a streak says so gently, with the best of the run", async ({ page }) => {
  await playChapter(page, "full-run");
  for (const i of multi.correct) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await next(page);
  await gotRecall(page);
  await next(page);
  const wrong = (list, right) => list.findIndex((_, i) => i !== right);
  await button(page, boss.choices[wrong(boss.choices, boss.correct)]).click();
  await button(page, boss.reasons[wrong(boss.reasons, boss.reason)]).click();
  await button(page, boss.costs[wrong(boss.costs, boss.cost)]).click();
  await button(page, "Check").click();
  await expect(page.locator(".feedback")).toContainText("Streak reset, best this run: 2.");
  await expect(page.locator(".feedback")).not.toContainText("second chance"); // a boss miss does not come back
});

test("the rating you chose stays marked, and the others are marked as not chosen", async ({ page }) => {
  await playChapter(page, "drill-recall");
  await button(page, "Show the answer").click();
  await expect(rating(page, "⚡ Easy")).not.toHaveAttribute("aria-pressed", /.*/); // a choice, not a toggle, until made
  await rating(page, "⚡ Easy").click();
  // Chosen, it carries a tick, so its name is now "✓ ⚡ Easy".
  const chosen = page.getByRole("button", { name: /✓ ⚡ Easy/ });
  await expect(chosen).toHaveAttribute("aria-pressed", "true");
  for (const other of ["❌ Missed it", "🟡 Partly", "✅ Got it"]) {
    await expect(rating(page, other)).toHaveAttribute("aria-pressed", "false");
  }
  // Every rating is switched off once chosen, but only the chosen one stays at full strength.
  const opacity = (locator) => locator.evaluate((el) => globalThis.getComputedStyle(el).opacity);
  expect(await opacity(chosen)).toBe("1");
  expect(Number(await opacity(rating(page, "✅ Got it")))).toBeLessThan(1);
});

test("a lightning round that ends on the last question shows the time it took and marks the right answer", async ({
  page,
}) => {
  await page.clock.install();
  await playChapter(page, "drill-lightning");
  await button(page, `Start: ${lightning.seconds || 90} seconds`).click();
  await page.clock.runFor(7000);
  const reach = Object.fromEntries(lightning.pairs);
  for (let i = 0; i < lightning.pairs.length - 1; i++) {
    await button(page, reach[await page.locator(".lightning-q").textContent()]).click();
  }
  // The last one, answered wrong on purpose: the right option is shown, and so is the wrong pick.
  const heard = (await page.locator(".lightning-q").textContent()) ?? "";
  const options = page.locator(".options .opt");
  const wrongOption = options.filter({ hasNotText: reach[heard] }).first();
  const wrongText = await wrongOption.textContent();
  await wrongOption.click();

  await expect(page.locator(".options .opt.missed")).toHaveText(reach[heard]);
  await expect(page.locator(".options .opt.wrong")).toHaveText(wrongText ?? "");
  const timer = page.locator(".timer");
  await expect(timer).toHaveText("✅ Done in 7s");
  const done = await timer.textContent();
  await page.clock.runFor(5000);
  await expect(timer).toHaveText(done ?? "");
});

test("a lightning round that runs out of time says so", async ({ page }) => {
  await page.clock.install();
  await playChapter(page, "drill-lightning");
  await button(page, `Start: ${lightning.seconds || 90} seconds`).click();
  await page.clock.runFor(((lightning.seconds || 90) + 1) * 1000);
  await expect(page.locator(".timer")).toHaveText("⏱️ Time's up");
});

test("a pick-all-that-apply question does not give the number to pick, and says when Check unlocks", async ({
  page,
}) => {
  await playChapter(page, "drill-multi");
  await expect(page.locator(".kind .pill").first()).toHaveText("☑️ Pick all that apply");
  await expect(page.getByText(/Pick \d+\./)).toHaveCount(0);
  await expect(
    page.getByText("Tick them, then Check. Check unlocks when you have ticked the right number."),
  ).toBeVisible();
});

test("the empty rounded bar under the card is gone when no coach is running", async ({ page }) => {
  await playChapter(page, "drill-recall");
  await expect(page.locator("#coach")).toBeHidden();
});

// The hand-off, the run bar's labels and the marked rating, on a phone: nothing overflows and axe finds nothing serious.
test("on a phone the hand-off, the second-chance bar and the chosen rating fit and pass the accessibility check", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const fits = () => page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth);
  const seriousViolations = async () => {
    const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
    return axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  };
  await playChapter(page, "full-run");
  await missMulti(page, multi);
  await next(page);
  await missRecall(page);
  expect(await seriousViolations()).toEqual([]); // the rating chosen, all four switched off
  await next(page);

  await expect(button(page, "Start now")).toBeInViewport({ ratio: 1 });
  await expect(button(page, "Save for later")).toBeInViewport({ ratio: 1 });
  expect(await fits()).toBe(true);
  expect(await seriousViolations()).toEqual([]);

  await button(page, "Start now").click();
  await expect(page.locator(".runbar")).toContainText("Second chance 1 of 2");
  await expect(page.locator(".kind")).toContainText("🔁 Second chance · half points");
  expect(await fits()).toBe(true);
  expect(await seriousViolations()).toEqual([]);
});

test("a miss in the second chance does not promise another, and a first miss does not reset a streak", async ({
  page,
}) => {
  await playChapter(page, "full-run");
  await missMulti(page, multi);
  await expect(page.locator(".feedback")).not.toContainText("Streak reset");
  await next(page);
  await missRecall(page);
  await next(page);
  await button(page, "Start now").click();
  await missMulti(page, multi);
  await expect(page.locator(".feedback .verdict")).toContainText("❌ Not this time");
  await expect(page.locator(".feedback")).not.toContainText("second chance after this pass");
  await expect(page.locator(".feedback")).not.toContainText("Streak reset");
});

test("a replay of the misses that misses again hands over too, and Save for later ends on the results", async ({
  page,
}) => {
  await playChapter(page, "full-run");
  await missMulti(page, multi);
  await next(page);
  await gotRecall(page);
  await next(page);
  await button(page, "Save for later").click(); // the boss, then the results
  await button(page, boss.choices[boss.correct]).click();
  await button(page, boss.reasons[boss.reason]).click();
  await button(page, boss.costs[boss.cost]).click();
  await button(page, "Check").click();
  await next(page);
  await button(page, "Replay the misses").click(); // a run of one, with no boss
  await expect(page.locator(".runbar")).toContainText("1 of 1");
  await missMulti(page, multi);
  await next(page);
  await expect(page.locator(".handoff")).toContainText("First pass done: 0 of 1 right.");
  await button(page, "Save for later").click();
  await expect(page.getByText("Missed first time:")).toBeVisible();
  await expect(page.locator(".kind")).toHaveCount(0);
});

test("a long first pass lists the first five misses and counts the rest", async ({ page }) => {
  await playChapter(page, "long-pass");
  for (let i = 0; i < 6; i++) {
    await missRecall(page);
    await next(page);
  }
  const card = page.locator(".handoff");
  await expect(card).toContainText("First pass done: 0 of 6 right.");
  await expect(card).toContainText("6 second chances next, for half points");
  await expect(card.getByRole("listitem")).toHaveCount(6);
  await expect(card.getByRole("listitem").last()).toHaveText("and 1 more");
});
