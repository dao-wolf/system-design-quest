#!/usr/bin/env node
// summary.mjs - print a player's progress from the record, using the same engine as the page.
// Usage: node tools/summary.mjs BUNDLE.json EVENTS.jsonl [--profile PROFILE.json] [--json]
import { readFileSync, existsSync } from "node:fs";
import { progress, cleanProfile, isQuest, recommend } from "../web/engine.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const [bundlePath, eventsPath] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--profile");
if (!bundlePath || !eventsPath) {
  console.error("usage: node tools/summary.mjs BUNDLE.json EVENTS.jsonl [--profile PROFILE.json] [--json]");
  process.exit(2);
}
const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
const events = existsSync(eventsPath)
  ? readFileSync(eventsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
  : [];
const profilePath = option("--profile");
let profile = {};
if (profilePath && existsSync(profilePath)) {
  try {
    profile = cleanProfile(JSON.parse(readFileSync(profilePath, "utf8")));
  } catch {
    profile = {};
  }
}
const p = progress(bundle, events, new Date(), profile);
const prompts = Object.fromEntries(bundle.chapters.flatMap((c) => c.challenges.map((x) => [x.id, x.prompt])));
if (flag("--json")) {
  console.log(JSON.stringify(p, null, 1));
  process.exit(0);
}
const answers = events.filter((e) => e.kind === "answer");
const days = [...new Set(answers.map((e) => e.day))].sort();
const to = profile.company || "the interview";
console.log(
  `XP ${p.xp} · ${answers.length} answers over ${days.length} day(s) · ${p.weekdays} of the last 5 weekdays` +
    (p.daysLeft != null && p.daysLeft >= 0 ? ` · ${p.daysLeft} day(s) to ${to}` : ""),
);
let quest = 0;
for (const ch of [...bundle.chapters].sort((a, b) => a.chapter - b.chapter)) {
  const c = p.chapters[ch.slug];
  const acc = c.accuracy == null ? "–" : `${Math.round(c.accuracy * 100)}%`;
  const tag = isQuest(ch) ? `Q${++quest}` : `${ch.chapter}.`;
  console.log(
    `  ${tag.padEnd(3)} ${ch.title.padEnd(36)} ${"★".repeat(c.stars)}${"☆".repeat(3 - c.stars)}  ${(c.rank || (c.unlocked ? "open" : "locked")).padEnd(17)} ${String(c.answered).padStart(2)}/${c.total} answered · ${acc} first try`,
  );
}
const up = recommend(bundle, p);
if (up) console.log(`Recommended next: ${up.title}${isQuest(up) ? " (a quest)" : ""}`);
if (bundle.held)
  console.log(`Held back for a mock: ${bundle.held.challenges} challenge(s), ${bundle.held.chapters} whole chapter(s)`);
if (p.weakest.length) {
  console.log("Weakest (first-try misses):");
  for (const w of p.weakest) console.log(`  ${w.id} ×${w.misses}: ${(prompts[w.id] || "").slice(0, 90)}`);
}
if (p.badges.length) console.log("Badges: " + p.badges.map((b) => b.label).join(" · "));
