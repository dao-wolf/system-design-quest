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
      btn.disabled = picked.length !== c.correct.length;
    },
  });
  const why = h("input", { type: "text", placeholder: "Why, in one line? (optional, but it helps it stick)" });
  btn.onclick = () => finish({ picked, why: why.value }, () => mark(list, c.correct, picked));
  body.append(
    h(
      "div",
      { class: "muted", id: "multi-hint" },
      "Tick them, then Check. Check unlocks when you have ticked the right number.",
    ),
    list,
    h("p"),
    why,
    h("p"),
    btn,
  );
}
