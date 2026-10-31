// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  score,
  progress,
  generate,
  fmt,
  runOrder,
  cleanProfile,
  holdActive,
  recommend,
  bloomHelp,
  BLOOM_POINTS,
  BOSS_PASS,
  bossBeaten,
  BOSS_POINTS,
  PASS_MARK,
} from "../web/engine.js";

const multi = { type: "multi", bloom: "understand", options: ["a", "b", "c", "d"], correct: [0, 2] };
const duel = { type: "duel", bloom: "evaluate", correct: 1, reason: 0, cost: 2 };
const fill = { type: "fill", bloom: "apply", slots: { x: "Cache", y: "Queue" } };
const sticker = { type: "sticker", bloom: "analyse", answers: { a: ["Strong"], b: ["Eventual", "Fast"] } };
const order = { type: "order", bloom: "remember", items: ["one", "two", "three", "four"] };

test("multi: right picks minus wrong picks, over the number correct", () => {
  assert.equal(check(multi, { picked: [0, 2] }).fraction, 1);
  assert.equal(check(multi, { picked: [0] }).fraction, 0.5);
  assert.equal(check(multi, { picked: [0, 1] }).fraction, 0);
  assert.equal(check(multi, { picked: [0, 1, 3] }).fraction, 0);
});

test("multi: ticking everything pays half at 4 right of 6, a quarter at 4 of 7, and nothing once wrong ticks outnumber right", () => {
  const everything = (options, right) =>
    check({ type: "multi", correct: [...Array(right).keys()] }, { picked: [...Array(options).keys()] }).fraction;
  assert.equal(everything(6, 4), 0.5); // the gate refuses this shape
  assert.equal(everything(7, 4), 0.25);
  assert.equal(everything(8, 1), 0); // seven wrong ticks cancel the one right: clamped at nothing, not below
});

test("duel: a third each for choice, reason and cost", () => {
  assert.equal(check(duel, { choice: 1, reason: 0, cost: 2 }).correct, true);
  assert.ok(Math.abs(check(duel, { choice: 1, reason: 1, cost: 2 }).fraction - 2 / 3) < 1e-9);
});

test("fill, sticker, order and flaw score part by part", () => {
  assert.equal(check(fill, { placed: { x: "Cache", y: "CDN" } }).fraction, 0.5);
  assert.equal(check(sticker, { placed: { a: ["Strong"], b: ["Eventual", "Fast"] } }).fraction, 1);
  assert.ok(Math.abs(check(sticker, { placed: { a: ["Strong", "Fast"], b: ["Eventual"] } }).fraction - 1 / 3) < 1e-9);
  assert.equal(check(order, { order: ["one", "two", "four", "three"] }).fraction, 0.5);
  assert.equal(check({ type: "flaw", flaw: "db", fix: 2 }, { node: "db", fix: 0 }).fraction, 0.5);
});

test("self-graded types use his own grade", () => {
  assert.equal(check({ type: "recall" }, { grade: "hard" }).fraction, 0.5);
  assert.equal(check({ type: "write", key_points: ["a", "b", "c", "d"] }, { ticked: [0, 1, 2] }).fraction, 0.75);
});

test("estimates: same seed, same question; within a factor of 1.6 counts", () => {
  const ch = {
    type: "estimate",
    bloom: "apply",
    generator: { kind: "peak_rps", params: { users: [1e6, 1e8], actions: [1, 20] } },
  };
  const g = generate(ch.generator, 42);
  assert.deepEqual(g, generate(ch.generator, 42));
  assert.equal(check(ch, { seed: 42, value: g.answer * 1.5 }).correct, true);
  assert.equal(check(ch, { seed: 42, value: g.answer * 2 }).correct, false);
  for (const kind of ["storage_year", "shard_or_not", "bandwidth"]) {
    const params = {
      storage_year: { items: [1e5, 1e7], kb: [1, 500] },
      shard_or_not: { users: [1e5, 1e8], writes: [1, 50] },
      bandwidth: { rps: [100, 1e5], kb: [1, 500] },
    }[kind];
    const x = generate({ kind, params }, 7);
    assert.ok(x.answer > 0 && x.question && x.working);
  }
});

