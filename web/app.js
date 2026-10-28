// System Design Quest: the page. It starts the game and shows an error if it can't. All scoring comes from
// engine.js; the rest lives in the modules imported here.
import { cleanProfile } from "./engine.js";
import { $, BASE, app, setRoot } from "./state.js";
import { h, show } from "./dom.js";
import { LocalStore, ServerStore } from "./store.js";
import { pollCoach, renderCoach } from "./coach.js";
import { renderMap } from "./screens/map.js";
import { renderProfile } from "./screens/profile.js";

// root: where to draw (a shadow root holding #screen, #stats, #coach, #toasts, #home, #you).
// lookForServer: false on a public website, so the game never asks for a local coach server there.
export async function boot(root, { base = BASE, lookForServer = true } = {}) {
  setRoot(root, base);
  let server = false;
  if (lookForServer) {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      server = r.ok && (await r.json()).ok;
    } catch {
      /* no local server: play in the browser */
    }
  }
  app.store = server ? new ServerStore() : new LocalStore();
  app.coach = server;
  app.bundle = await (await fetch(new URL("chapters.json", BASE), { cache: "no-cache" })).json();
  app.events = await app.store.load();
  app.profile = cleanProfile(await app.store.loadProfile());
  app.holds = await app.store.holds();
  $("home").onclick = () => {
    if (!app.run || confirm("Back to the map? Your answers so far are kept.")) renderMap();
  };
  $("you").onclick = () => {
    if (!app.run || confirm("Leave this run? Your answers so far are kept.")) renderProfile();
  };
  if (app.coach) {
    renderCoach();
    await pollCoach();
    setInterval(pollCoach, 2500);
  }
  renderMap();
}

export function showError(e) {
  show(h("div", { class: "card" }, h("h2", {}, "Couldn't start"), h("p", {}, String(e))));
}
