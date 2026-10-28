// Building blocks the challenge types share.
import { h } from "../dom.js";

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
export function mark(box, rightValues, chosenValues) {
  for (const b of box._buttons) {
    b.disabled = true;
    const isRight = rightValues.includes(b._value),
      chosen = chosenValues.includes(b._value);
    b.classList.remove("sel");
    if (isRight && chosen) b.classList.add("right");
    else if (chosen) b.classList.add("wrong");
    else if (isRight) b.classList.add("missed");
  }
}
