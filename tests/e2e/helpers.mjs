// Shared by the journeys that play the fixture chapters (tests/e2e/fixtures/chapters.json) on the /types/ host page.
import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";

export const fixture = JSON.parse(readFileSync("tests/e2e/fixtures/chapters.json", "utf8"));
export const chapter = (slug) => fixture.chapters.find((c) => c.slug === slug);

export const button = (page, name) => page.getByRole("button", { name, exact: true });
const cardFor = (page, title) =>
  page.locator(".chapter", { has: page.getByRole("heading", { name: title, exact: true }) });

export async function playChapter(page, slug) {
  await page.goto("/types/");
  await cardFor(page, chapter(slug).title).getByRole("button", { name: "Play" }).click();
}

// Answers a multi challenge wrongly: ticks only the options that are not in `correct`.
export async function missMulti(page, c) {
  const wrong = c.options.map((_, i) => i).filter((i) => !c.correct.includes(i));
  for (const i of wrong) await button(page, c.options[i]).click();
  await button(page, "Check").click();
}

// toHaveText passes on a hidden element, so check that it can be seen as well.
export async function seen(locator, text) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveText(text);
}

// The contrast ratio of an element's text on its own solid background, for the controls that axe skips (disabled ones).
export const contrastOf = (locator) =>
  locator.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const light = (css) => {
      const [r, g, b] = css
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map((v) => lin(v / 255));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [a, b] = [light(style.color), light(style.backgroundColor)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
