// The sticker challenge.
import { h, toast } from "../dom.js";
import { submitBtn } from "./shared.js";
import { diagram } from "../diagram.js";

export function sticker(c, body, finish) {
  const placed = {};
  let chosen = null;
  const btn = submitBtn();
  const ids = c.diagram.nodes.map((n) => n.id);
  const chips = c.stickers.map((label) => {
    const chip = h(
      "button",
      {
        class: "chip",
        onclick: () => {
          chosen = chosen === label ? null : label;
          chips.forEach((x) => x.classList.toggle("sel", x._label === chosen));
        },
      },
      `🏷️ ${label}`,
    );
    chip._label = label;
    return chip;
  });
  const d = diagram(c.diagram, {
    clickable: ids,
    onNode: (id) => {
      if (!chosen) return toast("Pick a sticker first");
      const list = (placed[id] ||= []);
      const at = list.indexOf(chosen);
      at >= 0 ? list.splice(at, 1) : list.push(chosen);
      d.tags(placed);
      btn.disabled = !Object.values(placed).some((l) => l.length);
    },
  });
  btn.onclick = () =>
    finish({ placed: JSON.parse(JSON.stringify(placed)) }, () => {
      const result = {};
      for (const id of ids) {
        const want = c.answers[id] || [],
          got = placed[id] || [];
        result[id] = [
          ...got.map((s) => ({ s, cls: want.includes(s) ? "ok" : "no" })),
          ...want.filter((s) => !got.includes(s)).map((s) => ({ s, cls: "miss" })),
        ];
      }
      d.tagResult(result);
    });
  body.append(
    h(
      "div",
      { class: "muted" },
      "Pick a sticker, then click every box that needs it. Click again to take it off. Orange tags after checking are the ones you missed.",
    ),
    d.el,
    h("div", { class: "chips" }, chips),
    btn,
  );
}
