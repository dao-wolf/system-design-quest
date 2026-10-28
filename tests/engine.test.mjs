// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  check,
  score,
  progress,
  generate,
  runOrder,
  cleanProfile,
  holdActive,
  recommend,
  BOSS_PASS,
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
