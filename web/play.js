// A run through a chapter: starting it, then each challenge in turn until the results. What happens once an answer
// is in lives in answer.js.
import { runOrder } from "./engine.js";
import { app, chapterBySlug } from "./state.js";
import { h, show, toast } from "./dom.js";
import { baseEvent, post } from "./store.js";
import { renderStats } from "./stats.js";
import { RENDER, SELF_GRADED, TYPE_LABEL } from "./challenges/index.js";
import { finishTurn } from "./answer.js";
import { renderMap } from "./screens/map.js";
import { showResults } from "./screens/results.js";

const CONFIDENCE = [
  ["guess", "😬 Guess"],
  ["fairly", "🙂 Fairly"],
  ["sure", "😎 Sure (×1.5 if right)"],
];
// Types that keep their own clock, so they get no countdown in the header.
const OWN_CLOCK = new Set(["lightning", "sprint"]);

function newRun(chapter, queue, boss, phase) {
  return {
    chapter,
    queue,
    boss,
    phase,
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
}

export function startChapter(slug, list = null) {
  const ch = chapterBySlug(slug);
  const order = list || runOrder(ch);
  app.run = newRun(
    ch,
    order.filter((c) => c.id !== ch.boss).map((c) => ({ c, second: false })),
    list ? null : order.find((c) => c.id === ch.boss),
    "main",
  );
  app.combo = 0;
  post(baseEvent("session_start", { chapter: ch.chapter, slug }));
  showChallenge();
}

// Jump to any chapter out of order, by choice. Recording the unlock keeps it open from then on.
export function jumpTo(slug) {
  post(baseEvent("unlock", { slug, chosen: true }));
  startChapter(slug);
}

// Skip ahead: the boss alone, cold. Beat it and it counts exactly as at the end of a run.
export function startBoss(slug) {
  const ch = chapterBySlug(slug);
  const boss = ch.challenges.find((c) => c.id === ch.boss);
  app.run = newRun(ch, [{ c: boss, second: false }], null, "boss");
  app.combo = 0;
  post(baseEvent("session_start", { chapter: ch.chapter, slug, boss_only: true }));
  showChallenge();
}

export function startSingle(ch, chapter) {
  app.run = newRun(chapter, [{ c: ch, second: false }], null, "single");
  showChallenge();
}

function current() {
  return app.run.queue[app.run.i];
}

const BEFORE_BOSS = new Set(["main", "second"]);

export function advance() {
  const run = app.run;
  run.i++;
  if (run.i < run.queue.length) return showChallenge();
  if (run.phase === "main" && run.misses.length) return showHandoff();
  toBossOrResults();
}

function startSecondChances() {
  const run = app.run;
  run.phase = "second";
  run.queue = run.misses.map((c) => ({ c, second: true }));
  run.misses = [];
  run.i = 0;
  showChallenge();
}

function toBossOrResults() {
  const run = app.run;
  if (run.boss && BEFORE_BOSS.has(run.phase)) {
    run.phase = "boss";
    run.queue = [{ c: run.boss, second: false }];
    run.i = 0;
    toast("👹 Boss time");
    return showChallenge();
  }
  showResults();
}

// Between the passes: how the first went, what comes next and what it is worth, and a choice. Saving them for later
// goes on to the boss; the misses wait on the results screen to replay.
const SHOWN_MISSES = 5;
function showHandoff() {
  const run = app.run;
  const n = run.misses.length;
  const start = h("button", { class: "btn", onclick: startSecondChances }, "Start now");
  const heading = h("h3", { tabindex: "-1" }, `First pass done: ${run.right} of ${run.answered} right.`);
  show(
    runBar(run, "First pass done"),
    h(
      "div",
      { class: "card handoff" },
      heading,
      h("p", {}, `${n} second chance${n === 1 ? "" : "s"} next, for half points:`),
      h(
        "ul",
        {},
        run.misses.slice(0, SHOWN_MISSES).map((c) => h("li", {}, c.prompt)),
        n > SHOWN_MISSES ? h("li", { class: "muted" }, `and ${n - SHOWN_MISSES} more`) : null,
      ),
      h(
        "div",
        { class: "row" },
        start,
        h("button", { class: "btn ghost", onclick: toBossOrResults }, "Save for later"),
      ),
    ),
  );
  heading.focus(); // a screen reader hears how the pass went; the first Tab reaches Start now
}

// Where the player is: "3 of 9" in the first pass, "Second chance 1 of 4" in the next, "Boss" at the end.
function runLabel(run) {
  if (run.phase === "boss") return "Boss";
  if (run.phase === "single") return "";
  const at = `${run.i + 1} of ${run.queue.length}`;
  return run.phase === "second" ? `Second chance ${at}` : at;
}

function runDots() {
  const run = app.run;
  return h(
    "div",
    { class: "dots", title: "This run" },
    run.queue.map((q, i) => {
      const r = run.results.find((x) => x.id === q.c.id && x.second === q.second);
      const cls = r ? (r.correct ? "right" : r.fraction >= 0.5 ? "part" : "wrong") : i === run.i ? "now" : "";
      return h("i", { class: cls });
    }),
  );
}

function runBar(run, label) {
  const leave = () => {
    if (confirm("Leave this run? Your answers so far are kept.")) renderMap();
  };
  return h(
    "div",
    { class: "runbar" },
    h(
      "div",
      {},
      h("b", {}, run.chapter ? `${run.chapter.emoji} ${run.chapter.title}` : "Coach's challenge"),
      " ",
      runDots(),
      label ? [" ", h("span", { class: "muted" }, label)] : null,
    ),
    h("button", { class: "btn ghost small", onclick: leave }, "Map"),
  );
}

function kindPills({ run, c, second, isBoss }) {
  return h(
    "div",
    { class: "kind" },
    h("span", { class: "pill" }, TYPE_LABEL[c.type]),
    h("span", { class: "pill", title: "Revised Bloom's level" }, c.bloom),
    isBoss ? h("span", { class: "pill boss-tag" }, "👹 Boss") : null,
    second ? h("span", { class: "pill" }, "🔁 Second chance · half points") : null,
    run.phase === "single" ? h("span", { class: "pill" }, "🎯 Coach's challenge") : null,
  );
}

// How sure the player is, asked before answering: sure and right earns ×1.5.
function confidencePicker(state) {
  const conf = h("div", { class: "conf" }, h("span", { class: "muted" }, "How sure are you?"));
  for (const [k, label] of CONFIDENCE) {
    const b = h(
      "button",
      {
        onclick: () => {
          state.confidence = k;
          conf.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
        },
      },
      label,
    );
    conf.append(b);
  }
  return conf;
}

// A challenge with a time limit counts down in its header; at zero, the challenge hears "timeup".
function startCountdown(seconds, kind, body, state) {
  let left = seconds;
  const t = h("span", { class: "timer" }, `⏱️ ${left}s`);
  kind.append(t);
  app.timers.push(
    setInterval(() => {
      if (state.submitted) return;
      left--;
      t.textContent = `⏱️ ${left}s`;
      t.classList.toggle("low", left <= 10);
      if (left <= 0) body.dispatchEvent(new Event("timeup"));
    }, 1000),
  );
}

function showChallenge() {
  const run = app.run;
  const { c, second } = current();
  const turn = { run, c, second, isBoss: run.phase === "boss", state: { confidence: null, submitted: false } };
  renderStats();
  turn.card = h("div", { class: "card challenge" });
  turn.feedbackSlot = h("div");
  const kind = kindPills(turn);
  const body = h("div");
  turn.card.append(kind, h("div", { class: "prompt" }, c.prompt));
  if (!SELF_GRADED.has(c.type)) turn.card.append(confidencePicker(turn.state));
  turn.card.append(body, turn.feedbackSlot);

  RENDER[c.type](c, body, (res, reveal) => finishTurn(turn, res, reveal), turn.state);
  if (c.seconds && !OWN_CLOCK.has(c.type)) startCountdown(c.seconds, kind, body, turn.state);
  show(runBar(run, runLabel(run)), turn.card);
}
