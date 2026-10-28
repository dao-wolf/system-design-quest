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

function flag(c, where) {
  const ta = h("input", { type: "text", placeholder: "What's wrong with it?" });
  where.after(
    noteBox({
      field: ta,
      wrapAttrs: { class: "row", style: "width:100%" },
      label: "Flag it",
      send: (text) => post(baseEvent("flag", { coach: app.coach, challenge: c.id, note: text.slice(0, 500) })),
      sent: "🚩 Flagged. It'll be reviewed.",
    }),
  );
  ta.focus();
}

function feedbackActions(c, res) {
  const actions = h("div", { class: "row", style: "margin-top:12px" });
  const nextBtn = h("button", { class: "btn", onclick: () => advance() }, "Next ▶");
  actions.append(nextBtn);
  if (app.coach)
    actions.append(h("button", { class: "btn ghost", onclick: () => askCoach(c, res, actions) }, "💬 Ask coach"));
  actions.append(h("button", { class: "btn ghost", onclick: () => flag(c, actions) }, "🚩 Flag"));
  setTimeout(() => nextBtn.focus(), 50);
  return actions;
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
