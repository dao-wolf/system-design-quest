// Shared by the journeys that play the fixture chapters (tests/e2e/fixtures/chapters.json) on the /types/ host page.
import { readFileSync } from "node:fs";

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
