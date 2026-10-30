// The map: every chapter and quest, and the one next action.
import { cleanProfile, isQuest } from "../engine.js";
import { app, nextUp, prog } from "../state.js";
import { h, show } from "../dom.js";
import { baseEvent, post } from "../store.js";
import { badgeEmoji, renderStats } from "../stats.js";
import { jumpTo, startBoss, startChapter } from "../play.js";
import { renderProfile } from "./profile.js";

const PROFILE_FIELDS = ["name", "company", "role", "interview_type", "interview_date"];
// An icon with room before the words that follow it.
const icon = (emoji) => h("span", { class: "icon", "aria-hidden": "true" }, emoji);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const list = (items) => new Intl.ListFormat("en-GB").format(items);

// "Chapter 3" for training, "Quest 2" for quests (numbered in their own order).
function label(ch) {
  if (!isQuest(ch)) return `Chapter ${ch.chapter}`;
  const quests = app.bundle.chapters.filter(isQuest).sort((a, b) => a.chapter - b.chapter);
  return `Quest ${quests.indexOf(ch) + 1}`;
}

function badgeList(badges) {
  if (!badges.length) return null;
  return h(
    "div",
    { class: "badges" },
    badges.map((b) => h("span", { class: "pill", title: b.label }, `${badgeEmoji(b.id)} ${b.label}`)),
  );
}

// What is left once a chapter's other challenges have been played: its boss. Empty until there is one.
function bossesLeft(p) {
  const ready = app.bundle.chapters.filter((ch) => p.chapters[ch.slug].bossReady).sort((a, b) => a.chapter - b.chapter);
  if (!ready.length) return "";
  const names =
    ready.length > 3
      ? `${ready.length} ${ready.some(isQuest) ? "chapters and quests" : "chapters"}`
      : list(ready.map(label));
  return `${names} played, ${ready.length === 1 ? "boss" : "bosses"} still to beat. `;
}

// The player's name and interview, how many bosses are beaten, and the badges.
function hero(p) {
  const totalBosses = app.bundle.chapters.length;
  const beaten = Object.values(p.chapters).filter((c) => c.bossBeaten).length;
  const me = app.profile;
  const about = [me.role, me.interview_type, me.company].filter(Boolean).join(" · ");
  return [
    h(
      "div",
      { class: "hero" },
      h(
        "div",
        {},
        h("h1", {}, me.name ? `${me.name}'s quest map` : "Your quest map"),
        about ? h("div", { class: "muted" }, icon("🎯"), about) : null,
        h(
          "div",
          { class: "muted" },
          `${beaten} of ${totalBosses} bosses beaten. ${bossesLeft(p)}Points come from right answers only; a miss costs nothing and comes back later.`,
        ),
      ),
      badgeList(p.badges),
    ),
    h(
      "div",
      { class: "bar", title: `${beaten} of ${totalBosses} bosses` },
      h("i", { style: `width:${(100 * beaten) / Math.max(1, totalBosses)}%` }),
    ),
    h("p"),
  ];
}

async function dismissIntro() {
  app.profile = cleanProfile({ ...app.profile, intro_dismissed: true });
  await app.store.saveProfile(app.profile);
  renderMap();
}

// An invitation to add a profile, until the player adds one or says not now.
function introHint() {
  const me = app.profile;
  if (PROFILE_FIELDS.some((k) => me[k]) || me.intro_dismissed) return [];
  return [
    h(
      "div",
      { class: "card hint row spread" },
      h("span", {}, "👤 Interviewing soon? Add it for a countdown. Optional: the game works the same without it."),
      h(
        "span",
        { class: "row" },
        h("button", { class: "btn small", onclick: renderProfile }, "Add it"),
        h("button", { class: "btn ghost small", onclick: dismissIntro }, "Not now"),
      ),
    ),
  ];
}

function heldHint() {
  const held = app.bundle.held;
  if (!(held?.challenges || held?.chapters)) return [];
  return [
    h(
      "div",
      { class: "card hint" },
      `🔒 Held back for a mock: ${plural(held.challenges, "challenge")}` +
        (held.chapters ? ` and ${plural(held.chapters, "chapter")}` : "") +
        ". They join when you lift the hold-back (👤 You).",
    ),
  ];
}

// Once a chapter's other challenges are played, what is left is its boss, not another run.
function nextUpButton(up, c) {
  if (c.bossReady) return h("button", { class: "btn", onclick: () => startBoss(up.slug) }, `Try the ${label(up)} boss`);
  return h("button", { class: "btn", onclick: () => startChapter(up.slug) }, c.played ? "Replay" : "Play");
}

