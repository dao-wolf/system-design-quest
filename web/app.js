// System Design Quest: the page. All scoring comes from engine.js.
import {
  check,
  score,
  progress,
  generate,
  runOrder,
  shuffle,
  localDay,
  multiplier,
  cleanProfile,
  holdActive,
  isDate,
  isQuest,
  recommend,
  INTERVIEW_TYPES,
  PROFILE_MAX,
} from "./engine.js";

const TYPE_LABEL = {
  recall: "🃏 Recall",
  multi: "☑️ Pick all that apply",
  duel: "⚖️ Trade-off duel",
  write: "✍️ Write it",
  estimate: "🔢 Estimate",
  fill: "🧩 Fill the diagram",
  sticker: "🏷️ Sticker the diagram",
  flaw: "🔍 Spot the flaw",
  order: "↕️ Put it in order",
  lightning: "⚡ Lightning round",
  sprint: "⏱️ Sprint",
};
const SELF_GRADED = new Set(["recall", "write", "sprint", "lightning"]);
const BADGE_EMOJI = { "first-boss": "🏆", "combo-5": "🔥", "sure-shot": "🎯", comeback: "🔁", "all-bosses": "👑" };

const app = {
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
let ROOT = document;
let BASE = new URL(".", import.meta.url);
const $ = (id) => ROOT.getElementById(id);
const session = Math.random().toString(36).slice(2, 10);

// ---------- tiny DOM helpers ----------

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style")
      el.style.cssText = v; // through the CSS object model, which a strict CSP allows
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat())
    if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "style") el.style.cssText = v;
    else el.setAttribute(k, v);
  }
  return el;
};
const screen = () => $("screen");
function show(...nodes) {
  clearTimers();
  const s = screen();
  s.replaceChildren(...nodes);
  s.focus({ preventScroll: true });
  // Bring the top of the game back into view, without jumping past a host page's own header.
  const host = ROOT.host || document.body;
  if (host.getBoundingClientRect().top < 0) host.scrollIntoView({ block: "start" });
}
function clearTimers() {
  app.timers.forEach(clearInterval);
  app.timers = [];
}
function toast(text) {
  const t = h("div", { class: "toast" }, text);
  $("toasts").append(t);
  setTimeout(() => t.remove(), 3800);
}
function confetti() {
  const box = h("div", { class: "confetti" });
  for (let i = 0; i < 40; i++) {
    const s = h("span", {}, ["🎉", "⭐", "✨", "🏆"][i % 4]);
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.8}s`;
    box.append(s);
  }
  $("toasts").after(box);
  setTimeout(() => box.remove(), 3500);
}
function richText(text) {
  // Plain text with **bold**, *italic* and line breaks, built as DOM nodes: nothing is ever parsed as HTML.
  const box = h("div");
  String(text)
    .split("\n")
    .forEach((line, i) => {
      if (i) box.append(h("br"));
      for (const part of line.split(/(\*\*.+?\*\*|\*.+?\*)/)) {
        if (!part) continue;
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) box.append(h("b", {}, part.slice(2, -2)));
        else if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          box.append(h("i", {}, part.slice(1, -1)));
        else box.append(part);
      }
    });
  return box;
}

// ---------- storage: the local server's record, or the browser ----------

// The profile lives in the same place as the answers, and nowhere else: never in the address, the title or a request
// to anyone but the local server.
class ServerStore {
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
class LocalStore {
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

function baseEvent(kind, extra = {}) {
  const now = new Date();
  return { v: 1, kind, ts: now.toISOString(), day: localDay(now), session, ...extra };
}
async function post(ev) {
  app.events.push(ev);
  await app.store.add(ev);
}

// ---------- header stats ----------

function prog() {
  return progress(app.bundle, app.events, new Date(), app.profile);
}
function renderStats() {
  const p = prog();
  const stats = [h("span", { class: "stat" }, "⭐ ", h("b", {}, p.xp.toLocaleString("en-GB")), " XP")];
  if (p.daysLeft != null && p.daysLeft >= 0) {
    const to = app.profile.company || "your interview";
    stats.push(
      p.daysLeft === 0
        ? h(
            "span",
            { class: "stat" },
            "🎯 ",
            h("b", {}, `${app.profile.company ? `${app.profile.company} interview` : "Interview"} today`),
          )
        : h("span", { class: "stat" }, "⏳ ", h("b", {}, p.daysLeft), ` day${p.daysLeft === 1 ? "" : "s"} to ${to}`),
    );
  }
  stats.push(
    h(
      "span",
      { class: "stat", title: "Days you played, of the last five weekdays. Weekends never count against you." },
      "📅 ",
      h("b", {}, p.weekdays),
      " of the last 5 weekdays",
    ),
  );
  if (app.combo >= 2)
    stats.push(
      h(
        "span",
        { class: "stat combo" },
        `🔥 ${app.combo} in a row${multiplier(app.combo) > 1 ? ` · ×${multiplier(app.combo)}` : ""}`,
      ),
    );
  $("stats").replaceChildren(...stats);
}

// ---------- the map ----------

function chapterBySlug(slug) {
  return app.bundle.chapters.find((c) => c.slug === slug);
}

function nextUp(p) {
  return recommend(app.bundle, p);
}
// "Chapter 3" for training, "Quest 2" for quests (numbered in their own order).
function label(ch) {
  if (!isQuest(ch)) return `Chapter ${ch.chapter}`;
  const quests = app.bundle.chapters.filter(isQuest).sort((a, b) => a.chapter - b.chapter);
  return `Quest ${quests.indexOf(ch) + 1}`;
}

function renderMap() {
  app.run = null;
  app.combo = 0;
  renderStats();
  const p = prog();
  // Record each newly opened chapter, so it stays open whatever changes later.
  for (const slug of p.newUnlocks) post(baseEvent("unlock", { slug }));
  const up = nextUp(p);
  const totalBosses = app.bundle.chapters.length;
  const beaten = Object.values(p.chapters).filter((c) => c.bossBeaten).length;
  const me = app.profile;
  const about = [me.role, me.interview_type, me.company].filter(Boolean).join(" · ");
  const kids = [
    h(
      "div",
      { class: "hero" },
      h(
        "div",
        {},
        h("h1", {}, me.name ? `${me.name}'s quest map` : "Your quest map"),
        about ? h("div", { class: "muted" }, `🎯 ${about}`) : null,
        h(
          "div",
          { class: "muted" },
          `${beaten} of ${totalBosses} bosses beaten. Points come from right answers only; a miss costs nothing and comes back later.`,
        ),
      ),
      p.badges.length
        ? h(
            "div",
            { class: "badges" },
            p.badges.map((b) =>
              h("span", { class: "pill", title: b.label }, `${BADGE_EMOJI[b.id] || "🏅"} ${b.label}`),
            ),
          )
        : null,
    ),
    h(
      "div",
      { class: "bar", title: `${beaten} of ${totalBosses} bosses` },
      h("i", { style: `width:${(100 * beaten) / Math.max(1, totalBosses)}%` }),
    ),
    h("p"),
  ];
  const isEmpty = !["name", "company", "role", "interview_type", "interview_date"].some((k) => me[k]);
  if (isEmpty && !me.intro_dismissed) {
    kids.push(
      h(
        "div",
        { class: "card hint row spread" },
        h("span", {}, "👤 Interviewing soon? Add it for a countdown. Optional: the game works the same without it."),
        h(
          "span",
          { class: "row" },
          h("button", { class: "btn small", onclick: renderProfile }, "Add it"),
          h(
            "button",
            {
              class: "btn ghost small",
              onclick: async () => {
                app.profile = cleanProfile({ ...app.profile, intro_dismissed: true });
                await app.store.saveProfile(app.profile);
                renderMap();
              },
            },
            "Not now",
          ),
        ),
      ),
    );
  }
  const held = app.bundle.held;
  if (held && (held.challenges || held.chapters)) {
    kids.push(
      h(
        "div",
        { class: "card hint" },
        `🔒 Held back for a mock: ${held.challenges} challenge${held.challenges === 1 ? "" : "s"}` +
          (held.chapters ? ` and ${held.chapters} chapter${held.chapters === 1 ? "" : "s"}` : "") +
          ". They join when you lift the hold-back (👤 You).",
      ),
    );
  }
  if (up) {
    kids.push(
      h(
        "div",
        { class: "card next-up" },
        h(
          "div",
          {},
          h("div", { class: "muted" }, "▶️ One next action"),
          h("h2", {}, `${up.emoji} ${label(up)}: ${up.title}`),
          h("div", { class: "muted" }, up.blurb),
        ),
        h(
          "button",
          { class: "btn", onclick: () => startChapter(up.slug) },
          p.chapters[up.slug].played ? "Replay" : "Play",
        ),
      ),
    );
  }
  const all = [...app.bundle.chapters].sort((a, b) => a.chapter - b.chapter);
  const byNumber = Object.fromEntries(all.map((ch) => [ch.chapter, ch]));
  const card = (ch) => {
    const c = p.chapters[ch.slug];
    const stars = "★".repeat(c.stars) + "☆".repeat(3 - c.stars);
    const buildsOn = (ch.builds_on || []).filter((n) => byNumber[n]);
    return h(
      "div",
      { class: `card chapter${c.unlocked ? "" : " locked"}` },
      h(
        "div",
        { class: "row spread" },
        h("span", { class: "emoji" }, c.unlocked ? ch.emoji : "🔒"),
        h("span", { class: "stars", title: "Stars: beat the boss, then replay on later days at 80% or better" }, stars),
      ),
      isQuest(ch)
        ? h(
            "div",
            { class: "muted" },
            `${label(ch)} · `,
            c.ready && !c.bossBeaten ? h("span", { class: "pill ready" }, "✅ Ready") : null,
            buildsOn.length
              ? h(
                  "span",
                  { class: "pill", title: buildsOn.map((n) => `${n}. ${byNumber[n].title}`).join("\n") },
                  `Builds on ${buildsOn.join(", ")}`,
                )
              : null,
          )
        : h("div", { class: "muted" }, `${label(ch)} · `, h("span", { class: "pill" }, ch.pillar)),
      h("h3", {}, ch.title),
      h("div", { class: "muted" }, ch.blurb),
      h(
        "div",
        { class: "row spread" },
        h("span", { class: "muted" }, c.rank ? `🎖️ ${c.rank}` : "Not played yet"),
        h("span", { class: "muted" }, c.accuracy != null ? `${Math.round(c.accuracy * 100)}% first try` : ""),
      ),
      h("div", { class: "bar" }, h("i", { style: `width:${(100 * c.answered) / Math.max(1, c.total)}%` })),
      c.unlocked
        ? h(
            "div",
            { class: "row" },
            h("button", { class: "btn small", onclick: () => startChapter(ch.slug) }, c.played ? "Replay" : "Play"),
            !c.bossBeaten && ch.challenges.length > 1
              ? h(
                  "button",
                  {
                    class: "btn ghost small",
                    title: "Know this already? Beat the boss cold and the next chapter opens.",
                    onclick: () => startBoss(ch.slug),
                  },
                  "👹 Try the boss now",
                )
              : null,
          )
        : h(
            "div",
            { class: "row spread" },
            h("span", { class: "muted" }, "Opens when you beat another boss"),
            h(
              "button",
              {
                class: "btn ghost small",
                title: "Skip the order and play this chapter now. It stays open.",
                onclick: () => jumpTo(ch.slug),
              },
              "Jump in anyway",
            ),
          ),
    );
  };
  const training = all.filter((ch) => !isQuest(ch));
  const quests = all.filter(isQuest);
  const beatenOf = (list) => list.filter((ch) => p.chapters[ch.slug].bossBeaten).length;
  kids.push(
    h(
      "h2",
      { class: "section" },
      "📚 Training ",
      h(
        "span",
        { class: "muted small" },
        `${beatenOf(training)} of ${training.length} bosses beaten · chapters open in order, or jump in`,
      ),
    ),
    h("div", { class: "chapters" }, training.map(card)),
  );
  if (quests.length) {
    kids.push(
      h(
        "h2",
        { class: "section" },
        "🗺️ Quests ",
        h(
          "span",
          { class: "muted small" },
          `${beatenOf(quests)} of ${quests.length} beaten · design one product end to end; all open`,
        ),
      ),
      h("div", { class: "chapters" }, quests.map(card)),
    );
  }
  show(...kids);
}

