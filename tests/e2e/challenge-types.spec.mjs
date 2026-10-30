// Every challenge type, played from the outside: reached, answered and given feedback. The built element runs on
// its own host page (/types/) under the same strict CSP, with a fixture chapters.json (tests/e2e/fixtures/) that has
// one chapter for each type and a full run, so every answer is known in advance.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("tests/e2e/fixtures/chapters.json", "utf8"));
const chapter = (slug) => fixture.chapters.find((c) => c.slug === slug);

const TYPE_LABEL = {
  recall: "🃏 Recall",
  multi: "☑️ Pick all that apply",
  duel: "⚖️ Trade-off duel",
  write: "✍️ Write it",
  estimate: "🔢 Estimate",
  fill: "🧩 Fill the diagram",
  sticker: "🏷️ Sticker the diagram",
  flaw: "🔍 Spot the flaw",
  order: "↕️ Put it in order",
  lightning: "⚡ Lightning round",
  sprint: "⏱️ Sprint",
};

const button = (page, name) => page.getByRole("button", { name, exact: true });
const cardFor = (page, title) =>
  page.locator(".chapter", { has: page.getByRole("heading", { name: title, exact: true }) });
// A box in the challenge's diagram, by its node id (the boxes are drawn in the order the diagram lists them).
const box = (page, c, id) => page.locator("svg.diagram g.node").nth(c.diagram.nodes.findIndex((n) => n.id === id));

async function playChapter(page, ch) {
  await page.goto("/types/");
  await cardFor(page, ch.title).getByRole("button", { name: "Play" }).click();
}

// How a player who knows the answer plays each type.
const ANSWER = {
  async recall(page) {
    await button(page, "Show the answer").click();
    await button(page, "✅ Got it").click();
  },
  async multi(page, c) {
    for (const i of c.correct) await button(page, c.options[i]).click();
    await button(page, "Check").click();
  },
  async duel(page, c) {
    await button(page, c.choices[c.correct]).click();
    await button(page, c.reasons[c.reason]).click();
    await button(page, c.costs[c.cost]).click();
    await button(page, "Check").click();
  },
  async write(page, c) {
    await page.getByPlaceholder("Write your answer").fill("Ten million uploads a day, and 200 ms to load a photo.");
    await button(page, "Done: show the key points").click();
    for (const point of c.key_points) await page.getByRole("checkbox", { name: point }).check();
    await button(page, "Score it").click();
  },
  async estimate(page) {
    // 1 million people × 10 actions = 10 million a day; ÷ 100,000 = 100 a second; × 10 at the peak = 1,000.
    await expect(page.getByText("1 million people each do 10 actions a day")).toBeVisible();
    await page.getByPlaceholder(/Your estimate/).fill("1000");
    await button(page, "Check").click();
    await expect(page.getByText("Worked:")).toBeVisible();
  },
  async fill(page, c) {
    for (const [id, label] of Object.entries(c.slots)) {
      await button(page, label).click();
      await box(page, c, id).click();
    }
    await button(page, "Check").click();
  },
  async sticker(page, c) {
    for (const [id, stickers] of Object.entries(c.answers))
      for (const s of stickers) {
        await button(page, `🏷️ ${s}`).click();
        await box(page, c, id).click();
      }
    await button(page, "Check").click();
  },
  async flaw(page, c) {
    await box(page, c, c.flaw).click();
    await button(page, c.fixes[c.fix]).click();
    await button(page, "Check").click();
  },
  async order(page, c) {
    // The list starts shuffled: move each item up into its place with the arrows.
    const rows = page.locator(".orderlist li");
    for (const [want, item] of c.items.entries()) {
      const now = (await rows.locator(".txt").allTextContents()).indexOf(item);
      for (let at = now; at > want; at--) await rows.nth(at).getByRole("button", { name: "Move up" }).click();
    }
    await expect(rows.locator(".txt")).toHaveText(c.items);
    await button(page, "Check").click();
  },
  async lightning(page, c) {
    await button(page, `Start: ${c.seconds || 90} seconds`).click();
    const reach = Object.fromEntries(c.pairs);
    for (let i = 0; i < c.pairs.length; i++) {
      const heard = await page.locator(".lightning-q").textContent();
      await button(page, reach[heard]).click();
    }
    await expect(page.getByText(`Clean sweep: ${c.pairs.length} of ${c.pairs.length}.`)).toBeVisible();
  },
  async sprint(page, c) {
    await button(page, "Start the clock").click();
    await button(page, "I'm done").click();
    for (const check of c.checks) await page.getByRole("checkbox", { name: check }).check();
    await button(page, "Score it").click();
  },
};

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

