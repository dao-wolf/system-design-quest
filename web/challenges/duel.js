// The duel challenge.
import { shuffle } from "../engine.js";
import { h } from "../dom.js";
import { mark, optionList, submitBtn } from "./shared.js";

export function duel(c, body, finish) {
  const pick = {};
  const btn = submitBtn();
  const groups = [
    ["choice", "Your call", c.choices, c.correct],
    ["reason", "Because", c.reasons, c.reason],
    ["cost", "And the cost", c.costs, c.cost],
  ];
  const lists = groups.map(([key, label, opts]) => {
    const list = optionList(shuffle(opts.map((text, value) => ({ text, value }))), {
      onChange: ([v]) => {
        pick[key] = v;
        btn.disabled = Object.keys(pick).length < 3;
      },
    });
    body.append(h("div", { class: "group" }, h("div", { class: "label" }, label), list));
    return list;
  });
  btn.onclick = () =>
    finish({ ...pick }, () =>
      groups.forEach(([key, , , right], i) => mark(lists[i], [right], [pick[key]], { right: "⅓", wrong: "0" })),
    );
  body.append(btn);
}
