// You: the optional profile, hold-backs for mocks, and the browser save.
import { INTERVIEW_TYPES, PROFILE_MAX, cleanProfile, holdActive, isDate, localDay } from "../engine.js";
import { app } from "../state.js";
import { h, show, toast } from "../dom.js";
import { renderStats } from "../stats.js";
import { renderMap } from "./map.js";

export function renderProfile() {
  app.run = null;
  renderStats();
  const me = app.profile;
  const field = (key, label, placeholder) => {
    const input = h("input", {
      type: "text",
      maxlength: PROFILE_MAX,
      placeholder,
      value: me[key] || "",
      autocomplete: "off",
    });
    input.dataset.key = key;
    return h("label", { class: "field" }, h("span", {}, label), input);
  };
  const type = h(
    "select",
    {},
    h("option", { value: "" }, "Not set"),
    INTERVIEW_TYPES.map((t) => h("option", { value: t, selected: me.interview_type === t }, t)),
  );
  const date = h("input", { type: "date", value: me.interview_date || "" });
  const fields = [
    field("name", "Your name", "What should the game call you?"),
    field("company", "Interviewing with", "For example, Acme"),
    field("role", "Role", "For example, Engineering manager"),
    h("label", { class: "field" }, h("span", {}, "Interview type"), type),
    h("label", { class: "field" }, h("span", {}, "Interview date"), date),
  ];
  const save = async () => {
    const next = { ...app.profile };
    for (const el of fields) {
      const input = el.querySelector("input[data-key]");
      if (input) next[input.dataset.key] = input.value;
    }
    next.interview_type = type.value;
    next.interview_date = date.value;
    app.profile = cleanProfile(next);
    await app.store.saveProfile(app.profile);
    toast("👤 Saved");
    renderMap();
  };
  const where = app.coach
    ? "Saved on this computer, next to your answers. Claude Code reads it to coach you; only you change it, here."
    : "Stays in this browser. Nothing is sent anywhere.";
  const kids = [
    h(
      "div",
      { class: "card" },
      h("h1", {}, "👤 You"),
      h("p", { class: "muted" }, "Every field is optional, and the game works the same with none. ", where),
      h("div", { class: "fields" }, fields),
      h(
        "p",
        { class: "muted" },
        "With a date, the header counts down to it. Nothing locks or unlocks by date: chapters open as you beat bosses.",
      ),
      h(
        "div",
        { class: "row" },
        h("button", { class: "btn", onclick: save }, "Save"),
        h("button", { class: "btn ghost", onclick: renderMap }, "Back to the map"),
      ),
    ),
  ];

  if (app.holds.length) {
    const today = localDay(new Date());
    const rows = app.holds.map((hold) => {
      const mine = (me.holds && me.holds[hold.id]) || { lifts: null, lifted: false };
      const active = holdActive(hold.id, me, today);
      const status = !active
        ? "Lifted"
        : isDate(mine.lifts)
          ? `Lifts on ${mine.lifts}`
          : isDate(me.interview_date)
            ? `Lifts the day after your interview (${me.interview_date})`
            : "Held until you lift it";
      const when = h("input", { type: "date", value: mine.lifts || "", disabled: !active });
      const setHold = async (patch) => {
        app.profile = cleanProfile({
          ...app.profile,
          holds: { ...(app.profile.holds || {}), [hold.id]: { ...mine, ...patch } },
        });
        await app.store.saveProfile(app.profile);
        toast("🔒 Saved. It takes effect the next time the quest is built.");
        renderProfile();
      };
      when.addEventListener("change", () => setHold({ lifts: when.value || null }));
      return h(
        "div",
        { class: "hold row spread" },
        h("div", {}, h("b", {}, `🔒 ${hold.label}`), h("div", { class: "muted" }, status)),
        active
          ? h(
              "div",
              { class: "row" },
              h("label", { class: "field inline" }, h("span", {}, "Lift on"), when),
              h(
                "button",
                {
                  class: "btn ghost small",
                  onclick: () => {
                    if (confirm(`Lift "${hold.label}" now? Its topics join the game.`)) setHold({ lifted: true });
                  },
                },
                "Lift now",
              ),
            )
          : null,
      );
    });
    kids.push(
      h(
        "div",
        { class: "card" },
        h("h2", {}, "Hold-backs for mocks"),
        h(
          "p",
          { class: "muted" },
          "Topics held back so a mock stays a fair test. You never see which; you decide when they join.",
        ),
        rows,
      ),
    );
  }

  if (!app.coach) {
    const file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
    file.addEventListener("change", async () => {
      try {
        const data = JSON.parse(await file.files[0].text());
        if (!data || data.game !== "system-design-quest" || !Array.isArray(data.events))
          throw new Error("not a save file");
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
    });
    const download = () => {
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
    };
    kids.push(
      h(
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
          h("button", { class: "btn ghost", onclick: download }, "Download my save"),
          h("button", { class: "btn ghost", onclick: () => file.click() }, "Load a save"),
          file,
        ),
        h(
          "div",
          { class: "row", style: "margin-top:12px" },
          h(
            "button",
            {
              class: "btn ghost small",
              onclick: () => {
                if (confirm("Clear your profile? Your progress stays.")) {
                  app.store.clear(false);
                  app.profile = {};
                  renderProfile();
                }
              },
            },
            "Clear profile",
          ),
          h(
            "button",
            {
              class: "btn ghost small",
              onclick: () => {
                if (confirm("Clear everything: your profile and all your progress? This can't be undone.")) {
                  app.store.clear(true);
                  app.profile = {};
                  app.events = [];
                  renderMap();
                }
              },
            },
            "Clear everything",
          ),
        ),
      ),
    );
  } else {
    kids.push(
      h(
        "div",
        { class: "row", style: "margin-top:12px" },
        h(
          "button",
          {
            class: "btn ghost small",
            onclick: async () => {
              if (confirm("Clear your profile? Your progress stays.")) {
                app.profile = {};
                await app.store.saveProfile({});
                renderProfile();
              }
            },
          },
          "Clear profile",
        ),
      ),
    );
  }
  show(...kids);
}
