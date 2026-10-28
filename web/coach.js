// The coach panel: only when the local server is running.
import { $, ROOT, app } from "./state.js";
import { h, richText, toast } from "./dom.js";
import { startSingle } from "./play.js";

export function renderCoach() {
  const panel = $("coach");
  panel.hidden = false;
  ROOT.querySelector(".layout").classList.add("with-coach");
  panel.replaceChildren(
    h(
      "div",
      { class: "row spread" },
      h("h3", { style: "margin:0" }, "💬 Coach"),
      h("span", { class: "pill" }, "Claude Code"),
    ),
    h(
      "div",
      { class: "muted", style: "font-size:13px" },
      'When Claude Code is running beside you, it sees your written answers and "Ask coach" requests and replies here. It never sets your points.',
    ),
    h("div", { id: "assigned" }),
    h("div", { class: "msgs", id: "msgs" }),
  );
}

function coachMessage(m) {
  const time = new Date(m.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return h("div", { class: "msg" }, h("div", { class: "t" }, time), richText(m.text));
}

function showMessages(messages) {
  if (!messages.length) return;
  const box = $("msgs");
  box.append(...messages.map(coachMessage));
  box.scrollTop = box.scrollHeight;
  if (app.coachNext > 0) toast("💬 The coach replied");
}

function assignedCard(a) {
  const chapter = a.chapter ? app.bundle.chapters.find((c) => c.chapter === a.chapter) : null;
  return h(
    "div",
    { class: "assigned" },
    h("div", {}, h("b", {}, "🎯 Coach's challenge"), a.why ? h("div", { class: "muted" }, a.why) : null),
    h("div", {}, a.challenge.prompt),
    h("button", { class: "btn small", onclick: () => startSingle(a.challenge, chapter) }, "Play it"),
  );
}

// The coach's challenges you haven't answered yet.
function showAssigned(assigned) {
  const done = new Set(app.events.filter((e) => e.kind === "answer").map((e) => e.challenge));
  const open = assigned.filter((a) => !done.has(a.challenge.id));
  if (open.length === app.assigned.length) return;
  if (open.length > app.assigned.length) toast("🎯 The coach set you a challenge");
  app.assigned = open;
  $("assigned").replaceChildren(...open.map(assignedCard));
}

export async function pollCoach() {
  try {
    const r = await (await fetch(`/api/coach?after=${app.coachNext}`, { cache: "no-store" })).json();
    showMessages(r.messages);
    app.coachNext = r.next;
    showAssigned(await (await fetch("/api/assigned", { cache: "no-store" })).json());
  } catch {
    /* the server went away; try again next tick */
  }
}
