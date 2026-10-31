// The game beside the local coach server (tools/serve.py --state). The tests answer the page's /api/ requests
// exactly as serve.py does, with one challenge the coach has set. A coach's challenge is written fresh, so it's in
// no chapter's list, and the coach may give it no chapter at all.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const bundle = JSON.parse(readFileSync("dist/chapters.json", "utf8"));
const challenge = {
  id: "coach-queues",
  type: "multi",
  bloom: "understand",
  prompt: "Which of these are message queues?",
  options: ["Kafka", "Redis Cluster", "Amazon SQS", "PostgreSQL"],
  correct: [0, 2],
  explain: "Kafka and SQS hold messages until a consumer takes them.",
  source: "https://kafka.apache.org/",
};

const button = (page, name) => page.getByRole("button", { name, exact: true });

// serve.py's answers: GETs read the state files, POSTs append to them.
function localCoachServer(page, assigned) {
  const answers = {
    "/api/health": { ok: true, coach: true },
    "/api/events": [],
    "/api/coach": { next: 0, messages: [] },
    "/api/assigned": [assigned],
    "/api/profile": {},
    "/api/holds": [],
  };
  return page.route("**/api/**", (route) => {
    const isPost = route.request().method() === "POST";
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: isPost ? { ok: true } : answers[path] });
  });
}

async function missIt(page) {
  for (const i of [1, 3]) await button(page, challenge.options[i]).click();
  await button(page, "Check").click();
  await expect(page.locator(".feedback .verdict")).toContainText("❌ Not this time");
  await button(page, "Next ▶").click();
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

const PLACES = [
  ["no chapter", null],
  ["a chapter", bundle.chapters[0].chapter],
];

for (const [place, chapter] of PLACES) {
  test(`a missed coach's challenge with ${place} shows the results and replays on its own`, async ({ page }) => {
    await localCoachServer(page, { ts: "2026-10-28T12:00:00Z", chapter, why: "A fresh scenario", challenge });
    await page.goto("/coach/");
    await expect(page.locator("#coach")).toBeVisible(); // hidden stays hidden without a coach, but shows with one
    await button(page, "Play it").click();
    await expect(page.locator(".challenge .prompt")).toHaveText(challenge.prompt);

    await missIt(page);

    await expect(page.getByText("Not fully right first time:")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: challenge.prompt })).toBeVisible();
    await button(page, "Replay the misses").click();
    await expect(page.locator(".kind")).toContainText("🎯 Coach's challenge");
    await expect(page.locator(".challenge .prompt")).toHaveText(challenge.prompt);
  });
}
