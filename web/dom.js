// Tiny DOM helpers. Nothing here writes raw HTML: every node is built with the DOM API, and styles go through
// el.style, which a strict CSP allows.
import { $, ROOT, clearTimers } from "./state.js";

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style")
      el.style.cssText = v; // through the CSS object model, which a strict CSP allows
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat())
    if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
export const svg = (tag, attrs = {}) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  return el;
};
const screen = () => $("screen");
export function show(...nodes) {
  clearTimers();
  const s = screen();
  s.replaceChildren(...nodes);
  s.focus({ preventScroll: true });
  // Bring the top of the game back into view, without jumping past a host page's own header.
  const host = ROOT.host || document.body;
  if (host.getBoundingClientRect().top < 0) host.scrollIntoView({ block: "start" });
}
export function toast(text) {
  const t = h("div", { class: "toast" }, text);
  $("toasts").append(t);
  setTimeout(() => t.remove(), 3800);
}
export function confetti() {
  const box = h("div", { class: "confetti" });
  for (let i = 0; i < 40; i++) {
    const s = h("span", {}, ["🎉", "⭐", "✨", "🏆"][i % 4]);
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.8}s`;
    box.append(s);
  }
  $("toasts").after(box);
  setTimeout(() => box.remove(), 3500);
}
export function richText(text) {
  // Plain text with **bold**, *italic* and line breaks, built as DOM nodes: nothing is ever parsed as HTML.
  const box = h("div");
  String(text)
    .split("\n")
    .forEach((line, i) => {
      if (i) box.append(h("br"));
      for (const part of line.split(/(\*\*.+?\*\*|\*.+?\*)/)) {
        if (!part) continue;
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) box.append(h("b", {}, part.slice(2, -2)));
        else if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          box.append(h("i", {}, part.slice(1, -1)));
        else box.append(part);
      }
    });
  return box;
}
