// Storage: the local server's record, or the browser.
import { generate, localDay } from "./engine.js";
import { app, session } from "./state.js";

// The profile lives in the same place as the answers, and nowhere else: never in the address, the title or a request
// to anyone but the local server.
export class ServerStore {
  async load() {
    return (await fetch("/api/events", { cache: "no-store" })).json();
  }
  async add(ev) {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ev),
    });
  }
  async loadProfile() {
    try {
      return (await fetch("/api/profile", { cache: "no-store" })).json();
    } catch {
      return {};
    }
  }
  async saveProfile(p) {
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    });
  }
  async holds() {
    try {
      return (await fetch("/api/holds", { cache: "no-store" })).json();
    } catch {
      return [];
    }
  }
}
export class LocalStore {
  key = "sdq-events-v1";
  profileKey = "sdq-profile-v1";
  async load() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || "[]");
    } catch {
      return [];
    }
  }
  async add(ev) {
    try {
      const all = JSON.parse(localStorage.getItem(this.key) || "[]");
      all.push(ev);
      localStorage.setItem(this.key, JSON.stringify(all));
    } catch {
      /* storage unavailable: play on without saving */
    }
  }
  async loadProfile() {
    try {
      return JSON.parse(localStorage.getItem(this.profileKey) || "{}");
    } catch {
      return {};
    }
  }
  async saveProfile(p) {
    try {
      localStorage.setItem(this.profileKey, JSON.stringify(p));
    } catch {
      /* play on without saving */
    }
  }
  async holds() {
    return [];
  }
  replaceAll(events, profile) {
    localStorage.setItem(this.key, JSON.stringify(events));
    localStorage.setItem(this.profileKey, JSON.stringify(profile));
  }
  clear(everything) {
    try {
      localStorage.removeItem(this.profileKey);
      if (everything) localStorage.removeItem(this.key);
    } catch {
      /* nothing stored */
    }
  }
}

export function baseEvent(kind, extra = {}) {
  const now = new Date();
  return { v: 1, kind, ts: now.toISOString(), day: localDay(now), session, ...extra };
}
export async function post(ev) {
  app.events.push(ev);
  await app.store.add(ev);
}

// What the record keeps of a response: written text cut to length, and an estimate's worked answer.
export function summarise(c, res) {
  const out = { ...res };
  if (out.text) out.text = String(out.text).slice(0, 4000);
  if (c.type === "estimate") out.expected = generate(c.generator, res.seed).answer;
  return out;
}