test("points: harder is worth more, sure-and-right ×1.5, combos ×2 and ×3, misses cost nothing", () => {
  const ch = { bloom: "evaluate" };
  assert.equal(score(ch, 1, {}).points, 40);
  assert.equal(score(ch, 1, { confidence: "sure" }).points, 60);
  assert.equal(score(ch, 1, { combo: 2 }).points, 80);
  assert.equal(score(ch, 1, { combo: 4 }).points, 120);
  const miss = score(ch, 0, { combo: 4 });
  assert.equal(miss.points, 0);
  assert.equal(miss.combo, 0);
  assert.equal(score(ch, 0.4, {}).points, 0);
  assert.equal(score(ch, 1, { secondChance: true, combo: 1 }).combo, 1);
  assert.equal(score(ch, 1, { isBoss: true }).points, 100);
});

// The points are the factors of the sum multiplied together and rounded once, so a card can show its working.
test("parts: base, share, Sure, streak and second chance multiply back to the points, for every combination", () => {
  const grid = (...lists) => lists.reduce((rows, list) => rows.flatMap((row) => list.map((x) => [...row, x])), [[]]);
  const blooms = [...Object.keys(BLOOM_POINTS), undefined];
  const axes = [blooms, [false, true], [0, 0.3, 0.4999, 0.5, 2 / 3, 0.75, 0.998, 1], [null, "guess", "fairly", "sure"]];
  for (const [bloom, isBoss, fraction, confidence, combo, secondChance] of grid(
    ...axes,
    [0, 1, 2, 3, 4, 5, 8],
    [false, true],
  )) {
    const s = score({ bloom }, fraction, { confidence, combo, secondChance, isBoss });
    const exact = Object.values(s.parts).reduce((product, x) => product * x);
    assert.equal(s.exact, exact);
    assert.equal(s.points, Math.round(exact));
  }
});

test("parts: each factor on its own", () => {
  const ch = { bloom: "analyse" };
  assert.deepEqual(score(ch, 1).parts, { base: 30, share: 1, sure: 1, streak: 1, second: 1 });
  for (const [bloom, points] of Object.entries(BLOOM_POINTS)) assert.equal(score({ bloom }, 1).parts.base, points);
  const sure = { confidence: "sure" };
  const cases = [
    [{ bloom: "nonsense" }, 1, {}, "base", 10], // a tag the ladder lacks is worth the least
    [ch, 1, { isBoss: true }, "base", BOSS_POINTS], // a boss is worth 100, whatever its tag
    [ch, PASS_MARK, {}, "share", 0.5], // the share counts from the pass mark up, and is 0 below it
    [ch, 0.4999, {}, "share", 0],
    [ch, 0.4999, {}, "base", 30], // the base is still shown when nothing is scored
    [ch, 0.999, sure, "sure", 1.5], // 0.999 and over counts as all right, and only then does Sure pay
    [ch, 0.998, sure, "sure", 1],
    [ch, 1, { confidence: "fairly" }, "sure", 1],
    [ch, 0.999, {}, "correct", true],
    [ch, 0.998, {}, "correct", false],
    [ch, 1, { combo: 1 }, "streak", 1], // ×2 from the third right answer in a row, ×3 from the fifth
    [ch, 1, { combo: 2 }, "streak", 2],
    [ch, 1, { combo: 3 }, "streak", 2],
    [ch, 1, { combo: 4 }, "streak", 3],
    [ch, 0.9, { combo: 4 }, "streak", 1], // not fully right: the streak is over
    [ch, 1, { combo: 2, secondChance: true }, "streak", 1], // a second chance keeps it where it was
    [ch, 1, { combo: 3, secondChance: true }, "multiplier", 2],
    [ch, 1, { secondChance: true }, "second", 0.5],
  ];
  for (const [c, fraction, opts, part, want] of cases) {
    const s = score(c, fraction, opts);
    assert.equal(part in s ? s[part] : s.parts[part], want, `${part} at ${fraction} with ${JSON.stringify(opts)}`);
  }
});

test("bossBeaten: 80% or better, and nothing short of it", () => {
  assert.deepEqual(
    [bossBeaten(0.8), bossBeaten(1), bossBeaten(0.7999), bossBeaten(0.5), bossBeaten(0)],
    [true, true, false, false, false],
  );
  assert.equal(BOSS_PASS, 0.8);
});

