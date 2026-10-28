// The end of a run: points, what was missed, and one next action.
import { app, nextUp, prog } from "../state.js";
import { h, show } from "../dom.js";
import { baseEvent, post } from "../store.js";
import { renderStats } from "../stats.js";
import { startChapter } from "../play.js";
import { renderMap } from "./map.js";

// The challenges missed at the first try. The boss isn't a "miss" to replay on its own: a failed boss means
// replaying the chapter.
function missedFirstTime(run, ch) {
  return run.results
    .filter((r) => !r.second)
    .filter((r) => !r.correct && !r.boss)
    .map((r) => ch.challenges.find((x) => x.id === r.id))
    .filter(Boolean);
}

function nextAction({ ch, missed, bossFailed, otherUp }) {
  if (bossFailed) return `Play ${ch.title} and take the boss again at the end.`;
  if (missed.length)
    return `Replay the ${missed.length} you missed while they're fresh${otherUp ? `, then try ${otherUp.title}` : ""}.`;
  if (otherUp) return `Next: ${otherUp.title}.`;
  return "Come back on another day and replay it: a later day at 80% earns the next star.";
}

function bossStat(result) {
  if (result == null) return null;
  return h(
    "span",
    { class: "stat" },
    result >= 0.8 ? "👹 Boss beaten" : `👹 Boss: ${Math.round(result * 100)}%, needs 80%`,
  );
}

function resultStats(run, c) {
  return h(
    "div",
    { class: "row" },
    h("span", { class: "stat" }, `✅ ${run.right} of ${run.answered} right`),
    h("span", { class: "stat" }, `🔥 best run of ${run.bestCombo}`),
    bossStat(run.bossResult),
    c ? h("span", { class: "stat" }, `${"★".repeat(c.stars)}${"☆".repeat(3 - c.stars)} ${c.rank || ""}`) : null,
  );
}

function missedList(missed) {
  if (!missed.length) return null;
  return h(
    "div",
    {},
    h("div", { class: "muted" }, "Missed first time:"),
    h(
      "ul",
      {},
      missed.map((m) => h("li", {}, m.prompt)),
    ),
  );
}

// The first button is the one next action; the others are ghosts.
function resultButtons({ ch, missed, bossFailed, otherUp }) {
  return h(
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
    otherUp
      ? h(
          "button",
          { class: missed.length ? "btn ghost" : "btn", onclick: () => startChapter(otherUp.slug) },
          `Play ${otherUp.title}`,
        )
      : null,
    h("button", { class: "btn ghost", onclick: renderMap }, "Map"),
  );
}

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
  const up = nextUp(p);
  // The recommended chapter, unless it's the one just played.
  const next = {
    ch,
    missed: missedFirstTime(run, ch),
    bossFailed: run.bossResult != null && run.bossResult < 0.8,
    otherUp: up && up.slug !== ch?.slug ? up : null,
  };
  app.run = null;
  show(
    h(
      "div",
      { class: "card" },
      h("div", { class: "muted" }, ch ? `${ch.emoji} ${ch.title}` : "Coach's challenge"),
      h("div", { class: "big" }, `+${run.points} XP`),
      resultStats(run, c),
      h("h3", { style: "margin-top:16px" }, "▶️ One next action"),
      h("p", {}, nextAction(next)),
      missedList(next.missed),
      resultButtons(next),
    ),
  );
  renderStats();
}
