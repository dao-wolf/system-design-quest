// The write challenge.
import { h } from "../dom.js";

export function write(c, body, finish) {
  const ta = h("textarea", { placeholder: "Write your answer. Bullet points are fine." });
  const btn = h("button", { class: "btn" }, "Done: show the key points");
  const after = h("div");
  btn.onclick = () => {
    if (ta.value.trim().length < 10) {
      ta.focus();
      return;
    }
    ta.disabled = true;
    btn.remove();
    const ticks = c.key_points.map((kp, i) =>
      h("label", { class: "opt", style: "display:flex;gap:10px" }, h("input", { type: "checkbox", value: i }), kp),
    );
    after.append(
      h(
        "div",
        { class: "group" },
        h("div", { class: "label" }, "Tick the ones you covered"),
        h("div", { class: "options" }, ticks),
      ),
      c.model ? h("div", { class: "answerbox" }, h("b", {}, "One good answer: "), c.model) : null,
      h(
        "button",
        {
          class: "btn",
          onclick: (e) => {
            e.target.disabled = true;
            ticks.forEach((t) => (t.querySelector("input").disabled = true));
            const ticked = ticks.map((t, i) => (t.querySelector("input").checked ? i : null)).filter((x) => x != null);
            finish({ ticked, text: ta.value });
          },
        },
        "Score it",
      ),
    );
  };
  body.append(ta, h("p"), btn, after);
}
