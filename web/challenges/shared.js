// Building blocks the challenge types share.
import { h } from "../dom.js";

// What a written or timed answer covered, and what to add next time.
export function coverageNote({ covered, next }) {
  const list = (title, items) => [
    h("b", {}, title),
    h(
      "ul",
      {},
      items.map((item) => h("li", {}, item)),
    ),
  ];
  return h(
    "div",
    { class: "coverage" },
    covered.length ? list("You covered:", covered) : [h("b", {}, "You covered: "), "none of them"],
    next.length ? list("Add next time:", next) : null,
  );
}

export const submitBtn = (label = "Check") => h("button", { class: "btn", disabled: true }, label);

export function optionList(items, { multi = false, onChange }) {
  const box = h("div", { class: "options" });
  const sel = new Set();
  const buttons = items.map(({ text, value }) => {
    const b = h(
      "button",
      {
        class: "opt",
        onclick: () => {
          if (multi) {
            sel.has(value) ? sel.delete(value) : sel.add(value);
          } else {
            sel.clear();
            sel.add(value);
          }
          buttons.forEach((x) => x.classList.toggle("sel", sel.has(x._value)));
          onChange([...sel]);
        },
      },
      text,
    );
    b._value = value;
    return b;
  });
  box.append(...buttons);
  box._buttons = buttons;
  return box;
}
// How an option came out: picked and right, picked and wrong, or right and left out.
const outcome = (isRight, chosen) => (chosen ? (isRight ? "right" : "wrong") : isRight ? "missed" : null);

// After checking: each option shows how it came out and, given badges, what that was worth.
export function mark(box, rightValues, chosenValues, badges) {
  for (const b of box._buttons) {
    b.disabled = true;
    b.classList.remove("sel");
    const result = outcome(rightValues.includes(b._value), chosenValues.includes(b._value));
    if (result) b.classList.add(result);
    const worth = badges && { ...badges, missed: "missed" }[result];
    if (worth) b.append(h("span", { class: "sr-only" }, ", mark: "), h("span", { class: "badge" }, worth));
  }
}
