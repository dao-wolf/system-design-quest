// The player's save. In the browser: download it, load it, or clear it. With the local coach server the record
// lives on this computer instead, so only the profile can be cleared here.
import { cleanProfile } from "../engine.js";
import { app } from "../state.js";
import { h, toast } from "../dom.js";
import { renderMap } from "./map.js";
import { renderProfile } from "./profile.js";

const isSave = (data) => data && data.game === "system-design-quest" && Array.isArray(data.events);

async function loadSave(file) {
  try {
    const data = JSON.parse(await file.files[0].text());
    if (!isSave(data)) throw new Error("not a save file");
    if (!confirm(`Load this save? It replaces what's in this browser (${data.events.length} events).`)) return;
    const events = data.events.filter((e) => e && typeof e === "object" && typeof e.kind === "string");
    app.store.replaceAll(events, cleanProfile(data.profile));
    app.events = events;
    app.profile = cleanProfile(data.profile);
    toast("💾 Save loaded");
    renderMap();
  } catch (e) {
    toast(`Couldn't load that file: ${e.message}`);
  }
}

function downloadSave() {
  const blob = new Blob(
    [
      JSON.stringify({
        game: "system-design-quest",
        v: 1,
        saved: new Date().toISOString(),
        profile: app.profile,
        events: app.events,
      }),
    ],
    { type: "application/json" },
  );
  const a = h("a", { href: URL.createObjectURL(blob), download: "system-design-quest-save.json" });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function clearProfile() {
  if (confirm("Clear your profile? Your progress stays.")) {
    app.store.clear(false);
    app.profile = {};
    renderProfile();
  }
}

function clearEverything() {
  if (confirm("Clear everything: your profile and all your progress? This can't be undone.")) {
    app.store.clear(true);
    app.profile = {};
    app.events = [];
    renderMap();
  }
}

export function saveCard() {
  const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.addEventListener("change", () => loadSave(file));
  return h(
    "div",
    { class: "card" },
    h("h2", {}, "💾 Your save"),
    h(
      "p",
      { class: "muted" },
      "Your progress lives only in this browser, and some browsers clear it after a few weeks without a visit. Download a save to keep it or move it to another device.",
    ),
    h(
      "div",
      { class: "row" },
      h("button", { class: "btn ghost", onclick: downloadSave }, "Download my save"),
      h("button", { class: "btn ghost", onclick: () => file.click() }, "Load a save"),
      file,
    ),
    h(
      "div",
      { class: "row", style: "margin-top:12px" },
      h("button", { class: "btn ghost small", onclick: clearProfile }, "Clear profile"),
      h("button", { class: "btn ghost small", onclick: clearEverything }, "Clear everything"),
    ),
  );
}

async function clearServerProfile() {
  if (confirm("Clear your profile? Your progress stays.")) {
    app.profile = {};
    await app.store.saveProfile({});
    renderProfile();
  }
}

// With the local coach server: the profile is the only thing to clear here.
export function clearRow() {
  return h(
    "div",
    { class: "row", style: "margin-top:12px" },
    h("button", { class: "btn ghost small", onclick: clearServerProfile }, "Clear profile"),
  );
}
