// Diagrams: SVG that scales with the page.
import { svg } from "./dom.js";

const TAG_MARK = { ok: "✓ ", no: "✗ ", miss: "+ " };

// A box's label as up to three lines of about 16 characters, broken between words.
function wrapLabel(text, max = 16) {
  const words = String(text).split(" ");
  const lines = [""];
  for (const w of words) {
    if ((lines.at(-1) + " " + w).trim().length > max && lines.at(-1)) lines.push(w);
    else lines[lines.length - 1] = (lines.at(-1) + " " + w).trim();
  }
  return lines.slice(0, 3);
}

function options({ slots = [], clickable = [], onNode = () => {}, onDrop = null } = {}) {
  return { slots, clickable, onNode, onDrop };
}

function arrowMarker() {
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
  return marker;
}

function layout(nodes) {
  const box = {};
  for (const n of nodes) box[n.id] = { x: n.x, y: n.y, w: n.w || 120, h: n.h || 48, label: n.label };
  return box;
}

const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];

// Where a line from the centre c of box r, heading for a point, leaves the box.
function clip(c, r, toward) {
  const dx = toward[0] - c[0],
    dy = toward[1] - c[1];
  const t = Math.min(Math.abs(r.w / 2 / (dx || 1e-9)), Math.abs(r.h / 2 / (dy || 1e-9)));
  return [c[0] + dx * t, c[1] + dy * t];
}

// An arrow between two boxes runs from edge to edge, not centre to centre.
function edgeEnds(A, B) {
  const ca = centre(A),
    cb = centre(B);
  return [clip(ca, A, cb), clip(cb, B, ca)];
}

function drawEdge(root, box, e, markerId) {
  const [p, q] = edgeEnds(box[e[0]], box[e[1]]);
  root.append(
    svg("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: "edge", "marker-end": `url(#${markerId})` }),
  );
  if (!e[2]) return;
  const t = svg("text", {
    x: (p[0] + q[0]) / 2,
    y: (p[1] + q[1]) / 2 - 5,
    "text-anchor": "middle",
    class: "edge-label",
  });
  t.textContent = e[2];
  root.append(t);
}

// A box answers a click, Enter or Space.
function onActivate(g, act) {
  g.addEventListener("click", act);
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      act();
    }
  });
}

function onDropLabel(g, drop) {
  g.addEventListener("dragover", (e) => e.preventDefault());
  g.addEventListener("drop", (e) => {
    e.preventDefault();
    drop(e.dataTransfer.getData("text/plain"));
  });
}

function nodeGroup(n, b, o) {
  const isSlot = o.slots.includes(n.id);
  const canClick = o.clickable.includes(n.id);
  const g = svg("g", {
    class: `node${isSlot ? " slot" : ""}${canClick ? " clickable" : ""}`,
    tabindex: canClick ? "0" : "-1",
  });
  g.append(svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 }));
  const text = svg("text", { x: b.x + b.w / 2, "text-anchor": "middle" });
  g.append(text);
  if (canClick) onActivate(g, () => o.onNode(n.id));
  if (o.onDrop && isSlot) onDropLabel(g, (label) => o.onDrop(n.id, label));
  return { g, text, isSlot };
}

function writeLabel(text, b, label) {
  const lines = wrapLabel(label);
  text.replaceChildren();
  const top = b.y + b.h / 2 - ((lines.length - 1) * 15) / 2 + 4;
  lines.forEach((ln, i) => {
    const ts = svg("tspan", { x: b.x + b.w / 2, y: top + i * 15 });
    ts.textContent = ln;
    text.append(ts);
  });
}

// A sticker under a box: plain while placing, then ✓ right, ✗ wrong or + missed after checking.
function tagText(b, item, i) {
  const t = svg("text", {
    x: b.x + b.w / 2,
    y: b.y + b.h + 13 + i * 12,
    "text-anchor": "middle",
    class: `tag ${item.cls || "plain"}`,
  });
  t.textContent = `${TAG_MARK[item.cls] ?? "🏷 "}${item.s}`;
  return t;
}

function markResult(group, r, setText) {
  group.g.classList.remove("picked", "clickable");
  if (!r) return;
  group.g.classList.add(r.ok ? "right" : "wrong");
  if (r.text) setText(r.text);
}

// What a challenge can do with a drawn diagram.
function controls({ root, box, groups, tagLayer, slots }) {
  const setText = (id, label) => writeLabel(groups[id].text, box[id], label);
  const drawTags = (map) => {
    tagLayer.replaceChildren();
    for (const [id, list] of Object.entries(map)) list.forEach((item, i) => tagLayer.append(tagText(box[id], item, i)));
  };
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
      for (const id of Object.keys(groups)) markResult(groups[id], fn(id), (text) => setText(id, text));
    },
  };
}

export function diagram(d, opts) {
  const o = options(opts);
  const W = d.width || 640,
    H = d.height || 300;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H + 24}`, class: "diagram", role: "img" });
  const defs = svg("defs");
  const marker = arrowMarker();
  defs.append(marker);
  root.append(defs);
  const box = layout(d.nodes);
  for (const e of d.edges || []) drawEdge(root, box, e, marker.id);
  const groups = {};
  for (const n of d.nodes) {
    groups[n.id] = nodeGroup(n, box[n.id], o);
    writeLabel(groups[n.id].text, box[n.id], groups[n.id].isSlot ? "?" : n.label);
    root.append(groups[n.id].g);
  }
  const tagLayer = svg("g");
  root.append(tagLayer);
  return controls({ root, box, groups, tagLayer, slots: o.slots });
}