// ---------- you: the optional profile ----------

function renderProfile() {
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

// ---------- a run through a chapter ----------

function startChapter(slug, list = null) {
  const ch = chapterBySlug(slug);
  const order = list || runOrder(ch);
  app.run = {
    chapter: ch,
    queue: order.filter((c) => c.id !== ch.boss).map((c) => ({ c, second: false })),
    boss: list ? null : order.find((c) => c.id === ch.boss),
    phase: "main",
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
  app.combo = 0;
  post(baseEvent("session_start", { chapter: ch.chapter, slug }));
  showChallenge();
}

// Jump to any chapter out of order, by choice. Recording the unlock keeps it open from then on.
function jumpTo(slug) {
  post(baseEvent("unlock", { slug, chosen: true }));
  startChapter(slug);
}

// Skip ahead: the boss alone, cold. Beat it and it counts exactly as at the end of a run.
function startBoss(slug) {
  const ch = chapterBySlug(slug);
  const boss = ch.challenges.find((c) => c.id === ch.boss);
  app.run = {
    chapter: ch,
    queue: [{ c: boss, second: false }],
    boss: null,
    phase: "boss",
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
  app.combo = 0;
  post(baseEvent("session_start", { chapter: ch.chapter, slug, boss_only: true }));
  showChallenge();
}

function startSingle(ch, chapter) {
  app.run = {
    chapter,
    queue: [{ c: ch, second: false }],
    boss: null,
    phase: "single",
    i: 0,
    misses: [],
    points: 0,
    answered: 0,
    right: 0,
    bestCombo: 0,
    results: [],
    bossResult: null,
  };
  showChallenge();
}

function current() {
  return app.run.queue[app.run.i];
}

function advance() {
  const run = app.run;
  run.i++;
  if (run.i < run.queue.length) return showChallenge();
  if (run.phase === "main" && run.misses.length) {
    run.phase = "second";
    run.queue = run.misses.map((c) => ({ c, second: true }));
    run.misses = [];
    run.i = 0;
    toast("🔁 Second chance: the ones you missed, for half points");
    return showChallenge();
  }
  if ((run.phase === "main" || run.phase === "second") && run.boss) {
    run.phase = "boss";
    run.queue = [{ c: run.boss, second: false }];
    run.i = 0;
    toast("👹 Boss time");
    return showChallenge();
  }
  showResults();
}

function runDots() {
  const run = app.run;
  return h(
    "div",
    { class: "dots", title: "This run" },
    run.queue.map((q, i) => {
      const r = run.results.find((x) => x.id === q.c.id && x.second === q.second);
      const cls = r ? (r.correct ? "right" : r.fraction >= 0.5 ? "part" : "wrong") : i === run.i ? "now" : "";
      return h("i", { class: cls });
    }),
  );
}

function showChallenge() {
  const run = app.run;
  const { c, second } = current();
  const isBoss = run.phase === "boss";
  renderStats();
  const state = { confidence: null, submitted: false };
  const card = h("div", { class: "card challenge" });
  const kind = h(
    "div",
    { class: "kind" },
    h("span", { class: "pill" }, TYPE_LABEL[c.type]),
    h("span", { class: "pill", title: "Revised Bloom's level" }, c.bloom),
    isBoss ? h("span", { class: "pill boss-tag" }, "👹 Boss") : null,
    second ? h("span", { class: "pill" }, "🔁 Second chance") : null,
    run.phase === "single" ? h("span", { class: "pill" }, "🎯 Coach's challenge") : null,
  );
  const body = h("div");
  const feedbackSlot = h("div");
  card.append(kind, h("div", { class: "prompt" }, c.prompt));

  if (!SELF_GRADED.has(c.type)) {
    const conf = h("div", { class: "conf" }, h("span", { class: "muted" }, "How sure are you?"));
    for (const [k, label] of [
      ["guess", "😬 Guess"],
      ["fairly", "🙂 Fairly"],
      ["sure", "😎 Sure (×1.5 if right)"],
    ]) {
      const b = h(
        "button",
        {
          onclick: () => {
            state.confidence = k;
            conf.querySelectorAll("button").forEach((x) => x.classList.toggle("sel", x === b));
          },
        },
        label,
      );
      conf.append(b);
    }
    card.append(conf);
  }
  card.append(body, feedbackSlot);

  const finish = async (res, reveal) => {
    if (state.submitted) return;
    state.submitted = true;
    card.querySelectorAll("button, input, textarea").forEach((el) => {
      if (!feedbackSlot.contains(el)) el.disabled = true;
    });
    const { fraction } = check(c, res);
    const before = prog();
    const s = score(c, fraction, { confidence: state.confidence, combo: app.combo, secondChance: second, isBoss });
    app.combo = s.combo;
    const ev = baseEvent("answer", {
      chapter: run.chapter ? run.chapter.chapter : null,
      challenge: c.id,
      type: c.type,
      bloom: c.bloom,
      boss: isBoss,
      second_chance: second,
      confidence: state.confidence,
      fraction: Math.round(fraction * 1000) / 1000,
      correct: s.correct,
      points: s.points,
      combo: s.combo,
      response: summarise(c, res),
    });
    if (c.type === "write" && app.coach) Object.assign(ev, { coach: true, prompt: c.prompt });
    await post(ev);
    run.answered++;
    run.points += s.points;
    if (s.correct) run.right++;
    run.bestCombo = Math.max(run.bestCombo, s.combo);
    run.results.push({ id: c.id, second, correct: s.correct, fraction, points: s.points, boss: isBoss });
    if (!s.correct && !second && !isBoss && run.phase === "main") run.misses.push(c);
    if (isBoss) run.bossResult = fraction;
    if (reveal) reveal(fraction);
    feedbackSlot.replaceChildren(feedback(c, res, fraction, s, isBoss));
    celebrate(before, prog(), isBoss && fraction >= 0.8);
    renderStats();
  };

  RENDER[c.type](c, body, finish, state);
  if (c.seconds && c.type !== "lightning" && c.type !== "sprint") {
    let left = c.seconds;
    const t = h("span", { class: "timer" }, `⏱️ ${left}s`);
    kind.append(t);
    app.timers.push(
      setInterval(() => {
        if (state.submitted) return;
        left--;
        t.textContent = `⏱️ ${left}s`;
        t.classList.toggle("low", left <= 10);
        if (left <= 0) body.dispatchEvent(new Event("timeup"));
      }, 1000),
    );
  }
  show(
    h(
      "div",
      { class: "runbar" },
      h(
        "div",
        {},
        h("b", {}, run.chapter ? `${run.chapter.emoji} ${run.chapter.title}` : "Coach's challenge"),
        " ",
        runDots(),
      ),
      h(
        "button",
        {
          class: "btn ghost small",
          onclick: () => {
            if (confirm("Leave this run? Your answers so far are kept.")) renderMap();
          },
        },
        "Map",
      ),
    ),
    card,
  );
}

function summarise(c, res) {
  const out = { ...res };
  if (out.text) out.text = String(out.text).slice(0, 4000);
  if (c.type === "estimate") out.expected = generate(c.generator, res.seed).answer;
  return out;
}

function feedback(c, res, fraction, s, isBoss) {
  const verdict = s.correct
    ? isBoss
      ? "👹 Boss beaten!"
      : "✅ Right"
    : fraction >= 0.5
      ? isBoss && fraction >= 0.8
        ? "👹 Boss beaten!"
        : "🟡 Partly"
      : "❌ Not this time";
  const cls = s.correct || (isBoss && fraction >= 0.8) ? "right" : fraction >= 0.5 ? "part" : "wrong";
  const box = h(
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
    REVEAL_TEXT[c.type] ? REVEAL_TEXT[c.type](c, res) : null,
    h("div", { style: "margin-top:8px" }, richText(c.explain)),
    c.source && !c.source.startsWith("vault:")
      ? h("div", { class: "source" }, "📖 ", h("a", { href: c.source, target: "_blank", rel: "noopener" }, "Source"))
      : null,
    c.source && c.source.startsWith("vault:")
      ? h("div", { class: "source muted" }, `📖 In your notes: ${c.source.slice(6)}`)
      : null,
  );
  const actions = h("div", { class: "row", style: "margin-top:12px" });
  const nextBtn = h("button", { class: "btn", onclick: () => advance() }, "Next ▶");
  actions.append(nextBtn);
  if (app.coach)
    actions.append(h("button", { class: "btn ghost", onclick: () => askCoach(c, res, actions) }, "💬 Ask coach"));
  actions.append(h("button", { class: "btn ghost", onclick: () => flag(c, actions) }, "🚩 Flag"));
  box.append(actions);
  setTimeout(() => nextBtn.focus(), 50);
  return box;
}

function askCoach(c, res, where) {
  const ta = h("textarea", { placeholder: "What do you want to ask? (optional)", style: "min-height:60px" });
  const send = h(
    "button",
    {
      class: "btn small",
      onclick: async () => {
        await post(
          baseEvent("coach_request", {
            coach: true,
            challenge: c.id,
            prompt: c.prompt,
            response: summarise(c, res),
            question: ta.value.slice(0, 1000),
          }),
        );
        wrap.replaceChildren(h("div", { class: "muted" }, "💬 Sent. The coach answers in the panel."));
      },
    },
    "Send to coach",
  );
  const wrap = h("div", { style: "width:100%" }, ta, send);
  where.after(wrap);
  ta.focus();
}

function flag(c, where) {
  const ta = h("input", { type: "text", placeholder: "What's wrong with it?" });
  const send = h(
    "button",
    {
      class: "btn small",
      onclick: async () => {
        await post(baseEvent("flag", { coach: app.coach, challenge: c.id, note: ta.value.slice(0, 500) }));
        wrap.replaceChildren(h("div", { class: "muted" }, "🚩 Flagged. It'll be reviewed."));
      },
    },
    "Flag it",
  );
  const wrap = h("div", { class: "row", style: "width:100%" }, ta, send);
  where.after(wrap);
  ta.focus();
}

function celebrate(before, after, bossBeaten) {
  if (bossBeaten) confetti();
  for (const [slug, c] of Object.entries(after.chapters)) {
    const b = before.chapters[slug];
    if (c.rank && c.rank !== b.rank) toast(`🎖️ Rank up: ${c.rank}`);
    if (c.unlocked && !b.unlocked) toast(`🔓 Unlocked: ${chapterBySlug(slug).title}`);
  }
  for (const badge of after.badges)
    if (!before.badges.some((x) => x.id === badge.id)) toast(`${BADGE_EMOJI[badge.id] || "🏅"} Badge: ${badge.label}`);
}

function showResults() {
  const run = app.run;
  const p = prog();
  const ch = run.chapter;
  const c = ch ? p.chapters[ch.slug] : null;
  post(
    baseEvent("session_end", {
      coach: app.coach,
      chapter: ch ? ch.chapter : null,
      points: run.points,
      answered: run.answered,
      right: run.right,
      boss: run.bossResult,
    }),
  );
  const firstTry = run.results.filter((r) => !r.second);
  // The boss isn't a "miss" to replay on its own: a failed boss means replaying the chapter.
  const missed = firstTry
    .filter((r) => !r.correct && !r.boss)
    .map((r) => ch.challenges.find((x) => x.id === r.id))
    .filter(Boolean);
  const bossFailed = run.bossResult != null && run.bossResult < 0.8;
  const up = nextUp(p);
  app.run = null;
  const next = bossFailed
    ? `Play ${ch.title} and take the boss again at the end.`
    : missed.length
      ? `Replay the ${missed.length} you missed while they're fresh${up && up.slug !== ch?.slug ? `, then try ${up.title}` : ""}.`
      : up && up.slug !== ch?.slug
        ? `Next: ${up.title}.`
        : "Come back on another day and replay it: a later day at 80% earns the next star.";
  show(
    h(
      "div",
      { class: "card" },
      h("div", { class: "muted" }, ch ? `${ch.emoji} ${ch.title}` : "Coach's challenge"),
      h("div", { class: "big" }, `+${run.points} XP`),
      h(
        "div",
        { class: "row" },
        h("span", { class: "stat" }, `✅ ${run.right} of ${run.answered} right`),
        h("span", { class: "stat" }, `🔥 best run of ${run.bestCombo}`),
        run.bossResult != null
          ? h(
              "span",
              { class: "stat" },
              run.bossResult >= 0.8 ? "👹 Boss beaten" : `👹 Boss: ${Math.round(run.bossResult * 100)}%, needs 80%`,
            )
          : null,
        c ? h("span", { class: "stat" }, `${"★".repeat(c.stars)}${"☆".repeat(3 - c.stars)} ${c.rank || ""}`) : null,
      ),
      h("h3", { style: "margin-top:16px" }, "▶️ One next action"),
      h("p", {}, next),
      missed.length
        ? h(
            "div",
            {},
            h("div", { class: "muted" }, "Missed first time:"),
            h(
              "ul",
              {},
              missed.map((m) => h("li", {}, m.prompt)),
            ),
          )
        : null,
      h(
        "div",
        { class: "row", style: "margin-top:12px" },
        bossFailed ? h("button", { class: "btn", onclick: () => startChapter(ch.slug) }, `Play ${ch.title}`) : null,
        missed.length
          ? h(
              "button",
              { class: bossFailed ? "btn ghost" : "btn", onclick: () => startChapter(ch.slug, missed) },
              "Replay the misses",
            )
          : null,
        up && (!ch || up.slug !== ch.slug)
          ? h(
              "button",
              { class: missed.length ? "btn ghost" : "btn", onclick: () => startChapter(up.slug) },
              `Play ${up.title}`,
            )
          : null,
        h("button", { class: "btn ghost", onclick: renderMap }, "Map"),
      ),
    ),
  );
  renderStats();
}

// ---------- challenge types ----------

const submitBtn = (label = "Check") => h("button", { class: "btn", disabled: true }, label);

function optionList(items, { multi = false, onChange }) {
  const box = h("div", { class: "options" });
  const sel = new Set();
  const buttons = items.map(({ text, value }) => {
    const b = h(
      "button",
      {
        class: "opt",
        onclick: () => {
          if (multi) {
            sel.has(value) ? sel.delete(value) : sel.add(value);
          } else {
            sel.clear();
            sel.add(value);
          }
          buttons.forEach((x) => x.classList.toggle("sel", sel.has(x._value)));
          onChange([...sel]);
        },
      },
      text,
    );
    b._value = value;
    return b;
  });
  box.append(...buttons);
  box._buttons = buttons;
  return box;
}
function mark(box, rightValues, chosenValues) {
  for (const b of box._buttons) {
    b.disabled = true;
    const isRight = rightValues.includes(b._value),
      chosen = chosenValues.includes(b._value);
    b.classList.remove("sel");
    if (isRight && chosen) b.classList.add("right");
    else if (chosen) b.classList.add("wrong");
    else if (isRight) b.classList.add("missed");
  }
}

const RENDER = {
  recall(c, body, finish) {
    const ta = h("textarea", { placeholder: "Say it out loud, or type it here. Then reveal." });
    const reveal = h("button", { class: "btn" }, "Show the answer");
    const grade = h("div");
    reveal.onclick = () => {
      reveal.remove();
      ta.disabled = true;
      grade.append(
        h("div", { class: "answerbox" }, h("b", {}, "Answer: "), c.answer),
        h("div", { class: "muted" }, "How did you do?"),
        h(
          "div",
          { class: "row" },
          [
            ["again", "❌ Missed it"],
            ["hard", "🟡 Partly"],
            ["good", "✅ Got it"],
            ["easy", "⚡ Easy"],
          ].map(([g, label]) =>
            h(
              "button",
              {
                class: "btn ghost",
                onclick: (e) => {
                  grade.querySelectorAll("button").forEach((b) => (b.disabled = true));
                  e.target.classList.add("sel");
                  finish({ grade: g, text: ta.value });
                },
              },
              label,
            ),
          ),
        ),
      );
    };
    body.append(ta, h("p"), reveal, grade);
  },

  multi(c, body, finish) {
    const items = shuffle(c.options.map((text, value) => ({ text, value })));
    const btn = submitBtn();
    let picked = [];
    const list = optionList(items, {
      multi: true,
      onChange: (v) => {
        picked = v;
        btn.disabled = picked.length !== c.correct.length;
      },
    });
    const why = h("input", { type: "text", placeholder: "Why, in one line? (optional, but it helps it stick)" });
    btn.onclick = () => finish({ picked, why: why.value }, () => mark(list, c.correct, picked));
    body.append(h("div", { class: "muted" }, `Pick ${c.correct.length}.`), list, h("p"), why, h("p"), btn);
  },

  duel(c, body, finish) {
    const pick = {};
    const btn = submitBtn();
    const groups = [
      ["choice", "Your call", c.choices, c.correct],
      ["reason", "Because", c.reasons, c.reason],
      ["cost", "And the cost", c.costs, c.cost],
    ];
    const lists = groups.map(([key, label, opts]) => {
      const list = optionList(shuffle(opts.map((text, value) => ({ text, value }))), {
        onChange: ([v]) => {
          pick[key] = v;
          btn.disabled = Object.keys(pick).length < 3;
        },
      });
      body.append(h("div", { class: "group" }, h("div", { class: "label" }, label), list));
      return list;
    });
    btn.onclick = () =>
      finish({ ...pick }, () => groups.forEach(([key, , , right], i) => mark(lists[i], [right], [pick[key]])));
    body.append(btn);
  },

  write(c, body, finish) {
    const ta = h("textarea", { placeholder: "Write your answer. Bullet points are fine." });
    const btn = h("button", { class: "btn" }, "Done: show the key points");
    const after = h("div");
    btn.onclick = () => {
      if (ta.value.trim().length < 10) {
        ta.focus();
        return;
      }
      ta.disabled = true;
      btn.remove();
      const ticks = c.key_points.map((kp, i) =>
        h("label", { class: "opt", style: "display:flex;gap:10px" }, h("input", { type: "checkbox", value: i }), kp),
      );
      after.append(
        h(
          "div",
          { class: "group" },
          h("div", { class: "label" }, "Tick the ones you covered"),
          h("div", { class: "options" }, ticks),
        ),
        c.model ? h("div", { class: "answerbox" }, h("b", {}, "One good answer: "), c.model) : null,
        h(
          "button",
          {
            class: "btn",
            onclick: (e) => {
              e.target.disabled = true;
              ticks.forEach((t) => (t.querySelector("input").disabled = true));
              const ticked = ticks
                .map((t, i) => (t.querySelector("input").checked ? i : null))
                .filter((x) => x != null);
              finish({ ticked, text: ta.value });
            },
          },
          "Score it",
        ),
      );
    };
    body.append(ta, h("p"), btn, after);
  },

  estimate(c, body, finish) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const g = generate(c.generator, seed);
    const inp = h("input", { type: "number", min: "0", step: "any", placeholder: `Your estimate, in ${g.unit}` });
    const btn = submitBtn();
    inp.oninput = () => (btn.disabled = !(Number(inp.value) > 0));
    inp.onkeydown = (e) => {
      if (e.key === "Enter" && !btn.disabled) btn.click();
    };
    btn.onclick = () => {
      inp.disabled = true;
      finish({ seed, value: Number(inp.value) });
    };
    body.append(
      h("div", { class: "answerbox" }, g.question),
      h("div", { class: "row" }, inp, h("span", { class: "muted" }, g.unit)),
      h("p"),
      btn,
    );
  },

  fill(c, body, finish) {
    const placed = {};
    let chosen = null;
    const btn = submitBtn();
    const slots = Object.keys(c.slots);
    const chips = shuffle(c.palette).map((label) => {
      const chip = h(
        "button",
        {
          class: "chip",
          draggable: "true",
          onclick: () => {
            chosen = chosen === label ? null : label;
            chips.forEach((x) => x.classList.toggle("sel", x._label === chosen));
          },
        },
        label,
      );
      chip._label = label;
      chip.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", label));
      return chip;
    });
    const refresh = () => {
      d.update(placed);
      const used = new Set(Object.values(placed));
      chips.forEach((x) => x.classList.toggle("used", used.has(x._label)));
      btn.disabled = slots.some((s) => !placed[s]);
    };
    const d = diagram(c.diagram, {
      slots,
      clickable: slots,
      onNode: (id) => {
        if (chosen) {
          placed[id] = chosen;
          chosen = null;
          chips.forEach((x) => x.classList.remove("sel"));
        } else delete placed[id];
        refresh();
      },
      onDrop: (id, label) => {
        placed[id] = label;
        refresh();
      },
    });
    btn.onclick = () =>
      finish({ placed: { ...placed } }, () =>
        d.result((id) => ({
          ok: placed[id] === c.slots[id],
          text: placed[id] === c.slots[id] ? placed[id] : `✗ ${placed[id]} → ${c.slots[id]}`,
        })),
      );
    body.append(
      h(
        "div",
        { class: "muted" },
        "Pick a part, then click the empty box it belongs in (or drag it). Click a filled box to clear it.",
      ),
      d.el,
      h("div", { class: "chips" }, chips),
      btn,
    );
  },

  sticker(c, body, finish) {
    const placed = {};
    let chosen = null;
    const btn = submitBtn();
    const ids = c.diagram.nodes.map((n) => n.id);
    const chips = c.stickers.map((label) => {
      const chip = h(
        "button",
        {
          class: "chip",
          onclick: () => {
            chosen = chosen === label ? null : label;
            chips.forEach((x) => x.classList.toggle("sel", x._label === chosen));
          },
        },
        `🏷️ ${label}`,
      );
      chip._label = label;
      return chip;
    });
    const d = diagram(c.diagram, {
      clickable: ids,
      onNode: (id) => {
        if (!chosen) return toast("Pick a sticker first");
        const list = (placed[id] ||= []);
        const at = list.indexOf(chosen);
        at >= 0 ? list.splice(at, 1) : list.push(chosen);
        d.tags(placed);
        btn.disabled = !Object.values(placed).some((l) => l.length);
      },
    });
    btn.onclick = () =>
      finish({ placed: JSON.parse(JSON.stringify(placed)) }, () => {
        const result = {};
        for (const id of ids) {
          const want = c.answers[id] || [],
            got = placed[id] || [];
          result[id] = [
            ...got.map((s) => ({ s, cls: want.includes(s) ? "ok" : "no" })),
            ...want.filter((s) => !got.includes(s)).map((s) => ({ s, cls: "miss" })),
          ];
        }
        d.tagResult(result);
      });
    body.append(
      h(
        "div",
        { class: "muted" },
        "Pick a sticker, then click every box that needs it. Click again to take it off. Orange tags after checking are the ones you missed.",
      ),
      d.el,
      h("div", { class: "chips" }, chips),
      btn,
    );
  },

  flaw(c, body, finish) {
    let node = null,
      fix = null;
    const btn = submitBtn();
    const ready = () => (btn.disabled = node == null || fix == null);
    const d = diagram(c.diagram, {
      clickable: c.diagram.nodes.map((n) => n.id),
      onNode: (id) => {
        node = id;
        d.pick(id);
        ready();
      },
    });
    const list = optionList(shuffle(c.fixes.map((text, value) => ({ text, value }))), {
      onChange: ([v]) => {
        fix = v;
        ready();
      },
    });
    btn.onclick = () =>
      finish({ node, fix }, () => {
        d.result((id) => (id === c.flaw ? { ok: true } : id === node ? { ok: false } : null));
        mark(list, [c.fix], [fix]);
      });
    body.append(
      h("div", { class: "muted" }, "Click the weak box, then pick the fix."),
      d.el,
      h("div", { class: "group" }, h("div", { class: "label" }, "The fix"), list),
      btn,
    );
  },

  order(c, body, finish, state) {
    let items = shuffle(c.items);
    while (items.length > 2 && items.every((x, i) => x === c.items[i])) items = shuffle(c.items);
    const ol = h("ol", { class: "orderlist" });
    const btn = h("button", { class: "btn" }, "Check");
    let dragFrom = null;
    const draw = () =>
      ol.replaceChildren(
        ...items.map((text, i) => {
          const li = h(
            "li",
            { draggable: "true" },
            h("span", { class: "muted" }, `${i + 1}.`),
            h("span", { class: "txt" }, text),
            h(
              "button",
              {
                "aria-label": "Move up",
                onclick: () => {
                  if (i > 0) {
                    [items[i - 1], items[i]] = [items[i], items[i - 1]];
                    draw();
                  }
                },
              },
              "↑",
            ),
            h(
              "button",
              {
                "aria-label": "Move down",
                onclick: () => {
                  if (i < items.length - 1) {
                    [items[i + 1], items[i]] = [items[i], items[i + 1]];
                    draw();
                  }
                },
              },
              "↓",
            ),
          );
          li.addEventListener("dragstart", () => (dragFrom = i));
          li.addEventListener("dragover", (e) => e.preventDefault());
          li.addEventListener("drop", (e) => {
            e.preventDefault();
            if (dragFrom == null) return;
            const [m] = items.splice(dragFrom, 1);
            items.splice(i, 0, m);
            dragFrom = null;
            draw();
          });
          return li;
        }),
      );
    draw();
    const submit = () =>
      finish({ order: items.slice() }, () => {
        ol.querySelectorAll("li").forEach((li, i) => {
          li.classList.add(items[i] === c.items[i] ? "right" : "wrong");
          li.querySelectorAll("button").forEach((b) => b.remove());
          li.draggable = false;
          if (items[i] !== c.items[i]) li.append(h("span", { class: "muted" }, `→ ${c.items[i]}`));
        });
      });
    btn.onclick = submit;
    body.addEventListener("timeup", () => {
      if (!state.submitted) {
        toast("⏱️ Time's up");
        submit();
      }
    });
    body.append(h("div", { class: "muted" }, "Drag, or use the arrows."), ol, h("p"), btn);
  },

  lightning(c, body, finish, state) {
    const secs = c.seconds || 90;
    const reaches = [...new Set(c.pairs.map((p) => p[1]))];
    const start = h("button", { class: "btn" }, `Start: ${secs} seconds`);
    body.append(
      h("div", { class: "muted" }, `${c.pairs.length} quick ones. Tap the right answer; it moves on by itself.`),
      h("p"),
      start,
    );
    start.onclick = () => {
      const pairs = shuffle(c.pairs);
      let i = 0,
        right = 0,
        left = secs;
      const misses = [];
      const timer = h("div", { class: "timer" }, `⏱️ ${left}s`);
      const q = h("div", { class: "lightning-q" });
      const opts = h("div", { class: "options" });
      const end = () => {
        if (state.submitted) return;
        finish({ right, shown: i }, null);
        const toLearn = [...misses, ...pairs.slice(i)];
        body.append(
          toLearn.length
            ? h(
                "div",
                { class: "answerbox" },
                h("b", {}, `${right} of ${pairs.length}. To learn: `),
                h(
                  "ul",
                  {},
                  toLearn.map(([a, b]) => h("li", {}, `${a} → ${b}`)),
                ),
              )
            : h("div", { class: "answerbox" }, `Clean sweep: ${right} of ${pairs.length}.`),
        );
      };
      const ask = () => {
        if (i >= pairs.length) return end();
        const [hear, reach] = pairs[i];
        q.textContent = hear;
        const choices = shuffle([reach, ...shuffle(reaches.filter((r) => r !== reach)).slice(0, 3)]);
        opts.replaceChildren(
          ...choices.map((text) =>
            h(
              "button",
              {
                class: "opt",
                onclick: () => {
                  const ok = text === reach;
                  if (ok) right++;
                  else misses.push([hear, reach]);
                  opts.classList.add(ok ? "flash-right" : "flash-wrong");
                  setTimeout(() => opts.classList.remove("flash-right", "flash-wrong"), 350);
                  i++;
                  ask();
                },
              },
              text,
            ),
          ),
        );
      };
      body.replaceChildren(h("div", { class: "row spread" }, timer, h("span", { class: "muted" }, "Go!")), q, opts);
      app.timers.push(
        setInterval(() => {
          left--;
          timer.textContent = `⏱️ ${left}s`;
          timer.classList.toggle("low", left <= 10);
          if (left <= 0) {
            opts.replaceChildren();
            end();
            clearTimers();
          }
        }, 1000),
      );
      ask();
    };
  },

  sprint(c, body, finish) {
    let left = c.minutes * 60,
      running = false;
    const clock = h("div", { class: "bigtimer" }, fmtClock(left));
    const go = h("button", { class: "btn" }, "Start the clock");
    const done = h("button", { class: "btn ghost" }, "I'm done");
    const hint = h(
      "div",
      { class: "muted", style: "text-align:center" },
      "Talk it through out loud, as if they're listening.",
    );
    go.onclick = () => {
      running = !running;
      go.textContent = running ? "Pause" : "Resume";
      if (running && !app.timers.length)
        app.timers.push(
          setInterval(() => {
            if (!running) return;
            left = Math.max(0, left - 1);
            clock.textContent = fmtClock(left);
            if (left === Math.floor(c.minutes * 15)) toast("⏱️ A quarter left: wrap up and say it back");
            if (left === 0) {
              toast("⏱️ Time");
              running = false;
              done.click();
            }
          }, 1000),
        );
    };
    done.onclick = () => {
      running = false;
      clearTimers();
      go.remove();
      done.remove();
      const ticks = c.checks.map((txt, i) =>
        h("label", { class: "opt", style: "display:flex;gap:10px" }, h("input", { type: "checkbox", value: i }), txt),
      );
      body.append(
        h(
          "div",
          { class: "group" },
          h("div", { class: "label" }, "Tick what you did"),
          h("div", { class: "options" }, ticks),
        ),
        h(
          "button",
          {
            class: "btn",
            onclick: (e) => {
              e.target.disabled = true;
              const ticked = ticks
                .map((t, i) => (t.querySelector("input").checked ? i : null))
                .filter((x) => x != null);
              finish({ ticked, seconds_used: c.minutes * 60 - left });
            },
          },
          "Score it",
        ),
      );
    };
    body.append(clock, hint, h("div", { class: "row", style: "justify-content:center" }, go, done));
  },
};
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const REVEAL_TEXT = {
  estimate: (c, res) => {
    const g = generate(c.generator, res.seed);
    return h(
      "div",
      { class: "answerbox" },
      h("div", {}, h("b", {}, "Worked: "), g.working),
      h(
        "div",
        { class: "muted" },
        `You said ${res.value}. Anything within ×1.6 of the worked answer counts: interview maths is about the order of magnitude.`,
      ),
    );
  },
  recall: () => null,
};

// ---------- diagrams (SVG, scales with the page) ----------

function wrapLabel(text, max = 16) {
  const words = String(text).split(" ");
  const lines = [""];
  for (const w of words) {
    if ((lines.at(-1) + " " + w).trim().length > max && lines.at(-1)) lines.push(w);
    else lines[lines.length - 1] = (lines.at(-1) + " " + w).trim();
  }
  return lines.slice(0, 3);
}

function diagram(d, { slots = [], clickable = [], onNode = () => {}, onDrop = null } = {}) {
  const W = d.width || 640,
    H = d.height || 300;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H + 24}`, class: "diagram", role: "img" });
  const defs = svg("defs");
  const marker = svg("marker", {
    id: `arrow-${Math.random().toString(36).slice(2)}`,
    viewBox: "0 0 10 10",
    refX: "9",
    refY: "5",
    markerWidth: "7",
    markerHeight: "7",
    orient: "auto-start-reverse",
  });
  marker.append(svg("path", { d: "M0,0 L10,5 L0,10 z" }));
  defs.append(marker);
  root.append(defs);
  const box = {};
  for (const n of d.nodes) box[n.id] = { x: n.x, y: n.y, w: n.w || 120, h: n.h || 48, label: n.label };
  const edge = (a, b) => {
    const A = box[a],
      B = box[b];
    const ca = [A.x + A.w / 2, A.y + A.h / 2],
      cb = [B.x + B.w / 2, B.y + B.h / 2];
    const clip = (c, r, toward) => {
      const dx = toward[0] - c[0],
        dy = toward[1] - c[1];
      const t = Math.min(Math.abs(r.w / 2 / (dx || 1e-9)), Math.abs(r.h / 2 / (dy || 1e-9)));
      return [c[0] + dx * t, c[1] + dy * t];
    };
    return [clip(ca, A, cb), clip(cb, B, ca)];
  };
  for (const e of d.edges || []) {
    const [p, q] = edge(e[0], e[1]);
    root.append(
      svg("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: "edge", "marker-end": `url(#${marker.id})` }),
    );
    if (e[2]) {
      const t = svg("text", {
        x: (p[0] + q[0]) / 2,
        y: (p[1] + q[1]) / 2 - 5,
        "text-anchor": "middle",
        class: "edge-label",
      });
      t.textContent = e[2];
      root.append(t);
    }
  }
  const groups = {};
  const tagLayer = svg("g");
  for (const n of d.nodes) {
    const b = box[n.id];
    const isSlot = slots.includes(n.id);
    const g = svg("g", {
      class: `node${isSlot ? " slot" : ""}${clickable.includes(n.id) ? " clickable" : ""}`,
      tabindex: clickable.includes(n.id) ? "0" : "-1",
    });
    g.append(svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, rx: 9 }));
    const text = svg("text", { x: b.x + b.w / 2, "text-anchor": "middle" });
    g.append(text);
    groups[n.id] = { g, text };
    setText(n.id, isSlot ? "?" : n.label);
    if (clickable.includes(n.id)) {
      g.addEventListener("click", () => onNode(n.id));
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNode(n.id);
        }
      });
    }
    if (onDrop && isSlot) {
      g.addEventListener("dragover", (e) => e.preventDefault());
      g.addEventListener("drop", (e) => {
        e.preventDefault();
        onDrop(n.id, e.dataTransfer.getData("text/plain"));
      });
    }
    root.append(g);
  }
  root.append(tagLayer);
  function setText(id, label) {
    const { text } = groups[id];
    const b = box[id];
    const lines = wrapLabel(label);
    text.replaceChildren();
    const top = b.y + b.h / 2 - ((lines.length - 1) * 15) / 2 + 4;
    lines.forEach((ln, i) => {
      const ts = svg("tspan", { x: b.x + b.w / 2, y: top + i * 15 });
      ts.textContent = ln;
      text.append(ts);
    });
  }
  function drawTags(map) {
    tagLayer.replaceChildren();
    for (const [id, list] of Object.entries(map)) {
      const b = box[id];
      list.forEach((item, i) => {
        const t = svg("text", {
          x: b.x + b.w / 2,
          y: b.y + b.h + 13 + i * 12,
          "text-anchor": "middle",
          class: `tag ${item.cls || "plain"}`,
        });
        t.textContent = `${item.cls === "ok" ? "✓ " : item.cls === "no" ? "✗ " : item.cls === "miss" ? "+ " : "🏷 "}${item.s}`;
        tagLayer.append(t);
      });
    }
  }
  return {
    el: root,
    update(placed) {
      for (const id of slots) {
        setText(id, placed[id] || "?");
        groups[id].g.classList.toggle("filled", !!placed[id]);
      }
    },
    pick(id) {
      for (const [k, v] of Object.entries(groups)) v.g.classList.toggle("picked", k === id);
    },
    tags(placed) {
      drawTags(Object.fromEntries(Object.entries(placed).map(([id, l]) => [id, l.map((s) => ({ s }))])));
    },
    tagResult(result) {
      drawTags(result);
    },
    result(fn) {
      for (const id of Object.keys(groups)) {
        const r = fn(id);
        groups[id].g.classList.remove("picked", "clickable");
        if (!r) continue;
        groups[id].g.classList.add(r.ok ? "right" : "wrong");
        if (r.text) setText(id, r.text);
      }
    },
  };
}

