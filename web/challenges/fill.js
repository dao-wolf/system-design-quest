// The fill challenge.
import { shuffle } from "../engine.js";
import { h } from "../dom.js";
import { submitBtn } from "./shared.js";
import { diagram } from "../diagram.js";

export function fill(c, body, finish) {
  const placed = {};
  let chosen = null;
  const btn = submitBtn();
  const slots = Object.keys(c.slots);
  const chips = shuffle(c.palette).map((label) => {
    const chip = h(
      "button",
      {
        class: "chip",
        draggable: "true",
        onclick: () => {
          chosen = chosen === label ? null : label;
          chips.forEach((x) => x.classList.toggle("sel", x._label === chosen));
        },
      },
      label,
    );
    chip._label = label;
    chip.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", label));
    return chip;
  });
  const refresh = () => {
    d.update(placed);
    const used = new Set(Object.values(placed));
    chips.forEach((x) => x.classList.toggle("used", used.has(x._label)));
    btn.disabled = slots.some((s) => !placed[s]);
  };
  const d = diagram(c.diagram, {
    slots,
    clickable: slots,
    onNode: (id) => {
      if (chosen) {
        placed[id] = chosen;
        chosen = null;
        chips.forEach((x) => x.classList.remove("sel"));
      } else delete placed[id];
      refresh();
    },
    onDrop: (id, label) => {
      placed[id] = label;
      refresh();
    },
  });
  btn.onclick = () =>
    finish({ placed: { ...placed } }, () =>
      d.result((id) => ({
        ok: placed[id] === c.slots[id],
        text: placed[id] === c.slots[id] ? placed[id] : `✗ ${placed[id]} → ${c.slots[id]}`,
      })),
    );
  body.append(
    h(
      "div",
      { class: "muted" },
      "Pick a part, then click the empty box it belongs in (or drag it). Click a filled box to clear it.",
    ),
    d.el,
    h("div", { class: "chips" }, chips),
    btn,
  );
}
