// System Design Quest: the engine. Pure functions, no DOM, no network.
// One scoring source for the page, the command-line summary and the tests.

export const BLOOM_POINTS = { remember: 10, understand: 15, apply: 20, analyse: 30, evaluate: 40, create: 60 };
export const BOSS_POINTS = 100;

// What each level of the ladder asks of the player, for the tag's tooltip.
const BLOOM_HELP = {
  remember: "recall the fact",
  understand: "explain it in your own words",
  apply: "use it on a case you have not seen",
  analyse: "take a design apart and compare the parts",
  evaluate: "weigh the options and defend a choice",
  create: "design something new",
};
export function bloomHelp(level) {
  const ladder = `Levels go ${Object.keys(BLOOM_POINTS).join(", ")}.`;
  if (!Object.hasOwn(BLOOM_HELP, level)) return ladder;
  return `${level[0].toUpperCase()}${level.slice(1)}: ${BLOOM_HELP[level]}. ${ladder}`;
}
export const BOSS_PASS = 0.8; // a boss counts as beaten at 80%
export const PASS_MARK = 0.5; // an answer must be at least this much right to score anything
export const STAR_ACCURACY = 0.8; // a replay day earns a star at 80% first-try right
export const TOLERANCE = 1.6; // estimates count within this factor either way
export const OPEN_AT_START = 2; // chapters open before any boss is beaten

// ---------- randomness (seeded, so an estimate can be re-checked from its seed) ----------

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rand = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Round numbers people can do in their head: 1, 2 or 5 times a power of ten, inside [min, max].
function nice(rand, [min, max]) {
  const opts = [];
  for (let p = Math.floor(Math.log10(min)) - 1; p <= Math.ceil(Math.log10(max)) + 1; p++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** p;
      if (v >= min && v <= max) opts.push(v);
    }
  }
  if (!opts.length) opts.push(min);
  return opts[Math.floor(rand() * opts.length)];
}

export function fmt(n) {
  if (n >= 1e9) return `${+(n / 1e9).toPrecision(3)} billion`;
  if (n >= 1e6) return `${+(n / 1e6).toPrecision(3)} million`;
  if (n >= 1e4) return Math.round(n).toLocaleString("en-GB");
  return `${+n.toPrecision(3)}`;
}

// ---------- estimate generators ----------

// One question maker for each kind of estimate. Each draws its numbers from r, in a fixed order, so a seed always
// gives the same question.
const GENERATORS = {
  peak_rps(r, p) {
    const users = nice(r, p.users),
      actions = nice(r, p.actions);
    const perDay = users * actions,
      avg = perDay / 1e5,
      peak = avg * 10;
    return {
      question: `${fmt(users)} people each do ${fmt(actions)} actions a day. Requests a second at the peak?`,
      answer: peak,
      unit: "requests a second",
      working: `${fmt(users)} × ${fmt(actions)} = ${fmt(perDay)} a day. ÷ 100,000 = ${fmt(avg)} a second on average. × 10 for the peak = ${fmt(peak)}.`,
    };
  },
  storage_year(r, p) {
    const items = nice(r, p.items),
      kb = nice(r, p.kb);
    const gb = (items * kb * 365) / 1e6;
    const tb = gb >= 1000;
    return {
      question: `${fmt(items)} new items a day, about ${fmt(kb)} KB each. Storage after a year, in ${tb ? "TB" : "GB"}?`,
      answer: tb ? gb / 1000 : gb,
      unit: tb ? "TB" : "GB",
      working: `${fmt(items)} × ${fmt(kb)} KB = ${fmt(items * kb)} KB a day. × 365 ≈ ${fmt(items * kb * 365)} KB a year = ${fmt(gb)} GB${tb ? ` = ${fmt(gb / 1000)} TB` : ""}. (KB → MB → GB → TB is × 1,000 each step.)`,
    };
  },
  shard_or_not(r, p) {
    const users = nice(r, p.users),
      writes = nice(r, p.writes);
    const peak = ((users * writes) / 1e5) * 10;
    return {
      question: `${fmt(users)} people each make ${fmt(writes)} writes a day. Writes a second at the peak? (Then: one database, or split?)`,
      answer: peak,
      unit: "writes a second",
      working: `${fmt(users)} × ${fmt(writes)} ÷ 100,000 × 10 = ${fmt(peak)} at the peak. ${peak > 10000 ? "Past about 10,000 writes a second: consider splitting (sharding)." : "Well under about 10,000 writes a second: one database copes, no splitting."}`,
    };
  },
  bandwidth(r, p) {
    const rps = nice(r, p.rps),
      kb = nice(r, p.kb);
    const mbs = (rps * kb) / 1000;
    return {
      question: `${fmt(rps)} responses a second, about ${fmt(kb)} KB each. Outbound bandwidth in MB a second?`,
      answer: mbs,
      unit: "MB a second",
      working: `${fmt(rps)} × ${fmt(kb)} KB = ${fmt(rps * kb)} KB a second ÷ 1,000 = ${fmt(mbs)} MB a second.`,
    };
  },
};