test("max: what the same answer pays when everything is right, under the same Sure, streak and second chance", () => {
  const evaluate = { bloom: "evaluate" };
  assert.equal(score(evaluate, 2 / 3).max, 40);
  assert.equal(score(evaluate, 2 / 3, { confidence: "sure" }).max, 60); // Sure is only paid when all is right
  assert.equal(score(evaluate, 0.3, { combo: 1 }).max, 40);
  assert.equal(score(evaluate, 0.3, { combo: 2 }).max, 80); // a full answer would be the third in a row
  assert.equal(score(evaluate, 0.3, { combo: 4 }).max, 120);
  assert.equal(score(evaluate, 0.3, { secondChance: true }).max, 20);
  assert.equal(score(evaluate, 0.3, { secondChance: true, combo: 2 }).max, 20); // a second chance adds none to the streak
  assert.equal(score(evaluate, 0, { isBoss: true }).max, 100);
  assert.equal(score({ bloom: "understand" }, 0.3, { confidence: "sure" }).max, 23); // 22.5 rounds up, as points do
  const full = score(evaluate, 1, { confidence: "sure", combo: 2 });
  assert.equal(full.max, full.points);
});

test("points: the decimal is kept in exact and rounded once, halves up", () => {
  const understand = { bloom: "understand" };
  assert.ok(Math.abs(score({ bloom: "evaluate" }, 2 / 3).exact - 80 / 3) < 1e-9);
  assert.equal(score(understand, 1, { confidence: "sure" }).exact, 22.5);
  assert.equal(score(understand, 1, { confidence: "sure" }).points, 23);
});

const bundle = {
  chapters: [
    { chapter: 1, slug: "one", boss: "b1", challenges: ["a", "b", "c", "d", "e", "f", "b1"].map((id) => ({ id })) },
    { chapter: 2, slug: "two", boss: "b2", challenges: [{ id: "x" }, { id: "b2" }] },
    { chapter: 3, slug: "three", boss: "b3", challenges: [{ id: "y" }, { id: "b3" }] },
  ],
};
const ans = (challenge, day, correct, extra = {}) => ({
  kind: "answer",
  challenge,
  day,
  correct,
  fraction: correct ? 1 : 0,
  points: correct ? 10 : 0,
  ...extra,
});

test("progress: boss unlocks a chapter; a later day at 80% earns the second star", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const events = [
    ...ids.map((id) => ans(id, "2026-10-30", id !== "f")),
    ans("b1", "2026-10-30", true, { fraction: BOSS_PASS }),
    ...ids.map((id) => ans(id, "2026-11-02", id !== "a")),
  ];
  const p = progress(bundle, events, new Date("2026-11-02T10:00:00"), { interview_date: "2026-11-03" });
  assert.equal(p.chapters.one.bossBeaten, true);
  assert.equal(p.chapters.one.stars, 2);
  assert.equal(p.chapters.one.rank, "Competent");
  assert.equal(p.chapters.three.unlocked, true);
  assert.equal(p.daysLeft, 1);
  assert.ok(p.badges.some((b) => b.id === "first-boss"));
});

test("progress: second-chance answers don't count towards stars or accuracy", () => {
  const p = progress(
    bundle,
    [ans("x", "2026-10-30", false), ans("x", "2026-10-30", true, { second_chance: true })],
    new Date("2026-10-30T12:00:00"),
  );
  assert.equal(p.chapters.two.accuracy, 0);
  assert.equal(p.chapters.three.unlocked, false);
  assert.deepEqual(p.weakest, [{ id: "x", misses: 1 }]);
});

test("an open chapter is playable from the start and doesn't hold a place in the unlock order", () => {
  const b = {
    chapters: [
      { chapter: 1, slug: "one", boss: "b1", challenges: [{ id: "b1" }] },
      { chapter: 2, slug: "two", boss: "b2", challenges: [{ id: "b2" }] },
      { chapter: 3, slug: "three", boss: "b3", challenges: [{ id: "b3" }] },
      { chapter: 9, slug: "final", boss: "fb", open: true, challenges: [{ id: "fb" }] },
    ],
  };
  const p = progress(b, []);
  assert.deepEqual(Object.fromEntries(Object.entries(p.chapters).map(([k, v]) => [k, v.unlocked])), {
    one: true,
    two: true,
    three: false,
    final: true,
  });
});

test("an empty profile plays exactly like no profile, with no countdown", () => {
  const events = [ans("b1", "2026-10-30", true, { fraction: 1 })];
  const now = new Date("2026-10-30T12:00:00");
  const none = progress(bundle, events, now);
  assert.deepEqual(progress(bundle, events, now, {}), none);
  assert.equal(none.daysLeft, null);
  assert.equal(progress(bundle, events, now, { interview_date: "2026-11-03" }).daysLeft, 4);
});