function nextUpCard(up, p) {
  if (!up) return [];
  return [
    h(
      "div",
      { class: "card next-up" },
      h(
        "div",
        {},
        h("div", { class: "muted" }, icon("▶️"), "One next action"),
        h("h2", {}, icon(up.emoji), `${label(up)}: ${up.title}`),
        h("div", { class: "muted" }, up.blurb),
      ),
      nextUpButton(up, p.chapters[up.slug]),
    ),
  ];
}

// Under the title: the quest's number, whether it's ready and what it builds on, or the chapter's pillar.
function cardMeta(ch, c, byNumber) {
  if (!isQuest(ch)) return h("div", { class: "muted" }, `${label(ch)} · `, h("span", { class: "pill" }, ch.pillar));
  const buildsOn = (ch.builds_on || []).filter((n) => byNumber[n]);
  return h(
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
  );
}

function playButtons(ch, c) {
  return h(
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
  );
}

// Any boss opens it: "such as" names the one the player would reach for next.
function lockedRow(ch, c, nextBoss) {
  const more = c.bossesToOpen === 1 ? "one more boss" : `${c.bossesToOpen} more bosses`;
  return h(
    "div",
    { class: "row spread" },
    h("span", { class: "muted" }, `Opens when you beat ${more}${nextBoss ? `, such as the ${nextBoss} boss` : ""}`),
    h(
      "button",
      {
        class: "btn ghost small",
        title: "Skip the order and play this chapter now. It stays open.",
        onclick: () => jumpTo(ch.slug),
      },
      "Jump in anyway",
    ),
  );
}

function chapterCard(ch, c, byNumber, nextBoss) {
  const stars = "★".repeat(c.stars) + "☆".repeat(3 - c.stars);
  return h(
    "div",
    { class: `card chapter${c.unlocked ? "" : " locked"}` },
    h(
      "div",
      { class: "row spread" },
      h("span", { class: "emoji" }, c.unlocked ? ch.emoji : "🔒"),
      h("span", { class: "stars", title: "Stars: beat the boss, then replay on later days at 80% or better" }, stars),
    ),
    cardMeta(ch, c, byNumber),
    h("h3", {}, ch.title),
    h("div", { class: "muted" }, ch.blurb),
    h(
      "div",
      { class: "row spread" },
      h("span", { class: "muted" }, c.rank ? `🎖️ ${c.rank}` : "Not played yet"),
      h("span", { class: "muted" }, c.accuracy != null ? `${Math.round(c.accuracy * 100)}% first try` : ""),
    ),
    h("div", { class: "bar" }, h("i", { style: `width:${(100 * c.answered) / Math.max(1, c.total)}%` })),
    c.unlocked ? playButtons(ch, c) : lockedRow(ch, c, nextBoss),
  );
}

const sectionHead = (title, note) => h("h2", { class: "section" }, title, h("span", { class: "muted small" }, note));

// Training first, then the quests (if there are any), each as a grid of cards.
function sections(p) {
  const all = [...app.bundle.chapters].sort((a, b) => a.chapter - b.chapter);
  const byNumber = Object.fromEntries(all.map((ch) => [ch.chapter, ch]));
  const training = all.filter((ch) => !isQuest(ch));
  const open = training.find((ch) => p.chapters[ch.slug].unlocked && !p.chapters[ch.slug].bossBeaten);
  const card = (ch) => chapterCard(ch, p.chapters[ch.slug], byNumber, open && label(open));
  const quests = all.filter(isQuest);
  const beatenOf = (list) => list.filter((ch) => p.chapters[ch.slug].bossBeaten).length;
  const out = [
    sectionHead(
      [icon("📚"), "Training "],
      `${beatenOf(training)} of ${training.length} bosses beaten · chapters open in order, or jump in`,
    ),
    h("div", { class: "chapters" }, training.map(card)),
  ];
  if (quests.length) {
    out.push(
      sectionHead(
        [icon("🗺️"), "Quests "],
        `${beatenOf(quests)} of ${quests.length} beaten · design one product end to end; all open`,
      ),
      h("div", { class: "chapters" }, quests.map(card)),
    );
  }
  return out;
}

export function renderMap() {
  app.run = null;
  app.combo = 0;
  renderStats();
  const p = prog();
  // Record each newly opened chapter, so it stays open whatever changes later.
  for (const slug of p.newUnlocks) post(baseEvent("unlock", { slug }));
  show(...hero(p), ...introHint(), ...heldHint(), ...nextUpCard(nextUp(p), p), ...sections(p));
}
