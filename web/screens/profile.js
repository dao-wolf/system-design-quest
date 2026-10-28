// You: the optional profile, and hold-backs for mocks. The save and clear buttons are in save.js.
import { INTERVIEW_TYPES, PROFILE_MAX, cleanProfile, holdActive, isDate, localDay } from "../engine.js";
import { app } from "../state.js";
import { h, show, toast } from "../dom.js";
import { renderStats } from "../stats.js";
import { renderMap } from "./map.js";
import { clearRow, saveCard } from "./save.js";

function textField(me, key, label, placeholder) {
  const input = h("input", {
    type: "text",
    maxlength: PROFILE_MAX,
    placeholder,
    value: me[key] || "",
    autocomplete: "off",
  });
  input.dataset.key = key;
  return h("label", { class: "field" }, h("span", {}, label), input);
}

async function saveProfile(fields, type, date) {
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
}

function profileCard(me) {
  const type = h(
    "select",
    {},
    h("option", { value: "" }, "Not set"),
    INTERVIEW_TYPES.map((t) => h("option", { value: t, selected: me.interview_type === t }, t)),
  );
  const date = h("input", { type: "date", value: me.interview_date || "" });
  const fields = [
    textField(me, "name", "Your name", "What should the game call you?"),
    textField(me, "company", "Interviewing with", "For example, Acme"),
    textField(me, "role", "Role", "For example, Engineering manager"),
    h("label", { class: "field" }, h("span", {}, "Interview type"), type),
    h("label", { class: "field" }, h("span", {}, "Interview date"), date),
  ];
  const where = app.coach
    ? "Saved on this computer, next to your answers. Claude Code reads it to coach you; only you change it, here."
    : "Stays in this browser. Nothing is sent anywhere.";
  return h(
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
      h("button", { class: "btn", onclick: () => saveProfile(fields, type, date) }, "Save"),
      h("button", { class: "btn ghost", onclick: renderMap }, "Back to the map"),
    ),
  );
}

function holdStatus(active, mine, me) {
  if (!active) return "Lifted";
  if (isDate(mine.lifts)) return `Lifts on ${mine.lifts}`;
  if (isDate(me.interview_date)) return `Lifts the day after your interview (${me.interview_date})`;
  return "Held until you lift it";
}

async function setHold(id, mine, patch) {
  app.profile = cleanProfile({
    ...app.profile,
    holds: { ...(app.profile.holds || {}), [id]: { ...mine, ...patch } },
  });
  await app.store.saveProfile(app.profile);
  toast("🔒 Saved. It takes effect the next time the quest is built.");
  renderProfile();
}

// One hold-back: its label and status, and while it's active, a date to lift it or a button to lift it now.
function holdRow(hold, me, today) {
  const mine = (me.holds && me.holds[hold.id]) || { lifts: null, lifted: false };
  const active = holdActive(hold.id, me, today);
  const when = h("input", { type: "date", value: mine.lifts || "", disabled: !active });
  when.addEventListener("change", () => setHold(hold.id, mine, { lifts: when.value || null }));
  const liftNow = () => {
    if (confirm(`Lift "${hold.label}" now? Its topics join the game.`)) setHold(hold.id, mine, { lifted: true });
  };
  return h(
    "div",
    { class: "hold row spread" },
    h("div", {}, h("b", {}, `🔒 ${hold.label}`), h("div", { class: "muted" }, holdStatus(active, mine, me))),
    active
      ? h(
          "div",
          { class: "row" },
          h("label", { class: "field inline" }, h("span", {}, "Lift on"), when),
          h("button", { class: "btn ghost small", onclick: liftNow }, "Lift now"),
        )
      : null,
  );
}

function holdsCard(me) {
  const today = localDay(new Date());
  return h(
    "div",
    { class: "card" },
    h("h2", {}, "Hold-backs for mocks"),
    h(
      "p",
      { class: "muted" },
      "Topics held back so a mock stays a fair test. You never see which; you decide when they join.",
    ),
    app.holds.map((hold) => holdRow(hold, me, today)),
  );
}

export function renderProfile() {
  app.run = null;
  renderStats();
  const me = app.profile;
  const kids = [profileCard(me)];
  if (app.holds.length) kids.push(holdsCard(me));
  kids.push(app.coach ? clearRow() : saveCard());
  show(...kids);
}