test("unlocks never go backwards: a recorded unlock stays open when the bundle changes", () => {
  const events = [ans("b1", "2026-10-30", true, { fraction: 1 })];
  const p = progress(bundle, events);
  assert.deepEqual(p.newUnlocks, ["one", "two", "three"]);
  const recorded = [...events, ...p.newUnlocks.map((slug) => ({ kind: "unlock", slug }))];
  // Chapter one's boss changes (a personal layer switched off) and the old boss answer no longer matches by id:
  const changed = { chapters: [{ ...bundle.chapters[0], boss: "other" }, bundle.chapters[1], bundle.chapters[2]] };
  const q = progress(changed, recorded);
  assert.equal(q.chapters.three.unlocked, true);
  assert.deepEqual(q.newUnlocks, []);
});

test("jumping into a locked chapter opens that one only", () => {
  const p = progress(bundle, [{ kind: "unlock", slug: "three", chosen: true }]);
  assert.deepEqual(Object.fromEntries(Object.entries(p.chapters).map(([k, v]) => [k, v.unlocked])), {
    one: true,
    two: true,
    three: true,
  });
  const four = { chapters: [...bundle.chapters, { chapter: 4, slug: "four", boss: "b4", challenges: [{ id: "b4" }] }] };
  assert.equal(progress(four, [{ kind: "unlock", slug: "four", chosen: true }]).chapters.three.unlocked, false);
});

test("quests are always open, take no place in the order, and are recommended once ready", () => {
  const b = {
    chapters: [
      { chapter: 1, slug: "one", boss: "b1", challenges: [{ id: "b1" }] },
      { chapter: 2, slug: "two", boss: "b2", challenges: [{ id: "b2" }] },
      { chapter: 3, slug: "three", boss: "b3", challenges: [{ id: "b3" }] },
      { chapter: 9, slug: "q", kind: "quest", builds_on: [1], boss: "qb", challenges: [{ id: "qb" }] },
    ],
  };
  const p0 = progress(b, []);
  assert.deepEqual([p0.chapters.three.unlocked, p0.chapters.q.unlocked, p0.chapters.q.ready], [false, true, false]);
  assert.equal(recommend(b, p0).slug, "one");
  const p1 = progress(b, [ans("b1", "2026-10-30", true, { fraction: 1 })]);
  assert.equal(p1.chapters.q.ready, true);
  assert.equal(recommend(b, p1).slug, "q");
  const p2 = progress(b, [
    ans("b1", "2026-10-30", true, { fraction: 1 }),
    ans("qb", "2026-10-30", true, { fraction: 1 }),
  ]);
  assert.equal(recommend(b, p2).slug, "two");
});

test("a boss answer counts for its chapter even after the chapter's boss changes", () => {
  const changed = { chapters: [{ ...bundle.chapters[0], boss: "other" }, bundle.chapters[1], bundle.chapters[2]] };
  const p = progress(changed, [ans("p-boss", "2026-10-30", true, { fraction: 0.9, boss: true, chapter: 1 })]);
  assert.equal(p.chapters.one.bossBeaten, true);
  assert.equal(p.chapters.three.unlocked, true);
});

test("cleanProfile keeps known fields only, trimmed and checked", () => {
  const p = cleanProfile({
    name: "  Sam  ",
    company: "x".repeat(80),
    role: "",
    interview_type: "Mystery",
    interview_date: "2026-13-40",
    extra: "dropped",
    holds: { "mock-2": { lifts: "2026-11-01", lifted: "yes" }, "BAD ID": {} },
  });
  assert.deepEqual(p, {
    name: "Sam",
    company: "x".repeat(60),
    holds: { "mock-2": { lifts: "2026-11-01", lifted: false } },
  });
  assert.deepEqual(cleanProfile(null), {});
});

test("holdActive: lifted by hand, on its own date, else the day after the interview", () => {
  assert.equal(holdActive("m", {}, "2026-10-28"), true);
  assert.equal(holdActive("m", { holds: { m: { lifted: true } } }, "2026-10-28"), false);
  assert.equal(holdActive("m", { holds: { m: { lifts: "2026-10-30" } } }, "2026-10-29"), true);
  assert.equal(holdActive("m", { holds: { m: { lifts: "2026-10-30" } } }, "2026-10-30"), false);
  assert.equal(holdActive("m", { interview_date: "2026-11-03" }, "2026-11-03"), true);
  assert.equal(holdActive("m", { interview_date: "2026-11-03" }, "2026-11-04"), false);
});

