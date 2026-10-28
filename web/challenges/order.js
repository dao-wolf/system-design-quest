// The order challenge.
import { shuffle } from "../engine.js";
import { h, toast } from "../dom.js";

export function order(c, body, finish, state) {
  let items = shuffle(c.items);
  while (items.length > 2 && items.every((x, i) => x === c.items[i])) items = shuffle(c.items);
  const ol = h("ol", { class: "orderlist" });
  const btn = h("button", { class: "btn" }, "Check");
  let dragFrom = null;
  const draw = () =>
    ol.replaceChildren(
      ...items.map((text, i) => {
        const li = h(
          "li",
          { draggable: "true" },
          h("span", { class: "muted" }, `${i + 1}.`),
          h("span", { class: "txt" }, text),
          h(
            "button",
            {
              "aria-label": "Move up",
              onclick: () => {
                if (i > 0) {
                  [items[i - 1], items[i]] = [items[i], items[i - 1]];
                  draw();
                }
              },
            },
            "↑",
          ),
          h(
            "button",
            {
              "aria-label": "Move down",
              onclick: () => {
                if (i < items.length - 1) {
                  [items[i + 1], items[i]] = [items[i], items[i + 1]];
                  draw();
                }
              },
            },
            "↓",
          ),
        );
        li.addEventListener("dragstart", () => (dragFrom = i));
        li.addEventListener("dragover", (e) => e.preventDefault());
        li.addEventListener("drop", (e) => {
          e.preventDefault();
          if (dragFrom == null) return;
          const [m] = items.splice(dragFrom, 1);
          items.splice(i, 0, m);
          dragFrom = null;
          draw();
        });
        return li;
      }),
    );
  draw();
  const submit = () =>
    finish({ order: items.slice() }, () => {
      ol.querySelectorAll("li").forEach((li, i) => {
        li.classList.add(items[i] === c.items[i] ? "right" : "wrong");
        li.querySelectorAll("button").forEach((b) => b.remove());
        li.draggable = false;
        if (items[i] !== c.items[i]) li.append(h("span", { class: "muted" }, `→ ${c.items[i]}`));
      });
    });
  btn.onclick = submit;
  body.addEventListener("timeup", () => {
    if (!state.submitted) {
      toast("⏱️ Time's up");
      submit();
    }
  });
  body.append(h("div", { class: "muted" }, "Drag, or use the arrows."), ol, h("p"), btn);
}
