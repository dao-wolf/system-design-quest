// The end of a run: points, what was missed, and one next action.
import { app, nextUp, prog } from "../state.js";
import { h, show } from "../dom.js";
import { baseEvent, post } from "../store.js";
import { renderStats } from "../stats.js";
import { startChapter } from "../play.js";
import { renderMap } from "./map.js";

export function showResults() {
  const run = app.run;
  const p = prog();
  const ch = run.chapter;
  const c = ch ? p.chapters[ch.slug] : null;
  post(
    baseEvent("session_end", {
      coach: app.coach,
      chapter: ch ? ch.chapter : null,
      points: run.points,
      answered: run.answered,
      right: run.right,
      boss: run.bossResult,
    }),
  );
  const firstTry = run.results.filter((r) => !r.second);
  // The boss isn't a "miss" to replay on its own: a failed boss means replaying the chapter.
  const missed = firstTry
    .filter((r) => !r.correct && !r.boss)
    .map((r) => ch.challenges.find((x) => x.id === r.id))
    .filter(Boolean);
  const bossFailed = run.bossResult != null && run.bossResult < 0.8;
  const up = nextUp(p);
  app.run = null;
  const next = bossFailed
    ? `Play ${ch.title} and take the boss again at the end.`
    : missed.length
      ? `Replay the ${missed.length} you missed while they're fresh${up && up.slug !== ch?.slug ? `, then try ${up.title}` : ""}.`
      : up && up.slug !== ch?.slug
        ? `Next: ${up.title}.`
        : "Come back on another day and replay it: a later day at 80% earns the next star.";
  show(
    h(
      "div",
      { class: "card" },
      h("div", { class: "muted" }, ch ? `${ch.emoji} ${ch.title}` : "Coach's challenge"),
      h("div", { class: "big" }, `+${run.points} XP`),
      h(
        "div",
        { class: "row" },
        h("span", { class: "stat" }, `✅ ${run.right} of ${run.answered} right`),
        h("span", { class: "stat" }, `🔥 best run of ${run.bestCombo}`),
        run.bossResult != null
          ? h(
              "span",
              { class: "stat" },
              run.bossResult >= 0.8 ? "👹 Boss beaten" : `👹 Boss: ${Math.round(run.bossResult * 100)}%, needs 80%`,
            )
          : null,
        c ? h("span", { class: "stat" }, `${"★".repeat(c.stars)}${"☆".repeat(3 - c.stars)} ${c.rank || ""}`) : null,
      ),
      h("h3", { style: "margin-top:16px" }, "▶️ One next action"),
      h("p", {}, next),
      missed.length
        ? h(
            "div",
            {},
            h("div", { class: "muted" }, "Missed first time:"),
            h(
              "ul",
              {},
              missed.map((m) => h("li", {}, m.prompt)),
            ),
          )
        : null,
      h(
        "div",
        { class: "row", style: "margin-top:12px" },
        bossFailed ? h("button", { class: "btn", onclick: () => startChapter(ch.slug) }, `Play ${ch.title}`) : null,
        missed.length
          ? h(
              "button",
              { class: bossFailed ? "btn ghost" : "btn", onclick: () => startChapter(ch.slug, missed) },
              "Replay the misses",
            )
          : null,
        up && (!ch || up.slug !== ch.slug)
          ? h(
              "button",
              { class: missed.length ? "btn ghost" : "btn", onclick: () => startChapter(up.slug) },
              `Play ${up.title}`,
            )
          : null,
        h("button", { class: "btn ghost", onclick: renderMap }, "Map"),
      ),
    ),
  );
  renderStats();
}
