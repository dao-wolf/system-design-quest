// The shared app state: what the game has loaded, the run in play, and where it draws.
import { progress, recommend } from "./engine.js";

export const app = {
  bundle: null,
  events: [],
  store: null,
  coach: false,
  combo: 0,
  run: null,
  timers: [],
  coachNext: 0,
  assigned: [],
  profile: {},
  holds: [],
};
// The game draws inside one root (the <system-design-quest> element's shadow root) and loads its files relative
// to this script, so it works on its own page or embedded in any site.
export let ROOT = document;
export let BASE = new URL(".", import.meta.url);
export const $ = (id) => ROOT.getElementById(id);
export const session = Math.random().toString(36).slice(2, 10);

export function setRoot(root, base) {
  ROOT = root;
  BASE = base;
}

export function clearTimers() {
  app.timers.forEach(clearInterval);
  app.timers = [];
}

export function prog() {
  return progress(app.bundle, app.events, new Date(), app.profile);
}

export function chapterBySlug(slug) {
  return app.bundle.chapters.find((c) => c.slug === slug);
}

export function nextUp(p) {
  return recommend(app.bundle, p);
}
