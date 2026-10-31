// The multi challenge.
import { shuffle } from "../engine.js";
import { h } from "../dom.js";
import { mark, optionList, submitBtn } from "./shared.js";

export function multi(c, body, finish) {
  const items = shuffle(c.options.map((text, value) => ({ text, value })));
  const btn = submitBtn();
  btn.setAttribute("aria-describedby", "multi-hint");
  let picked = [];
  const list = optionList(items, {
    multi: true,
    onChange: (v) => {
      picked = v;
      btn.disabled = picked.length === 0;
    },
  });
  const why = h("input", { type: "text", placeholder: "Why, in one line? (optional, but it helps it stick)" });
  // After checking, the marks are picks (+1 right, −1 wrong), not points: say so under the list.
  const legend = h(
    "div",
    { class: "muted", hidden: true },
    "Marks: +1 for each right pick, −1 for each wrong one. They are picks, not points.",
  );
  btn.onclick = () =>
    finish({ picked, why: why.value }, () => {
      mark(list, c.correct, picked, { right: "+1", wrong: "−1" });
      legend.hidden = false;
    });
  body.append(
    h("div", { class: "muted", id: "multi-hint" }, "Tick the ones that apply. Each wrong tick cancels a right one."),
    list,
    legend,
    h("p"),
    why,
    h("p"),
    btn,
  );
}