// ---------- the coach panel (only when the local server is running) ----------

function renderCoach() {
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

async function pollCoach() {
  try {
    const r = await (await fetch(`/api/coach?after=${app.coachNext}`, { cache: "no-store" })).json();
    if (r.messages.length) {
      const box = $("msgs");
      for (const m of r.messages) {
        box.append(
          h(
            "div",
            { class: "msg" },
            h(
              "div",
              { class: "t" },
              new Date(m.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
            ),
            richText(m.text),
          ),
        );
      }
      box.scrollTop = box.scrollHeight;
      if (app.coachNext > 0) toast("💬 The coach replied");
    }
    app.coachNext = r.next;
    const assigned = await (await fetch("/api/assigned", { cache: "no-store" })).json();
    const done = new Set(app.events.filter((e) => e.kind === "answer").map((e) => e.challenge));
    const open = assigned.filter((a) => !done.has(a.challenge.id));
    if (open.length !== app.assigned.length) {
      if (open.length > app.assigned.length) toast("🎯 The coach set you a challenge");
      app.assigned = open;
      $("assigned").replaceChildren(
        ...open.map((a) =>
          h(
            "div",
            { class: "assigned" },
            h("div", {}, h("b", {}, "🎯 Coach's challenge"), a.why ? h("div", { class: "muted" }, a.why) : null),
            h("div", {}, a.challenge.prompt),
            h(
              "button",
              {
                class: "btn small",
                onclick: () =>
                  startSingle(a.challenge, a.chapter ? app.bundle.chapters.find((c) => c.chapter === a.chapter) : null),
              },
              "Play it",
            ),
          ),
        ),
      );
    }
  } catch {
    /* the server went away; try again next tick */
  }
}

// ---------- start ----------

// root: where to draw (a shadow root holding #screen, #stats, #coach, #toasts, #home, #you).
// lookForServer: false on a public website, so the game never asks for a local coach server there.
export async function boot(root, { base = BASE, lookForServer = true } = {}) {
  ROOT = root;
  BASE = base;
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
