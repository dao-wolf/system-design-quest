// The sticker challenge.
import { h, toast } from "../dom.js";
import { submitBtn } from "./shared.js";
import { diagram } from "../diagram.js";

// One chip per sticker. Clicking a chip picks it; clicking it again puts it down.
function stickerChips(labels, onPick) {
  let chosen = null;
  const chips = labels.map((label) => {
    const pick = () => {
      chosen = chosen === label ? null : label;
      chips.forEach((x) => x.classList.toggle("sel", x._label === chosen));
      onPick(chosen);
    };
    const chip = h("button", { class: "chip", onclick: pick }, `🏷️ ${label}`);
    chip._label = label;
    return chip;
  });
  return chips;
}

// Puts the sticker on a box, or takes it off if it's there already.
function toggleTag(placed, id, label) {
  const list = (placed[id] ||= []);
  const at = list.indexOf(label);
  if (at >= 0) list.splice(at, 1);
  else list.push(label);
}

// Each box's tags after checking: right ("ok"), wrong ("no") and missed ("miss").
function markTags(c, ids, placed) {
  const result = {};
  for (const id of ids) {
    const want = c.answers[id] || [],
      got = placed[id] || [];
    result[id] = [
      ...got.map((s) => ({ s, cls: want.includes(s) ? "ok" : "no" })),
      ...want.filter((s) => !got.includes(s)).map((s) => ({ s, cls: "miss" })),
    ];
  }
  return result;
}

export function sticker(c, body, finish) {
  const placed = {};
  let chosen = null;
  const btn = submitBtn();
  const ids = c.diagram.nodes.map((n) => n.id);
  const chips = stickerChips(c.stickers, (label) => (chosen = label));
  const d = diagram(c.diagram, {
    clickable: ids,
    onNode: (id) => {
      if (!chosen) return toast("Pick a sticker first");
      toggleTag(placed, id, chosen);
      d.tags(placed);
      btn.disabled = !Object.values(placed).some((l) => l.length);
    },
  });
  btn.onclick = () =>
    finish({ placed: JSON.parse(JSON.stringify(placed)) }, () => d.tagResult(markTags(c, ids, placed)));
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