export function generate(gen, seed) {
  const r = rng(seed);
  if (!Object.hasOwn(GENERATORS, gen.kind)) throw new Error(`unknown generator ${gen.kind}`);
  return GENERATORS[gen.kind](r, gen.params);
}

// ---------- checking an answer ----------

const SELF_GRADES = { again: 0, hard: 0.5, good: 1, easy: 1 };
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Right picks minus wrong picks, over the number of right answers: guessing everything scores nothing.
function rightMinusWrong(picks, want) {
  let right = 0,
    wrong = 0;
  for (const i of picks) want.has(i) ? right++ : wrong++;
  return { right, wrong };
}

// One checker for each challenge type: the share of the answer that was right, from 0 to 1.
const CHECKS = {
  recall: (ch, res) => SELF_GRADES[res.grade] ?? 0,
  multi(ch, res) {
    const correct = new Set(ch.correct);
    const { right, wrong } = rightMinusWrong(new Set(res.picked || []), correct);
    return clamp01((right - wrong) / correct.size);
  },
  duel: (ch, res) => ((res.choice === ch.correct) + (res.reason === ch.reason) + (res.cost === ch.cost)) / 3,
  write: (ch, res) => clamp01((res.ticked || []).length / ch.key_points.length),
  sprint: (ch, res) => clamp01((res.ticked || []).length / ch.checks.length),
  estimate(ch, res) {
    const { answer } = generate(ch.generator, res.seed);
    const v = Number(res.value);
    return v > 0 && v <= answer * TOLERANCE && v >= answer / TOLERANCE ? 1 : 0;
  },
  fill(ch, res) {
    const slots = Object.entries(ch.slots);
    const placed = res.placed || {};
    return slots.filter(([id, label]) => placed[id] === label).length / slots.length;
  },
  sticker(ch, res) {
    let right = 0,
      wrong = 0,
      total = 0;
    for (const list of Object.values(ch.answers)) total += list.length;
    for (const [id, list] of Object.entries(res.placed || {})) {
      const got = rightMinusWrong(list, new Set(ch.answers[id] || []));
      right += got.right;
      wrong += got.wrong;
    }
    return clamp01((right - wrong) / total);
  },
  flaw: (ch, res) => 0.5 * (res.node === ch.flaw) + 0.5 * (res.fix === ch.fix),
  order(ch, res) {
    const got = res.order || [];
    return ch.items.filter((item, i) => got[i] === item).length / ch.items.length;
  },
  lightning: (ch, res) => clamp01((res.right || 0) / ch.pairs.length),
};

export function check(ch, res = {}) {
  if (!Object.hasOwn(CHECKS, ch.type)) throw new Error(`unknown type ${ch.type}`);
  const fraction = CHECKS[ch.type](ch, res);
  return { fraction, correct: fraction >= 0.999 };
}