for (const type of Object.keys(TYPE_LABEL)) {
  test(`${type}: a player reaches the challenge, answers it and gets feedback`, async ({ page }) => {
    const ch = chapter(`drill-${type}`);
    const c = ch.challenges[0];
    await playChapter(page, ch);
    await expect(page.locator(".runbar")).toContainText(ch.title);
    await expect(page.locator(".kind .pill").first()).toHaveText(TYPE_LABEL[type]);
    await expect(page.getByText(c.prompt)).toBeVisible();

    await ANSWER[type](page, c);

    const feedback = page.locator(".feedback");
    await expect(feedback.locator(".verdict")).toContainText("✅ Right");
    await expect(feedback).toContainText(c.explain);
    await button(page, "Next ▶").click();
    await expect(page.locator(".kind")).toContainText("👹 Boss");
  });
}

test("a run brings a miss back for a second chance, then the boss, then the results", async ({ page }) => {
  const ch = chapter("full-run");
  const [multi, recall, boss] = ch.challenges;
  await playChapter(page, ch);

  // Miss the first one, and flag it.
  const wrong = multi.options.map((_, i) => i).filter((i) => !multi.correct.includes(i));
  for (const i of wrong) await button(page, multi.options[i]).click();
  await button(page, "Check").click();
  await expect(page.locator(".feedback .verdict")).toContainText("❌ Not this time");
  await expect(page.getByText("It gets a second chance after this pass, for half points.")).toBeVisible();
  await button(page, "🚩 Flag").click();
  await page.getByPlaceholder("What's wrong with it?").fill("The wording is unclear");
  await button(page, "Flag it").click();
  await expect(page.getByText("Saved on this device. To send it to me,")).toBeVisible();
  await button(page, "Next ▶").click();

  await expect(page.getByText(recall.prompt)).toBeVisible();
  await ANSWER.recall(page);
  await expect(page.locator(".feedback .verdict")).toContainText("✅ Right");
  await button(page, "Next ▶").click();

  await expect(page.locator(".handoff")).toContainText("First pass done: 1 of 2 right.");
  await button(page, "Start now").click();
  await expect(page.locator(".kind")).toContainText("🔁 Second chance");
  await ANSWER.multi(page, multi);
  await expect(page.locator(".feedback .plus")).toHaveText("+8");
  await button(page, "Next ▶").click();

  await expect(page.locator(".kind")).toContainText("👹 Boss");
  await ANSWER.duel(page, boss);
  await expect(page.locator(".feedback .verdict")).toContainText("👹 Boss beaten!");
  await button(page, "Next ▶").click();

  // 0 for the miss, 10 for the recall, 8 for the second chance (15 halved) and 100 for the boss.
  await expect(page.getByText("+118 XP")).toBeVisible();
  await expect(page.getByText("✅ 3 of 4 right")).toBeVisible();
  await expect(page.getByText("🔥 best run of 2")).toBeVisible();
  await expect(page.getByText("Missed first time:")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: multi.prompt })).toBeVisible();
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("sdq-events-v1")));
  expect(record.filter((e) => e.kind === "answer").map((e) => e.challenge)).toEqual([
    multi.id,
    recall.id,
    multi.id,
    boss.id,
  ]);
  expect(record.some((e) => e.kind === "flag" && e.challenge === multi.id)).toBe(true);

  await button(page, "Replay the misses").click();
  await expect(page.getByText(multi.prompt)).toBeVisible();
  await button(page, "Map").click();
  await expect(page.getByText(`1 of ${fixture.chapters.length} bosses beaten.`, { exact: false })).toBeVisible();
});