test("run order puts the boss last", () => {
  const ch = { boss: "b", challenges: [{ id: "b" }, { id: "a" }, { id: "c" }] };
  assert.deepEqual(
    runOrder(ch).map((c) => c.id),
    ["a", "c", "b"],
  );
});

test("fmt: billions and millions in words, big numbers with commas, small ones to three figures", () => {
  assert.equal(fmt(2.5e9), "2.5 billion");
  assert.equal(fmt(1e9), "1 billion");
  assert.equal(fmt(3.2e6), "3.2 million");
  assert.equal(fmt(1e6), "1 million");
  assert.equal(fmt(123456), "123,456");
  assert.equal(fmt(10000), "10,000");
  assert.equal(fmt(999), "999");
  assert.equal(fmt(12.345), "12.3");
});

test("an unknown challenge type or estimate kind is an error, never a score", () => {
  assert.throws(() => check({ type: "riddle" }, {}), /unknown type riddle/);
  assert.throws(() => check({ type: "toString" }, {}), /unknown type toString/);
  assert.throws(() => generate({ kind: "guess", params: {} }, 1), /unknown generator guess/);
});

test("badges: each is earned exactly at its threshold", () => {
  const ids = (events, b = bundle) => progress(b, events).badges.map((x) => x.id);
  const sure = (n) => Array.from({ length: n }, (_, i) => ans(`s${i}`, "2026-10-30", true, { confidence: "sure" }));
  const bosses = ["b1", "b2", "b3"].map((id) => ans(id, "2026-10-30", true));
  assert.deepEqual(ids([]), []);
  assert.deepEqual(ids([], { chapters: [] }), []);
  assert.deepEqual(ids([ans("a", "2026-10-30", true, { combo: 4 })]), []);
  assert.deepEqual(ids([ans("a", "2026-10-30", true, { combo: 5 })]), ["combo-5"]);
  assert.deepEqual(ids(sure(9)), []);
  assert.deepEqual(ids([...sure(9), ans("x", "2026-10-30", false, { confidence: "sure" })]), []);
  assert.deepEqual(ids(sure(10)), ["sure-shot"]);
  assert.deepEqual(ids([ans("x", "2026-10-30", false, { second_chance: true })]), []);
  assert.deepEqual(ids([ans("x", "2026-10-30", true, { second_chance: true })]), ["comeback"]);
  assert.deepEqual(ids(bosses.slice(0, 2)), ["first-boss"]);
  const everything = [
    ...bosses,
    ans("a", "2026-10-30", true, { combo: 5 }),
    ...sure(10),
    ans("x", "2026-10-30", true, { second_chance: true }),
  ];
  assert.deepEqual(progress(bundle, everything).badges, [
    { id: "first-boss", label: "First boss beaten" },
    { id: "combo-5", label: "Five in a row" },
    { id: "sure-shot", label: "Ten sure and right" },
    { id: "comeback", label: "Got it on the second chance" },
    { id: "all-bosses", label: "Every boss beaten" },
  ]);
});

test("weekdays: days played out of the last five weekdays; the weekend never counts", () => {
  // Monday 2 November 2026: the last five weekdays are 27 to 30 October and 2 November.
  const days = ["2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30", "2026-10-27", "2026-10-26"];
  const p = progress(
    bundle,
    days.map((d) => ans("a", d, true)),
    new Date("2026-11-02T10:00:00"),
  );
  assert.equal(p.weekdays, 3);
});

test("weakest: the five challenges missed most at the first try, most missed first", () => {
  const misses = { a: 3, b: 1, c: 2, d: 4, e: 1, f: 5 };
  const events = Object.entries(misses).flatMap(([id, n]) =>
    Array.from({ length: n }, () => ans(id, "2026-10-30", false)),
  );
  events.push(ans("a", "2026-10-30", false, { second_chance: true }), ans("b", "2026-10-30", true));
  assert.deepEqual(progress(bundle, events).weakest, [
    { id: "f", misses: 5 },
    { id: "d", misses: 4 },
    { id: "a", misses: 3 },
    { id: "c", misses: 2 },
    { id: "b", misses: 1 },
  ]);
});

