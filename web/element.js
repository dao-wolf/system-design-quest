// <system-design-quest>: the whole game as one element. Its styles live in a shadow root, so a host page's CSS
// can't reach in and the game's can't leak out.
//   <system-design-quest static theme="dark"></system-design-quest>
//   static       never look for a local coach server (use it on a public website)
//   theme        "dark" or "light" to override the visitor's system setting
import { boot, showError } from "./app.js";

const base = new URL(".", import.meta.url);

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

class SystemDesignQuest extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.append(
      el("link", { rel: "stylesheet", href: new URL("style.css", base).href }),
      el(
        "header",
        { class: "top" },
        el(
          "button",
          { class: "brand", id: "home", title: "Back to the map" },
          "⚔️ ",
          el("span", {}, "System Design Quest"),
        ),
        el("div", { class: "stats", id: "stats", "aria-live": "polite" }),
        el("button", { class: "you", id: "you", title: "Your profile: optional" }, "👤 You"),
      ),
      el(
        "div",
        { class: "layout" },
        el("section", { id: "screen", tabindex: "-1", "aria-label": "System Design Quest" }),
        el("aside", { id: "coach", class: "coach", hidden: "" }),
      ),
      el("div", { id: "toasts", class: "toasts", "aria-live": "polite" }),
    );
    boot(root, { base, lookForServer: !this.hasAttribute("static") }).catch(showError);
  }
}

if (!customElements.get("system-design-quest")) customElements.define("system-design-quest", SystemDesignQuest);
