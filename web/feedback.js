// The feedback after an answer: the verdict, the points, the explanation and its source, then Next, Ask coach and
// Flag.
import { app } from "./state.js";
import { h, richText } from "./dom.js";
import { baseEvent, post, summarise } from "./store.js";
import { REVEAL_TEXT } from "./challenges/index.js";
import { advance } from "./play.js";

const BOSS_BEATEN = "👹 Boss beaten!";

// The verdict and its colour. A boss counts as beaten at 80%, short of full marks.
function verdictOf(s, fraction, isBoss) {
  if (s.correct) return [isBoss ? BOSS_BEATEN : "✅ Right", "right"];
  if (fraction < 0.5) return ["❌ Not this time", "wrong"];
  return isBoss && fraction >= 0.8 ? [BOSS_BEATEN, "right"] : ["🟡 Partly", "part"];
}

// A public source links out; a personal one names the note it came from.
function sourceLine(source) {
  if (!source) return null;
  if (source.startsWith("vault:")) return h("div", { class: "source muted" }, `📖 In your notes: ${source.slice(6)}`);
  return h("div", { class: "source" }, "📖 ", h("a", { href: source, target: "_blank", rel: "noopener" }, "Source"));
}

// A box for a note under the buttons, and its send button: once sent, the box says so.
function noteBox({ field, wrapAttrs, label, send, sent }) {
  const button = h(
    "button",
    {
      class: "btn small",
      onclick: async () => {
        await send(field.value);
        wrap.replaceChildren(h("div", { class: "muted" }, sent));
      },
    },
    label,
  );
  const wrap = h("div", wrapAttrs, field, button);
  return wrap;
}

function askCoach(c, res, where) {
  const ta = h("textarea", { placeholder: "What do you want to ask? (optional)", style: "min-height:60px" });
  where.after(
    noteBox({
      field: ta,
      wrapAttrs: { style: "width:100%" },
      label: "Send to coach",
      send: (text) =>
        post(
          baseEvent("coach_request", {
            coach: true,
            challenge: c.id,
            prompt: c.prompt,
            response: summarise(c, res),
            question: text.slice(0, 1000),
          }),
        ),
      sent: "💬 Sent. The coach answers in the panel.",
    }),
  );
  ta.focus();
}

// A flag is only saved on this device. The way to send it on is a GitHub issue the player chooses to open, with their
// words already in it: nothing is sent until they submit it there.
const ISSUE_URL = "https://github.com/dao-wolf/system-design-quest/issues/new";
// Cut to a length in whole characters: a cut through an emoji would leave half of it, which can't go in a link.
const clip = (text, max) => Array.from(text).slice(0, max).join("");
function issueUrl(c, note) {
  const fields = {
    template: "wrong-answer.yml",
    title: `Wrong answer? ${c.id}`,
    challenge: `${c.id}: ${clip(c.prompt, 150)}`,
    why: note,
  };
  return `${ISSUE_URL}?${Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}`;
}

// What replaces the form once the flag is saved: where it went, and the way to send it on.
function savedLine(link) {
  return h(
    "div",
    { class: "muted", tabindex: "-1" },
    "🚩 Saved on this device. To send it to me, ",
    h(
      "a",
      {
        href: link,
        target: "_blank",
        rel: "noopener noreferrer",
        title:
          "Opens a GitHub issue with your note filled in. It is public, and nothing is sent until you submit it there.",
      },
      "report it on GitHub",
    ),
    ".",
  );
}

// The Flag button and the place its form opens: one form at a time, opened and closed by the button. "Flag it" waits
// for some words, and once sent the form folds into one line that says where the flag went.
function flagControl(c) {
  const slot = h("div");
  const field = h("input", {
    type: "text",
    placeholder: "What's wrong with it?",
    "aria-label": "What's wrong with it?",
  });
  const send = h("button", { class: "btn small", disabled: true, onclick: () => submit() }, "Flag it");
  const form = h("div", { class: "row", style: "width:100%" }, field, send);
  const button = h("button", { class: "btn ghost", "aria-expanded": "false", onclick: () => toggle() }, "🚩 Flag");
  field.addEventListener("input", () => {
    send.disabled = !field.value.trim();
  });
  field.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  // While a flag is being saved nothing can change it, add a second one or close the form.
  const lock = (on) => {
    field.disabled = button.disabled = on;
    send.disabled = on || !field.value.trim();
  };

  function toggle() {
    const open = !form.isConnected;
    if (open) slot.replaceChildren(form);
    else form.remove();
    button.setAttribute("aria-expanded", String(open));
    if (open) field.focus();
  }
  async function submit() {
    if (send.disabled) return;
    lock(true);
    const note = clip(field.value.trim(), 500);
    const link = issueUrl(c, note);
    try {
      await post(baseEvent("flag", { coach: app.coach, challenge: c.id, note }));
    } catch {
      return lock(false); // not saved: the form stays, to try again
    }
    const saved = savedLine(link);
    slot.replaceChildren(saved);
    saved.focus();
    button.setAttribute("aria-expanded", "false");
    button.textContent = "🚩 Flagged";
  }
  return { button, slot };
}

function feedbackActions(c, res) {
  const actions = h("div", { class: "row", style: "margin-top:12px" });
  const nextBtn = h("button", { class: "btn", onclick: () => advance() }, "Next ▶");
  actions.append(nextBtn);
  if (app.coach)
    actions.append(h("button", { class: "btn ghost", onclick: () => askCoach(c, res, actions) }, "💬 Ask coach"));
  const flag = flagControl(c);
  actions.append(flag.button);
  setTimeout(() => nextBtn.focus(), 50);
  return [actions, flag.slot];
}

export function feedback({ c, isBoss }, res, fraction, s) {
  const [verdict, cls] = verdictOf(s, fraction, isBoss);
  const reveal = REVEAL_TEXT[c.type];
  return h(
    "div",
    { class: `feedback ${cls}` },
    s.points ? h("div", { class: "plus" }, `+${s.points}`) : null,
    h(
      "div",
      { class: "verdict" },
      verdict,
      s.multiplier > 1 && s.correct ? h("span", { class: "combo" }, `  🔥 ×${s.multiplier}`) : "",
    ),
    !s.correct && fraction < 1
      ? h("div", { class: "muted" }, "It comes back at the end of the run for a second chance.")
      : null,
    reveal ? reveal(c, res) : null,
    h("div", { style: "margin-top:8px" }, richText(c.explain)),
    sourceLine(c.source),
    feedbackActions(c, res),
  );
}
