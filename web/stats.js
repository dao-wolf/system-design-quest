// The header stats, and the toasts when progress changes.
import { multiplier } from "./engine.js";
import { $, app, chapterBySlug, prog } from "./state.js";
import { confetti, h, toast } from "./dom.js";

export const BADGE_EMOJI = {
  "first-boss": "🏆",
  "combo-5": "🔥",
  "sure-shot": "🎯",
  comeback: "🔁",
  "all-bosses": "👑",
};

export function renderStats() {
  const p = prog();
  const stats = [h("span", { class: "stat" }, "⭐ ", h("b", {}, p.xp.toLocaleString("en-GB")), " XP")];
  if (p.daysLeft != null && p.daysLeft >= 0) {
    const to = app.profile.company || "your interview";
    stats.push(
      p.daysLeft === 0
        ? h(
            "span",
            { class: "stat" },
            "🎯 ",
            h("b", {}, `${app.profile.company ? `${app.profile.company} interview` : "Interview"} today`),
          )
        : h("span", { class: "stat" }, "⏳ ", h("b", {}, p.daysLeft), ` day${p.daysLeft === 1 ? "" : "s"} to ${to}`),
    );
  }
  stats.push(
    h(
      "span",
      { class: "stat", title: "Days you played, of the last five weekdays. Weekends never count against you." },
      "📅 ",
      h("b", {}, p.weekdays),
      " of the last 5 weekdays",
    ),
  );
  if (app.combo >= 2)
    stats.push(
      h(
        "span",
        { class: "stat combo" },
        `🔥 ${app.combo} in a row${multiplier(app.combo) > 1 ? ` · ×${multiplier(app.combo)}` : ""}`,
      ),
    );
  $("stats").replaceChildren(...stats);
}

export function celebrate(before, after, bossBeaten) {
  if (bossBeaten) confetti();
  for (const [slug, c] of Object.entries(after.chapters)) {
    const b = before.chapters[slug];
    if (c.rank && c.rank !== b.rank) toast(`🎖️ Rank up: ${c.rank}`);
    if (c.unlocked && !b.unlocked) toast(`🔓 Unlocked: ${chapterBySlug(slug).title}`);
  }
  for (const badge of after.badges)
    if (!before.badges.some((x) => x.id === badge.id)) toast(`${BADGE_EMOJI[badge.id] || "🏅"} Badge: ${badge.label}`);
}
