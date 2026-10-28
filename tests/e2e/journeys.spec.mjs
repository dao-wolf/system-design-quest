// What a player does, from the outside: the built element on a host page, under a strict CSP.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

const bundle = JSON.parse(readFileSync("dist/chapters.json", "utf8"));
const quest1 = bundle.chapters.find((c) => c.kind === "quest");
const quest1Boss = quest1.challenges.find((c) => c.id === quest1.boss);

// Every request the page makes, so a journey can prove nothing leaves the browser.
function recordRequests(page) {
  const seen = [];
  page.on("request", (r) => seen.push({ method: r.method(), url: r.url(), body: r.postData() ?? "" }));
  return seen;
}
const cardFor = (page, title) =>
  page.locator(".chapter", { has: page.getByRole("heading", { name: title, exact: true }) });

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
  page.on("dialog", (d) => d.accept());
});

test("a new player sees the training chapters and the quests, with nothing to fill in first", async ({ page }) => {
  const requests = recordRequests(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your quest map" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Training/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Quests/ })).toBeVisible();
  await expect(cardFor(page, quest1.title).getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.getByText("Optional: the game works the same without it")).toBeVisible();
  expect(requests.every((r) => r.method === "GET" && r.url.startsWith("http://127.0.0.1:4181/"))).toBe(true);

  const axe = await new AxeBuilder({ page }).include("system-design-quest").analyze();
  expect(axe.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});

test("the profile stays in the browser and drives the countdown", async ({ page }) => {
  const requests = recordRequests(page);
  await page.goto("/");
  await page.getByRole("button", { name: "👤 You" }).click();
  await page.getByPlaceholder("For example, Acme").fill("Zebracorp");
  const inFive = new Date(Date.now() + 5 * 86400000);
  const date = `${inFive.getFullYear()}-${String(inFive.getMonth() + 1).padStart(2, "0")}-${String(inFive.getDate()).padStart(2, "0")}`;
  await page.locator("input[type=date]").first().fill(date);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("5 days to Zebracorp")).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem("sdq-profile-v1"));
  expect(JSON.parse(stored)).toMatchObject({ company: "Zebracorp", interview_date: date });
  expect(requests.some((r) => r.url.includes("Zebracorp") || r.body.includes("Zebracorp"))).toBe(false);
  expect(requests.every((r) => r.method === "GET")).toBe(true);
});

test("a player who knows a quest can beat its boss cold", async ({ page }) => {
  await page.goto("/");
  await cardFor(page, quest1.title)
    .getByRole("button", { name: /Try the boss now/ })
    .click();
  await page.getByRole("button", { name: quest1Boss.choices[quest1Boss.correct], exact: true }).click();
  await page.getByRole("button", { name: quest1Boss.reasons[quest1Boss.reason], exact: true }).click();
  await page.getByRole("button", { name: quest1Boss.costs[quest1Boss.cost], exact: true }).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByText("Boss beaten!")).toBeVisible();
});

test("a locked chapter can be played by choice, and stays open", async ({ page }) => {
  await page.goto("/");
  const locked = bundle.chapters.find((c) => c.chapter === 3);
  await cardFor(page, locked.title).getByRole("button", { name: "Jump in anyway" }).click();
  await expect(page.locator(".runbar")).toContainText(locked.title);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(cardFor(page, locked.title).getByRole("button", { name: "Play" })).toBeVisible();
});

// A host page with its own fixed header (daowolf.com's menu button) sets --sticky-top, and the bar sticks below it.
// Without it, the bar sticks to the top of the window.
test("the game's top bar sticks at the host page's --sticky-top offset, or at the top", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your quest map" })).toBeVisible();
  const barTop = () => page.locator("header.top").evaluate((el) => el.getBoundingClientRect().top);
  const setStickyTop = (value) =>
    page.locator("html").evaluate((html, v) => html.style.setProperty("--sticky-top", v), value);
  await page.evaluate(() => globalThis.scrollTo({ top: 600, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => globalThis.scrollY)).toBeGreaterThan(300);
  await setStickyTop("initial"); // as if the host page never set it
  await expect.poll(barTop).toBe(0);
  await setStickyTop("48px");
  await expect.poll(barTop).toBe(48);
});

// daowolf.com puts the game in a flex column with 24px gutters (fixtures/site.css). On a phone that column must stay the screen's width:
// the top bar fits the game, never the other way round.
test("on a phone the game fits a host page's flex column, top bar included", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your quest map" })).toBeVisible();
  await expect.poll(() => page.locator("main").evaluate((main) => main.getBoundingClientRect().width)).toBe(375);
  expect(await page.locator("header.top").evaluate((bar) => bar.scrollWidth <= bar.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "👤 You" })).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".stat .short")).toHaveText("/5");
});

// The bar shortens by the game's own width, not the window's: a narrow column on a wide screen (daowolf.com between
// 769px and 1000px) gets the icon-only title instead of one wrapped over three lines.
test("in a narrow column the top bar shortens by the game's width, not the window's", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your quest map" })).toBeVisible();
  await expect(page.locator(".brand span")).toBeVisible();
  await expect(page.locator(".stat .short")).toBeHidden();
  await page.locator("main").evaluate((main) => Object.assign(main.style, { flex: "none", width: "448px" }));
  await expect(page.locator(".brand span")).toBeHidden();
  await expect(page.locator(".stat .short")).toHaveText("/5");
});

// A new screen scrolls the game's top back into view. On a host page with its own header, it must stop at
// --sticky-top, so the run's bar lands below the game's stuck top bar instead of under it. On a phone, where the
// challenge is taller than the screen. And at once, though daowolf.com scrolls smoothly: checked straight after the
// click, not polled, so the next tap never lands on a screen that's still moving.
test("a new screen scrolls back to the game's top, below the host page's header", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your quest map" })).toBeVisible();
  await cardFor(page, quest1.title).getByRole("button", { name: "Play" }).click();
  await expect(page.locator(".runbar")).toBeVisible();
  const gap = () =>
    page.locator("header.top").evaluate((bar) => {
      const runbar = bar.getRootNode().querySelector(".runbar");
      return runbar.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
    });
  expect(await gap()).toBeGreaterThanOrEqual(0);

  // Also when the game's top is only partly under the header.
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await page
    .locator("system-design-quest")
    .evaluate((host) => globalThis.scrollBy({ top: host.getBoundingClientRect().top - 20, behavior: "instant" }));
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await expect(page.locator(".runbar")).toBeVisible();
  expect(await gap()).toBeGreaterThanOrEqual(0);
});
