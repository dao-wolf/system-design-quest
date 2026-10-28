// The flaw challenge.
import { shuffle } from "../engine.js";
import { h } from "../dom.js";
import { mark, optionList, submitBtn } from "./shared.js";
import { diagram } from "../diagram.js";

export function flaw(c, body, finish) {
  let node = null,
    fix = null;
  const btn = submitBtn();
  const ready = () => (btn.disabled = node == null || fix == null);
  const d = diagram(c.diagram, {
    clickable: c.diagram.nodes.map((n) => n.id),
    onNode: (id) => {
      node = id;
      d.pick(id);
      ready();
    },
  });
  const list = optionList(shuffle(c.fixes.map((text, value) => ({ text, value }))), {
    onChange: ([v]) => {
      fix = v;
      ready();
    },
  });
  btn.onclick = () =>
    finish({ node, fix }, () => {
      d.result((id) => (id === c.flaw ? { ok: true } : id === node ? { ok: false } : null));
      mark(list, [c.fix], [fix]);
    });
  body.append(
    h("div", { class: "muted" }, "Click the weak box, then pick the fix."),
    d.el,
    h("div", { class: "group" }, h("div", { class: "label" }, "The fix"), list),
    btn,
  );
}
