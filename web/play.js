// A run through a chapter: starting it, each challenge in turn, the feedback, and asking the coach.
// All scoring comes from engine.js.
import { check, generate, runOrder, score } from "./engine.js";
import { app, chapterBySlug, prog } from "./state.js";
import { h, richText, show, toast } from "./dom.js";
import { baseEvent, post } from "./store.js";
import { celebrate, renderStats } from "./stats.js";
import { RENDER, REVEAL_TEXT, SELF_GRADED, TYPE_LABEL } from "./challenges/index.js";
import { renderMap } from "./screens/map.js";
import { showResults } from "./screens/results.js";

export function startChapter(slug, list = null) {
  const ch = chapterBySlug(slug);
  const order = list || runOrder(ch);
  app.run = {
    chapter: ch,
    queue: order.filter((c) => c.id !== ch.boss).map((c) => ({ c, second: false })),
    boss: list ? null : order.find((c) => c.id === ch.boss),
    phase: "main",
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
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
  app.run = {
    chapter: ch,
    queue: [{ c: boss, second: false }],
    boss: null,
    phase: "boss",
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
  app.combo = 0;
  post(baseEvent("session_start", { chapter: ch.chapter, slug, boss_only: true }));
  showChallenge();
}

export function startSingle(ch, chapter) {
  app.run = {
    chapter,
    queue: [{ c: ch, second: false }],
    boss: null,
    phase: "single",
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
  showChallenge();
}

function current() {
  return app.run.queue[app.run.i];
}

function advance() {
  const run = app.run;
  run.i++;
  if (run.i < run.queue.length) return showChallenge();
  if (run.phase === "main" && run.misses.length) {
    run.phase = "second";
    run.queue = run.misses.map((c) => ({ c, second: true }));
    run.misses = [];
    run.i = 0;
    toast("🔁 Second chance: the ones you missed, for half points");
    return showChallenge();
  }
  if ((run.phase === "main" || run.phase === "second") && run.boss) {
    run.phase = "boss";
    run.queue = [{ c: run.boss, second: false }];
    run.i = 0;
    toast("👹 Boss time");
    return showChallenge();
  }
  showResults();
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

function showChallenge() {
  const run = app.run;
  const { c, second } = current();
  const isBoss = run.phase === "boss";
  renderStats();
  const state = { confidence: null, submitted: false };
  const card = h("div", { class: "card challenge" });
  const kind = h(
    "div",
    { class: "kind" },
    h("span", { class: "pill" }, TYPE_LABEL[c.type]),
    h("span", { class: "pill", title: "Revised Bloom's level" }, c.bloom),
    isBoss ? h("span", { class: "pill boss-tag" }, "👹 Boss") : null,
    second ? h("span", { class: "pill" }, "🔁 Second chance") : null,
    run.phase === "single" ? h("span", { class: "pill" }, "🎯 Coach's challenge") : null,
  );
  const body = h("div");
  const feedbackSlot = h("div");
  card.append(kind, h("div", { class: "prompt" }, c.prompt));

  if (!SELF_GRADED.has(c.type)) {
    const conf = h("div", { class: "conf" }, h("span", { class: "muted" }, "How sure are you?"));
    for (const [k, label] of [
      ["guess", "😬 Guess"],
      ["fairly", "🙂 Fairly"],
      ["sure", "😎 Sure (×1.5 if right)"],
    ]) {
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
    card.append(conf);
  }
  card.append(body, feedbackSlot);

  const finish = async (res, reveal) => {
    if (state.submitted) return;
    state.submitted = true;
    card.querySelectorAll("button, input, textarea").forEach((el) => {
      if (!feedbackSlot.contains(el)) el.disabled = true;
    });
    const { fraction } = check(c, res);
    const before = prog();
    const s = score(c, fraction, { confidence: state.confidence, combo: app.combo, secondChance: second, isBoss });
    app.combo = s.combo;
    const ev = baseEvent("answer", {
      chapter: run.chapter ? run.chapter.chapter : null,
      challenge: c.id,
      type: c.type,
      bloom: c.bloom,
      boss: isBoss,
      second_chance: second,
      confidence: state.confidence,
      fraction: Math.round(fraction * 1000) / 1000,
      correct: s.correct,
      points: s.points,
      combo: s.combo,
      response: summarise(c, res),
    });
    if (c.type === "write" && app.coach) Object.assign(ev, { coach: true, prompt: c.prompt });
    await post(ev);
    run.answered++;
    run.points += s.points;
    if (s.correct) run.right++;
    run.bestCombo = Math.max(run.bestCombo, s.combo);
    run.results.push({ id: c.id, second, correct: s.correct, fraction, points: s.points, boss: isBoss });
    if (!s.correct && !second && !isBoss && run.phase === "main") run.misses.push(c);
    if (isBoss) run.bossResult = fraction;
    if (reveal) reveal(fraction);
    feedbackSlot.replaceChildren(feedback(c, res, fraction, s, isBoss));
    celebrate(before, prog(), isBoss && fraction >= 0.8);
    renderStats();
  };

  RENDER[c.type](c, body, finish, state);
  if (c.seconds && c.type !== "lightning" && c.type !== "sprint") {
    let left = c.seconds;
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
  show(
    h(
      "div",
      { class: "runbar" },
      h(
        "div",
        {},
        h("b", {}, run.chapter ? `${run.chapter.emoji} ${run.chapter.title}` : "Coach's challenge"),
        " ",
        runDots(),
      ),
      h(
        "button",
        {
          class: "btn ghost small",
          onclick: () => {
            if (confirm("Leave this run? Your answers so far are kept.")) renderMap();
          },
        },
        "Map",
      ),
    ),
    card,
  );
}

function summarise(c, res) {
  const out = { ...res };
  if (out.text) out.text = String(out.text).slice(0, 4000);
  if (c.type === "estimate") out.expected = generate(c.generator, res.seed).answer;
  return out;
}

function feedback(c, res, fraction, s, isBoss) {
  const verdict = s.correct
    ? isBoss
      ? "👹 Boss beaten!"
      : "✅ Right"
    : fraction >= 0.5
      ? isBoss && fraction >= 0.8
        ? "👹 Boss beaten!"
        : "🟡 Partly"
      : "❌ Not this time";
  const cls = s.correct || (isBoss && fraction >= 0.8) ? "right" : fraction >= 0.5 ? "part" : "wrong";
  const box = h(
    "div",
    { class: `feedback ${cls}` },
    s.points ? h("div", { class: "plus" }, `+${s.points}`) : null,
    h(
      "div",
      { class: "verdict" },
      verdict,
      s.multiplier > 1 && s.correct ? h("span", { class: "combo" }, `  🔥 ×${s.multiplier}`) : "",
    ),
    !s.correct && fraction < 1
      ? h("div", { class: "muted" }, "It comes back at the end of the run for a second chance.")
      : null,
    REVEAL_TEXT[c.type] ? REVEAL_TEXT[c.type](c, res) : null,
    h("div", { style: "margin-top:8px" }, richText(c.explain)),
    c.source && !c.source.startsWith("vault:")
      ? h("div", { class: "source" }, "📖 ", h("a", { href: c.source, target: "_blank", rel: "noopener" }, "Source"))
      : null,
    c.source && c.source.startsWith("vault:")
      ? h("div", { class: "source muted" }, `📖 In your notes: ${c.source.slice(6)}`)
      : null,
  );
  const actions = h("div", { class: "row", style: "margin-top:12px" });
  const nextBtn = h("button", { class: "btn", onclick: () => advance() }, "Next ▶");
  actions.append(nextBtn);
  if (app.coach)
    actions.append(h("button", { class: "btn ghost", onclick: () => askCoach(c, res, actions) }, "💬 Ask coach"));
  actions.append(h("button", { class: "btn ghost", onclick: () => flag(c, actions) }, "🚩 Flag"));
  box.append(actions);
  setTimeout(() => nextBtn.focus(), 50);
  return box;
}

function askCoach(c, res, where) {
  const ta = h("textarea", { placeholder: "What do you want to ask? (optional)", style: "min-height:60px" });
  const send = h(
    "button",
    {
      class: "btn small",
      onclick: async () => {
        await post(
          baseEvent("coach_request", {
            coach: true,
            challenge: c.id,
            prompt: c.prompt,
            response: summarise(c, res),
            question: ta.value.slice(0, 1000),
          }),
        );
        wrap.replaceChildren(h("div", { class: "muted" }, "💬 Sent. The coach answers in the panel."));
      },
    },
    "Send to coach",
  );
  const wrap = h("div", { style: "width:100%" }, ta, send);
  where.after(wrap);
  ta.focus();
}

function flag(c, where) {
  const ta = h("input", { type: "text", placeholder: "What's wrong with it?" });
  const send = h(
    "button",
    {
      class: "btn small",
      onclick: async () => {
        await post(baseEvent("flag", { coach: app.coach, challenge: c.id, note: ta.value.slice(0, 500) }));
        wrap.replaceChildren(h("div", { class: "muted" }, "🚩 Flagged. It'll be reviewed."));
      },
    },
    "Flag it",
  );
  const wrap = h("div", { class: "row", style: "width:100%" }, ta, send);
  where.after(wrap);
  ta.focus();
}
