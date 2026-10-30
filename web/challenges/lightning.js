// The lightning challenge.
import { shuffle } from "../engine.js";
import { app, clearTimers } from "../state.js";
import { h } from "../dom.js";

// The right option, and the player's pick if it was wrong. On every question but the last it is replaced at once.
function markAnswer(opts, reach, picked) {
  for (const b of opts.querySelectorAll(".opt")) {
    b.disabled = true;
    if (b.textContent === reach) b.classList.add(picked === reach ? "right" : "missed");
    else if (b.textContent === picked) b.classList.add("wrong");
  }
}

// What the round leaves to revise, or a clean sweep.
function summary(right, pairs, toLearn) {
  if (!toLearn.length) return h("div", { class: "answerbox" }, `Clean sweep: ${right} of ${pairs.length}.`);
  return h(
    "div",
    { class: "answerbox" },
    h("b", {}, `${right} of ${pairs.length}. To learn: `),
    h(
      "ul",
      {},
      toLearn.map(([a, b]) => h("li", {}, `${a} → ${b}`)),
    ),
  );
}

export function lightning(c, body, finish, state) {
  const secs = c.seconds || 90;
  const reaches = [...new Set(c.pairs.map((p) => p[1]))];
  const start = h("button", { class: "btn" }, `Start: ${secs} seconds`);
  body.append(
    h("div", { class: "muted" }, `${c.pairs.length} quick ones. Tap the right answer; it moves on by itself.`),
    h("p"),
    start,
  );
  start.onclick = () => {
    const pairs = shuffle(c.pairs);
    let i = 0,
      right = 0,
      left = secs;
    const misses = [];
    const timer = h("div", { class: "timer" }, `⏱️ ${left}s`);
    const q = h("div", { class: "lightning-q" });
    const opts = h("div", { class: "options" });
    // The round is over: the clock stops and says how it ended, and the last question stays marked.
    const end = (timedOut) => {
      if (state.submitted) return;
      clearInterval(tick);
      timer.textContent = timedOut ? "⏱️ Time's up" : `✅ Done in ${secs - left}s`;
      timer.classList.remove("low");
      finish({ right, shown: i }, null);
      const toLearn = [...misses, ...pairs.slice(i)];
      body.append(summary(right, pairs, toLearn));
    };
    const ask = () => {
      if (i >= pairs.length) return end();
      const [hear, reach] = pairs[i];
      q.textContent = hear;
      const choices = shuffle([reach, ...shuffle(reaches.filter((r) => r !== reach)).slice(0, 3)]);
      opts.replaceChildren(
        ...choices.map((text) =>
          h(
            "button",
            {
              class: "opt",
              onclick: () => {
                const ok = text === reach;
                if (ok) right++;
                else misses.push([hear, reach]);
                markAnswer(opts, reach, text);
                opts.classList.add(ok ? "flash-right" : "flash-wrong");
                setTimeout(() => opts.classList.remove("flash-right", "flash-wrong"), 350);
                i++;
                ask();
              },
            },
            text,
          ),
        ),
      );
    };
    body.replaceChildren(h("div", { class: "row spread" }, timer, h("span", { class: "muted" }, "Go!")), q, opts);
    const tick = setInterval(() => {
      left--;
      timer.textContent = `⏱️ ${left}s`;
      timer.classList.toggle("low", left <= 10);
      if (left <= 0) {
        opts.replaceChildren();
        end(true);
        clearTimers();
      }
    }, 1000);
    app.timers.push(tick);
    ask();
  };
}
