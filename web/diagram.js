// Diagrams: SVG that scales with the page.
import { svg } from "./dom.js";

function wrapLabel(text, max = 16) {
  const words = String(text).split(" ");
  const lines = [""];
  for (const w of words) {
    if ((lines.at(-1) + " " + w).trim().length > max && lines.at(-1)) lines.push(w);
    else lines[lines.length - 1] = (lines.at(-1) + " " + w).trim();
  }
  return lines.slice(0, 3);
}

export function diagram(d, { slots = [], clickable = [], onNode = () => {}, onDrop = null } = {}) {
  const W = d.width || 640,
    H = d.height || 300;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H + 24}`, class: "diagram", role: "img" });
  const defs = svg("defs");
  const marker = svg("marker", {
    id: `arrow-${Math.random().toString(36).slice(2)}`,
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "7",
    markerHeight: "7",
    orient: "auto-start-reverse",
  });
  marker.append(svg("path", { d: "M0,0 L10,5 L0,10 z" }));
  defs.append(marker);
  root.append(defs);
  const box = {};
  for (const n of d.nodes) box[n.id] = { x: n.x, y: n.y, w: n.w || 120, h: n.h || 48, label: n.label };
  const edge = (a, b) => {
    const A = box[a],
      B = box[b];
    const ca = [A.x + A.w / 2, A.y + A.h / 2],
      cb = [B.x + B.w / 2, B.y + B.h / 2];
    const clip = (c, r, toward) => {
      const dx = toward[0] - c[0],
        dy = toward[1] - c[1];
      const t = Math.min(Math.abs(r.w / 2 / (dx || 1e-9)), Math.abs(r.h / 2 / (dy || 1e-9)));
      return [c[0] + dx * t, c[1] + dy * t];
    };
    return [clip(ca, A, cb), clip(cb, B, ca)];
  };
  for (const e of d.edges || []) {
    const [p, q] = edge(e[0], e[1]);
    root.append(
      svg("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: "edge", "marker-end": `url(#${marker.id})` }),
    );
    if (e[2]) {
      const t = svg("text", {
        x: (p[0] + q[0]) / 2,
        y: (p[1] + q[1]) / 2 - 5,
        "text-anchor": "middle",
        class: "edge-label",
      });
      t.textContent = e[2];
      root.append(t);
    }
  }
  const groups = {};
  const tagLayer = svg("g");
  for (const n of d.nodes) {
    const b = box[n.id];
    const isSlot = slots.includes(n.id);
    const g = svg("g", {
      class: `node${isSlot ? " slot" : ""}${clickable.includes(n.id) ? " clickable" : ""}`,
      tabindex: clickable.includes(n.id) ? "0" : "-1",
    });
    g.append(svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 }));
    const text = svg("text", { x: b.x + b.w / 2, "text-anchor": "middle" });
    g.append(text);
    groups[n.id] = { g, text };
    setText(n.id, isSlot ? "?" : n.label);
    if (clickable.includes(n.id)) {
      g.addEventListener("click", () => onNode(n.id));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNode(n.id);
        }
      });
    }
    if (onDrop && isSlot) {
      g.addEventListener("dragover", (e) => e.preventDefault());
      g.addEventListener("drop", (e) => {
        e.preventDefault();
        onDrop(n.id, e.dataTransfer.getData("text/plain"));
      });
    }
    root.append(g);
  }
  root.append(tagLayer);
  function setText(id, label) {
    const { text } = groups[id];
    const b = box[id];
    const lines = wrapLabel(label);
    text.replaceChildren();
    const top = b.y + b.h / 2 - ((lines.length - 1) * 15) / 2 + 4;
    lines.forEach((ln, i) => {
      const ts = svg("tspan", { x: b.x + b.w / 2, y: top + i * 15 });
      ts.textContent = ln;
      text.append(ts);
    });
  }
  function drawTags(map) {
    tagLayer.replaceChildren();
    for (const [id, list] of Object.entries(map)) {
      const b = box[id];
      list.forEach((item, i) => {
        const t = svg("text", {
          x: b.x + b.w / 2,
          y: b.y + b.h + 13 + i * 12,
          "text-anchor": "middle",
          class: `tag ${item.cls || "plain"}`,
        });
        t.textContent = `${item.cls === "ok" ? "✓ " : item.cls === "no" ? "✗ " : item.cls === "miss" ? "+ " : "🏷 "}${item.s}`;
        tagLayer.append(t);
      });
    }
  }
  return {
    el: root,
    update(placed) {
      for (const id of slots) {
        setText(id, placed[id] || "?");
        groups[id].g.classList.toggle("filled", !!placed[id]);
      }
    },
    pick(id) {
      for (const [k, v] of Object.entries(groups)) v.g.classList.toggle("picked", k === id);
    },
    tags(placed) {
      drawTags(Object.fromEntries(Object.entries(placed).map(([id, l]) => [id, l.map((s) => ({ s }))])));
    },
    tagResult(result) {
      drawTags(result);
    },
    result(fn) {
      for (const id of Object.keys(groups)) {
        const r = fn(id);
        groups[id].g.classList.remove("picked", "clickable");
        if (!r) continue;
        groups[id].g.classList.add(r.ok ? "right" : "wrong");
        if (r.text) setText(id, r.text);
      }
    },
  };
}