// ---------- points ----------

export function multiplier(combo) {
  return combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
}

// A miss ends the combo; a second chance keeps it where it was; any other right answer adds one.
function nextCombo(combo, correct, secondChance) {
  if (!correct) return 0;
  return secondChance ? combo : combo + 1;
}

// The factors of the sum, so a card can show its working. Below the pass mark nothing is scored, so the share is 0 and
// the base is still there to see. Sure pays only when everything is right.
function partsOf(ch, fraction, { confidence, secondChance, isBoss }, combo) {
  return {
    base: isBoss ? BOSS_POINTS : (BLOOM_POINTS[ch.bloom] ?? 10),
    share: fraction >= PASS_MARK ? fraction : 0,
    sure: fraction >= 0.999 && confidence === "sure" ? 1.5 : 1,
    streak: multiplier(combo),
    second: secondChance ? 0.5 : 1,
  };
}

const product = (p) => p.base * p.share * p.sure * p.streak * p.second;

// The points are the parts multiplied together and rounded once; exact keeps the decimal for the card to show, and max
// is what the same answer would have paid had everything been right.
export function score(ch, fraction, { confidence = null, combo = 0, secondChance = false, isBoss = false } = {}) {
  const correct = fraction >= 0.999;
  const how = { confidence, secondChance, isBoss };
  const newCombo = nextCombo(combo, correct, secondChance);
  const parts = partsOf(ch, fraction, how, newCombo);
  const exact = product(parts);
  const max = Math.round(product(partsOf(ch, 1, how, nextCombo(combo, true, secondChance))));
  return { points: Math.round(exact), exact, max, combo: newCombo, correct, multiplier: parts.streak, parts };
}

// ---------- the player's profile: every field optional ----------

