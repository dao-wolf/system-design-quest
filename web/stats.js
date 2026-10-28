// The header stats, and the toasts when progress changes.
import { multiplier } from "./engine.js";
import { $, app, chapterBySlug, prog } from "./state.js";
import { confetti, h, toast } from "./dom.js";

const BADGE_EMOJI = {
  "first-boss": "🏆",
  "combo-5": "🔥",
  "sure-shot": "🎯",
  comeback: "🔁",
  "all-bosses": "👑",
};
export const badgeEmoji = (id) => BADGE_EMOJI[id] || "🏅";

// Only with an interview date that hasn't passed.
function countdown(daysLeft) {
  const company = app.profile.company;
  if (daysLeft === 0)
    return h("span", { class: "stat" }, "🎯 ", h("b", {}, `${company ? `${company} interview` : "Interview"} today`));
  const to = company || "your interview";
  return h("span", { class: "stat" }, "⏳ ", h("b", {}, daysLeft), ` day${daysLeft === 1 ? "" : "s"} to ${to}`);
}

function comboStat(combo) {
  const times = multiplier(combo);
  return h("span", { class: "stat combo" }, `🔥 ${combo} in a row${times > 1 ? ` · ×${times}` : ""}`);
}

export function renderStats() {
  const p = prog();
  const stats = [h("span", { class: "stat" }, "⭐ ", h("b", {}, p.xp.toLocaleString("en-GB")), " XP")];
  if (p.daysLeft != null && p.daysLeft >= 0) stats.push(countdown(p.daysLeft));
  stats.push(
    h(
      "span",
      { class: "stat", title: "Days you played, of the last five weekdays. Weekends never count against you." },
      "📅 ",
      h("b", {}, p.weekdays),
      // A narrow bar shows the short form; screen readers always hear the long one (style.css).
      h("span", { class: "long" }, " of the last 5 weekdays"),
      h("span", { class: "short", "aria-hidden": "true" }, "/5"),
    ),
  );
  if (app.combo >= 2) stats.push(comboStat(app.combo));
  $("stats").replaceChildren(...stats);
}

function chapterToasts(before, after) {
  for (const [slug, c] of Object.entries(after.chapters)) {
    const b = before.chapters[slug];
    if (c.rank && c.rank !== b.rank) toast(`🎖️ Rank up: ${c.rank}`);
    if (c.unlocked && !b.unlocked) toast(`🔓 Unlocked: ${chapterBySlug(slug).title}`);
  }
}

function badgeToasts(before, after) {
  for (const badge of after.badges)
    if (!before.badges.some((x) => x.id === badge.id)) toast(`${badgeEmoji(badge.id)} Badge: ${badge.label}`);
}

export function celebrate(before, after, bossBeaten) {
  if (bossBeaten) confetti();
  chapterToasts(before, after);
  badgeToasts(before, after);
}
