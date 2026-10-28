// The sprint challenge.
import { app, clearTimers } from "../state.js";
import { h, toast } from "../dom.js";

export function sprint(c, body, finish) {
  let left = c.minutes * 60,
    running = false;
  const clock = h("div", { class: "bigtimer" }, fmtClock(left));
  const go = h("button", { class: "btn" }, "Start the clock");
  const done = h("button", { class: "btn ghost" }, "I'm done");
  const hint = h(
    "div",
    { class: "muted", style: "text-align:center" },
    "Talk it through out loud, as if they're listening.",
  );
  go.onclick = () => {
    running = !running;
    go.textContent = running ? "Pause" : "Resume";
    if (running && !app.timers.length)
      app.timers.push(
        setInterval(() => {
          if (!running) return;
          left = Math.max(0, left - 1);
          clock.textContent = fmtClock(left);
          if (left === Math.floor(c.minutes * 15)) toast("⏱️ A quarter left: wrap up and say it back");
          if (left === 0) {
            toast("⏱️ Time");
            running = false;
            done.click();
          }
        }, 1000),
      );
  };
  done.onclick = () => {
    running = false;
    clearTimers();
    go.remove();
    done.remove();
    const ticks = c.checks.map((txt, i) =>
      h("label", { class: "opt", style: "display:flex;gap:10px" }, h("input", { type: "checkbox", value: i }), txt),
    );
    body.append(
      h(
        "div",
        { class: "group" },
        h("div", { class: "label" }, "Tick what you did"),
        h("div", { class: "options" }, ticks),
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: (e) => {
            e.target.disabled = true;
            const ticked = ticks.map((t, i) => (t.querySelector("input").checked ? i : null)).filter((x) => x != null);
            finish({ ticked, seconds_used: c.minutes * 60 - left });
          },
        },
        "Score it",
      ),
    );
  };
  body.append(clock, hint, h("div", { class: "row", style: "justify-content:center" }, go, done));
}
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