test("with every open chapter beaten, the recommendation is the one with the lowest first-try accuracy", () => {
  const b = {
    chapters: [
      { chapter: 1, slug: "one", boss: "b1", challenges: [{ id: "x1" }, { id: "b1" }] },
      { chapter: 2, slug: "two", boss: "b2", challenges: [{ id: "x2" }, { id: "b2" }] },
    ],
  };
  const events = [
    ans("b1", "2026-10-30", true),
    ans("x1", "2026-10-30", true),
    ans("b2", "2026-10-30", true),
    ans("x2", "2026-10-30", false),
  ];
  assert.equal(recommend(b, progress(b, events)).slug, "two");
});

test("a chapter is ready for its boss once every other challenge has had a first try, and not after the boss is beaten", () => {
  const rest = ["a", "b", "c", "d", "e", "f"];
  const day = "2026-10-30";
  const ready = (events) => progress(bundle, events).chapters.one.bossReady;
  assert.equal(ready([]), false);
  assert.equal(ready(rest.slice(1).map((id) => ans(id, day, true))), false);
  assert.equal(ready(rest.map((id) => ans(id, day, true))), true);
  // A miss is still a first try; a second chance on its own is not.
  assert.equal(ready(rest.map((id) => ans(id, day, id !== "c"))), true);
  assert.equal(
    ready([...rest.slice(1).map((id) => ans(id, day, true)), ans("a", day, true, { second_chance: true })]),
    false,
  );
  // A failed boss leaves it ready; a beaten one does not.
  assert.equal(ready([...rest, "b1"].map((id) => ans(id, day, true, id === "b1" ? { fraction: 0.5 } : {}))), true);
  assert.equal(ready([...rest, "b1"].map((id) => ans(id, day, true))), false);
  // A chapter that is only its boss has nothing else to play first.
  const alone = { chapters: [{ chapter: 1, slug: "solo", boss: "s", challenges: [{ id: "s" }] }] };
  assert.equal(progress(alone, [ans("s", day, false)]).chapters.solo.bossReady, false);
  // And a boss that is not among the chapter's challenges is nothing to try.
  const lost = { chapters: [{ chapter: 1, slug: "lost", boss: "gone", challenges: [{ id: "x" }, { id: "y" }] }] };
  assert.equal(progress(lost, [ans("x", day, true), ans("y", day, true)]).chapters.lost.bossReady, false);
});

test("a locked chapter counts how many more bosses open it", () => {
  const b = {
    chapters: [1, 2, 3, 4, 5].map((n) => ({ chapter: n, slug: `c${n}`, boss: `b${n}`, challenges: [{ id: `b${n}` }] })),
  };
  const need = (events) => Object.values(progress(b, events).chapters).map((c) => c.bossesToOpen);
  assert.deepEqual(need([]), [0, 0, 1, 2, 3]);
  assert.deepEqual(need([ans("b2", "2026-10-30", true)]), [0, 0, 0, 1, 2]);
  assert.deepEqual(need([ans("b1", "2026-10-30", true), ans("b2", "2026-10-30", true)]), [0, 0, 0, 0, 1]);
  // Jumping in anyway opens that chapter only, and it stops waiting.
  assert.deepEqual(need([{ kind: "unlock", slug: "c4", chosen: true }]), [0, 0, 1, 0, 3]);
});

test("every level of the ladder explains itself, word for word, and the tooltip names the whole ladder", () => {
  const ladder = "Levels go remember, understand, apply, analyse, evaluate, create.";
  assert.deepEqual(Object.keys(BLOOM_POINTS), ["remember", "understand", "apply", "analyse", "evaluate", "create"]);
  const says = {
    remember: "Remember: recall the fact.",
    understand: "Understand: explain it in your own words.",
    apply: "Apply: use it on a case you have not seen.",
    analyse: "Analyse: take a design apart and compare the parts.",
    evaluate: "Evaluate: weigh the options and defend a choice.",
    create: "Create: design something new.",
  };
  for (const [level, text] of Object.entries(says)) assert.equal(bloomHelp(level), `${text} ${ladder}`);
  // A level the game does not know still explains the ladder, rather than printing "undefined".
  assert.equal(bloomHelp("nonsense"), ladder);
  assert.equal(bloomHelp("constructor"), ladder);
});
