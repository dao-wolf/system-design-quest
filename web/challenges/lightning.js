// The lightning challenge.
import { shuffle } from "../engine.js";
import { app, clearTimers } from "../state.js";
import { h } from "../dom.js";

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
    const end = () => {
      if (state.submitted) return;
      finish({ right, shown: i }, null);
      const toLearn = [...misses, ...pairs.slice(i)];
      body.append(
        toLearn.length
          ? h(
              "div",
              { class: "answerbox" },
              h("b", {}, `${right} of ${pairs.length}. To learn: `),
              h(
                "ul",
                {},
                toLearn.map(([a, b]) => h("li", {}, `${a} → ${b}`)),
              ),
            )
          : h("div", { class: "answerbox" }, `Clean sweep: ${right} of ${pairs.length}.`),
      );
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
    app.timers.push(
      setInterval(() => {
        left--;
        timer.textContent = `⏱️ ${left}s`;
        timer.classList.toggle("low", left <= 10);
        if (left <= 0) {
          opts.replaceChildren();
          end();
          clearTimers();
        }
      }, 1000),
    );
    ask();
  };
}
