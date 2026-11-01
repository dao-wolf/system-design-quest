// Tiny DOM helpers. Nothing here writes raw HTML: every node is built with the DOM API, and styles go through
// el.style, which a strict CSP allows.
import { $, ROOT, clearTimers } from "./state.js";

// null, undefined and false leave an attribute or a child out, so h() can take conditionals inline.
const isLeftOut = (v) => v == null || v === false;

// "on…" adds a listener; "class" and "style" set properties; anything else is an attribute (true means present).
function setAttr(el, k, v) {
  if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
  else if (k === "class") el.className = v;
  else if (k === "style")
    el.style.cssText = v; // through the CSS object model, which a strict CSP allows
  else el.setAttribute(k, v === true ? "" : v);
}

const toNode = (kid) => (kid instanceof Node ? kid : document.createTextNode(String(kid)));

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (!isLeftOut(v)) setAttr(el, k, v);
  for (const kid of kids.flat()) if (!isLeftOut(kid)) el.append(toNode(kid));
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
  // Bring the top of the game back into view, below a host page's own header: scroll-margin-top is --sticky-top.
  // At once, even on a page that scrolls smoothly (daowolf.com): a new screen is like a new page, and the next tap
  // must land on what the player sees.
  const host = ROOT.host || document.body;
  if (host.getBoundingClientRect().top < headerHeight(host)) scrollToTop(host);
}
// How far a host page's own header reaches down the screen: the game's scroll-margin-top is --sticky-top.
const headerHeight = (host) => parseFloat(getComputedStyle(host).scrollMarginTop) || 0;
function scrollToTop(el) {
  try {
    el.scrollIntoView({ block: "start", behavior: "instant" });
  } catch {
    // A browser that predates "instant" rejects the option: scroll anyway.
    el.scrollIntoView(true);
  }
}
// Brings something that has just appeared into view, and does nothing if it is all there already. It stops below the
// host page's header and the game's own top bar, which stay stuck to the top of the screen. One taller than the screen
// lands with its top at the top, where the player starts reading, and so does one whose top is already out of sight
// (the player scrolled away before a timed answer ran out): "nearest" would leave such a one alone, or show its foot.
// At once, as in show().
export function scrollIntoReach(el) {
  const bar = ROOT.querySelector(".top");
  const gap = headerHeight(ROOT.host || document.body) + (bar ? bar.offsetHeight : 0) + 8;
  el.style.scrollMarginTop = `${gap}px`;
  const block = el.getBoundingClientRect().top < gap ? "start" : "nearest";
  try {
    el.scrollIntoView({ block, behavior: "instant" });
  } catch {
    el.scrollIntoView({ block });
  }
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
// One piece of a line: **bold**, *italic*, or plain text.
// True when part is text wrapped in the marker, such as **bold** or *italic*.
const isWrapped = (part, mark) => part.length > 2 * mark.length && part.startsWith(mark) && part.endsWith(mark);
function richPart(part) {
  if (isWrapped(part, "**")) return h("b", {}, part.slice(2, -2));
  if (isWrapped(part, "*")) return h("i", {}, part.slice(1, -1));
  return part;
}

export function richText(text) {
  // Plain text with **bold**, *italic* and line breaks, built as DOM nodes: nothing is ever parsed as HTML.
  const box = h("div");
  String(text)
    .split("\n")
    .forEach((line, i) => {
      if (i) box.append(h("br"));
      for (const part of line.split(/(\*\*.+?\*\*|\*.+?\*)/)) if (part) box.append(richPart(part));
    });
  return box;
}