export const PROFILE_TEXT = ["name", "company", "role"];
export const PROFILE_MAX = 60;
export const INTERVIEW_TYPES = ["Design from scratch", "Review a design", "API design", "Not sure yet"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOLD_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isDate = (s) => typeof s === "string" && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`));

const isObject = (x) => !!x && typeof x === "object";

// Each hold-back the player has set: a well-formed id, a lift date if it's a real date, and whether it's lifted.
function cleanHolds(holds) {
  const kept = Object.entries(holds).filter(([id, h]) => HOLD_ID_RE.test(id) && isObject(h));
  const out = Object.fromEntries(
    kept.map(([id, h]) => [id, { lifts: isDate(h.lifts) ? h.lifts : null, lifted: h.lifted === true }]),
  );
  return kept.length ? out : null;
}

// The text fields, trimmed and cut to length; an empty one is left out.
function copyText(p, out) {
  for (const k of PROFILE_TEXT) {
    if (typeof p[k] === "string" && p[k].trim()) out[k] = p[k].trim().slice(0, PROFILE_MAX);
  }
}

// Keep only the fields the game knows, trimmed and checked. Anything else is dropped.
export function cleanProfile(p) {
  const out = {};
  if (!isObject(p)) return out;
  copyText(p, out);
  if (INTERVIEW_TYPES.includes(p.interview_type)) out.interview_type = p.interview_type;
  if (isDate(p.interview_date)) out.interview_date = p.interview_date;
  if (p.intro_dismissed === true) out.intro_dismissed = true;
  const holds = isObject(p.holds) ? cleanHolds(p.holds) : null;
  if (holds) out.holds = holds;
  return out;
}

// A hold-back lifts when you lift it, on the date you set for it, or else the day after your interview.
// With none of those, it stays until you lift it. (check_content.py applies the same rule.)
export function holdActive(id, profile, today) {
  const h = (profile && profile.holds && profile.holds[id]) || {};
  if (h.lifted) return false;
  if (isDate(h.lifts)) return today < h.lifts;
  if (profile && isDate(profile.interview_date)) return today <= profile.interview_date;
  return true;
}

// ---------- progress, recomputed from the record every time ----------

const RANKS = ["Novice", "Advanced beginner", "Competent"];

function weekdaysBack(now, n) {
  const days = [];
  const d = new Date(now);
  while (days.length < n) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) days.push(localDay(d));
    d.setDate(d.getDate() - 1);
  }
  return days;
}

export function localDay(d) {
  const z = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// A boss answer counts for its chapter even if the chapter's boss has since changed (a personal layer on or off).
const beatsBoss = (e, ch) =>
  e.fraction >= BOSS_PASS && (e.challenge === ch.boss || (e.boss === true && e.chapter === ch.chapter));

// A replay day counts when enough of the chapter was answered (the latest answer to each) at 80% or better.
function goodDay(events, need) {
  const latest = {};
  for (const e of events) latest[e.challenge] = e;
  const got = Object.values(latest);
  return got.length >= need && got.filter((e) => e.correct).length / got.length >= STAR_ACCURACY;
}

// Days after the first on which the chapter was replayed well enough to earn a star.
function replayDays(first, need) {
  const byDay = {};
  for (const e of first) (byDay[e.day] ||= []).push(e);
  return Object.keys(byDay)
    .sort()
    .slice(1)
    .filter((day) => goodDay(byDay[day], need)).length;
}

function rankOf(played, stars, bossBeaten) {
  if (!played) return null;
  if (stars >= 2) return RANKS[2];
  return RANKS[bossBeaten ? 1 : 0];
}

// Everything before the boss has had a first try, and the boss is there to play (a chapter that is only its boss, or
// whose boss is not among its challenges, has nothing to get ready for).
function readyForBoss(ch, tried) {
  const rest = ch.challenges.filter((c) => c.id !== ch.boss);
  return rest.length > 0 && rest.length < ch.challenges.length && rest.every((c) => tried.has(c.id));
}

function chapterProgress(ch, answers) {
  const ids = new Set(ch.challenges.map((c) => c.id));
  const mine = answers.filter((e) => ids.has(e.challenge));
  const first = mine.filter((e) => !e.second_chance);
  const bossBeaten = answers.some((e) => beatsBoss(e, ch));
  const stars = bossBeaten ? 1 + Math.min(2, replayDays(first, Math.min(6, ids.size))) : 0;
  const tried = new Set(first.map((e) => e.challenge));
  return {
    played: mine.length > 0,
    answered: tried.size,
    total: ids.size,
    bossBeaten,
    bossReady: !bossBeaten && readyForBoss(ch, tried),
    stars,
    rank: rankOf(mine.length > 0, stars, bossBeaten),
    accuracy: first.length ? first.filter((e) => e.correct).length / first.length : null,
  };
}

// How many more bosses open a locked chapter. Any boss counts, not one in particular.
const bossesToOpen = (unlocked, inOrder, bossesBeaten) => (unlocked ? 0 : inOrder - OPEN_AT_START - bossesBeaten + 1);

// Quests (and any chapter marked open) are always playable; training chapters unlock in order, one per boss beaten.
// Unlocks never go backwards: once the record says a chapter opened, it stays open, whatever the bundle holds now.
function unlock(out, chapters, opened, bossesBeaten) {
  let inOrder = 0;
  for (const ch of chapters) {
    const open = ch.open === true || isQuest(ch);
    const unlocked = open || inOrder < OPEN_AT_START + bossesBeaten || opened.has(ch.slug);
    out.chapters[ch.slug].unlocked = unlocked;
    out.chapters[ch.slug].bossesToOpen = bossesToOpen(unlocked, inOrder, bossesBeaten);
    if (unlocked && !opened.has(ch.slug)) out.newUnlocks.push(ch.slug);
    if (!open) inOrder++;
  }
}

// A quest is "ready" once every training chapter it builds on has its boss beaten.
function markReady(out, chapters) {
  const byNumber = Object.fromEntries(chapters.map((ch) => [ch.chapter, ch]));
  for (const ch of chapters.filter(isQuest)) {
    out.chapters[ch.slug].ready = (ch.builds_on || []).every(
      (n) => !byNumber[n] || out.chapters[byNumber[n].slug].bossBeaten,
    );
  }
}

function earnedBadges(answers, chapters, bossesBeaten) {
  const sureRight = answers.filter((e) => e.confidence === "sure" && e.correct).length;
  return [
    ["first-boss", "First boss beaten", bossesBeaten >= 1],
    ["combo-5", "Five in a row", answers.some((e) => (e.combo || 0) >= 5)],
    ["sure-shot", "Ten sure and right", sureRight >= 10],
    ["comeback", "Got it on the second chance", answers.some((e) => e.second_chance && e.correct)],
    ["all-bosses", "Every boss beaten", chapters.length > 0 && bossesBeaten === chapters.length],
  ]
    .filter(([, , earned]) => earned)
    .map(([id, label]) => ({ id, label }));
}

// The countdown exists only if the player set an interview date.
function daysLeft(profile, now) {
  if (!profile || !isDate(profile.interview_date)) return null;
  const t = new Date(`${profile.interview_date}T00:00:00`);
  const today = new Date(`${localDay(now)}T00:00:00`);
  return Math.round((t - today) / 86400000);
}

// The five challenges missed most often at the first try.
function weakest(answers) {
  const misses = {};
  for (const e of answers) if (!e.second_chance && !e.correct) misses[e.challenge] = (misses[e.challenge] || 0) + 1;
  return Object.entries(misses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => ({ id, misses: n }));
}

export function progress(bundle, events, now = new Date(), profile = null) {
  const answers = events.filter((e) => e.kind === "answer");
  const opened = new Set(events.filter((e) => e.kind === "unlock").map((e) => e.slug));
  const chapters = [...bundle.chapters].sort((a, b) => a.chapter - b.chapter);
  const out = { xp: 0, chapters: {}, badges: [], weekdays: 0, daysLeft: null, weakest: [], newUnlocks: [] };
  for (const e of answers) out.xp += e.points || 0;

  let bossesBeaten = 0;
  for (const ch of chapters) {
    out.chapters[ch.slug] = chapterProgress(ch, answers);
    if (out.chapters[ch.slug].bossBeaten) bossesBeaten++;
  }
  unlock(out, chapters, opened, bossesBeaten);
  markReady(out, chapters);
  out.badges = earnedBadges(answers, chapters, bossesBeaten);

  const played = new Set(answers.map((e) => e.day));
  out.weekdays = weekdaysBack(now, 5).filter((d) => played.has(d)).length;
  out.daysLeft = daysLeft(profile, now);
  out.weakest = weakest(answers);
  return out;
}

export const isQuest = (ch) => ch.kind === "quest";

// The recommended route, for anyone who'd rather not choose: a quest once it's ready, else the next training
// chapter, else any open one not yet beaten, else the weakest. Every quest stays open to jump into regardless.
export function recommend(bundle, p) {
  const chs = [...bundle.chapters].sort((a, b) => a.chapter - b.chapter);
  const st = (c) => p.chapters[c.slug];
  return (
    chs.find((c) => isQuest(c) && st(c).ready && !st(c).bossBeaten) ||
    chs.find((c) => !isQuest(c) && st(c).unlocked && !st(c).bossBeaten) ||
    chs.find((c) => st(c).unlocked && !st(c).bossBeaten) ||
    chs.filter((c) => st(c).unlocked).sort((a, b) => (st(a).accuracy ?? 0) - (st(b).accuracy ?? 0))[0]
  );
}

// The order a chapter is played in: every challenge except the boss, then the boss.
export function runOrder(ch) {
  const rest = ch.challenges.filter((c) => c.id !== ch.boss);
  const boss = ch.challenges.find((c) => c.id === ch.boss);
  return boss ? [...rest, boss] : rest;
}
