// The write challenge.
import { h } from "../dom.js";
import { tickList } from "./shared.js";

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
    const [group, score] = tickList(c.key_points, "Tick the ones you covered", (ticked) =>
      finish({ ticked, text: ta.value }),
    );
    const model = c.model ? h("div", { class: "answerbox" }, h("b", {}, "One good answer: "), c.model) : null;
    after.append(...[group, model, score].filter(Boolean));
  };
  body.append(ta, h("p"), btn, after);
}
