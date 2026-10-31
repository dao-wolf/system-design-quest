// The words of the receipt on a feedback card: its one line, and the rows of the table that works it out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { score, multiplier } from "../web/engine.js";
import { receipt } from "../web/receipt.js";

const duel = { type: "duel", bloom: "evaluate" };
const understand = { type: "multi", bloom: "understand", correct: [0, 2] };
const rows = (r) => Object.fromEntries(r.rows);

// Scores an answer as the game does, then words it.
function wording(c, fraction, opts = {}, ctx = {}) {
  const s = score(c, fraction, opts);
  const { isBoss = false, confidence = null } = opts;
  return receipt(c, fraction, s, { isBoss, confidence, sureOffered: true, ...ctx });
}

test("a partly right duel: the line, and a row for what each factor was", () => {
  const r = wording(duel, 2 / 3);
  assert.equal(r.line, "Evaluate 40 × 2 of 3 parts = +27");
  assert.deepEqual(r.rows, [
    ["Worth", "Evaluate: 40"],
    ["Right", "2 of 3 parts = 67%"],
    ["Sure bonus", "not used"],
    ["Streak", "×1 (3 right in a row gives ×2, 5 gives ×3)"],
    ["Total", "26.7 → +27"],
  ]);
});

test("the Sure row says what Sure did: added ×1.5, added nothing, was not used, or was not offered", () => {
  const right = wording(understand, 1, { confidence: "sure" });
  assert.equal(right.line, "Understand 15 × all right × Sure 1.5 = +23");
  assert.equal(rows(right).Right, "all of it");
  assert.equal(rows(right)["Sure bonus"], "×1.5 (Sure, and all of it right)");
  assert.equal(rows(right).Total, "22.5 → +23");
  const wrong = wording(understand, 0.5, { confidence: "sure" });
  assert.equal(rows(wrong)["Sure bonus"], "×1 (Sure pays only when all of it is right)");
  assert.equal(rows(wording(understand, 1, { confidence: "fairly" }))["Sure bonus"], "not used");
  const recall = wording({ type: "recall" }, 1, {}, { sureOffered: false });
  assert.equal(rows(recall)["Sure bonus"], "not offered for this kind of question");
});

test("the streak row: ×2 and ×3 name the run, ×1 explains the steps, and a streak that ended says why", () => {
  assert.equal(wording(duel, 1, { combo: 2 }).line, "Evaluate 40 × all right × streak 2 = +80");
  assert.equal(rows(wording(duel, 1, { combo: 2 })).Streak, "×2 (3 right in a row)");
  assert.equal(rows(wording(duel, 1, { combo: 4 })).Streak, "×3 (5 right in a row)");
  for (const streakLost of [2, 4]) {
    const ended = wording(duel, 0, { combo: streakLost }, { streakLost });
    assert.equal(rows(ended).Streak, "×1 (the streak ended: only fully right answers count)");
  }
  // Only a streak that ended is explained that way, and the steps in the sentence are the engine's own.
  assert.equal(rows(wording(duel, 0, { combo: 0 })).Streak, "×1 (3 right in a row gives ×2, 5 gives ×3)");
  assert.deepEqual([multiplier(2), multiplier(3), multiplier(4), multiplier(5)], [1, 2, 2, 3]);
});

test("a second chance has a row of its own, and says that it does not add to the streak", () => {
  const second = wording(understand, 1, { secondChance: true });
  assert.equal(second.line, "Understand 15 × all right × second chance 0.5 = +8");
  assert.deepEqual(
    second.rows.map(([k]) => k),
    ["Worth", "Right", "Sure bonus", "Streak", "Second chance", "Total"],
  );
  assert.equal(rows(second)["Second chance"], "×0.5 (second chances pay half)");
  assert.equal(rows(second).Streak, "×1 (a second chance keeps the streak where it was, and does not add to it)");
  assert.equal(rows(second).Total, "7.5 → +8");
});

test("a boss is worth 100 whatever its tag, and a tag the ladder does not know is called the base", () => {
  const r = wording(duel, 1, { isBoss: true });
  assert.equal(r.line, "Boss 100 × all right = +100");
  assert.equal(rows(r).Worth, "Boss: 100");
  assert.equal(wording({ type: "recall" }, 1).line, "Base 10 × all right = +10");
  assert.equal(wording({ type: "recall", bloom: "nonsense" }, 1).line, "Base 10 × all right = +10");
});

test("under the pass mark the line and the Right row say so, and a plain miss does not", () => {
  for (const fraction of [0.1, 1 / 3, 0.49]) {
    const under = wording(duel, fraction);
    assert.ok(under.line.endsWith(", under 50% = +0"), under.line);
    assert.ok(rows(under).Right.endsWith(" (under the 50% needed to score)"), rows(under).Right);
    assert.equal(rows(under).Total, "0 → +0"); // nothing is scored, so nothing is multiplied
  }
  assert.ok(!wording(duel, 0.5).line.includes("under"));
  const none = wording(duel, 0);
  assert.equal(none.line, "Evaluate 40 × 0 of 3 parts = +0");
  assert.equal(rows(none).Right, "0 of 3 parts = 0%");
});

test("the decimal is shown to one place, or two when one would look like it rounds the wrong way", () => {
  const lightning = { type: "lightning", bloom: "remember", pairs: Array(11).fill(0) };
  assert.equal(rows(wording(lightning, 6 / 11)).Total, "5.45 → +5"); // not 5.5 → +5
  assert.equal(rows(wording(lightning, 7 / 11)).Total, "6.4 → +6");
  assert.equal(rows(wording(duel, 2 / 3)).Total, "26.7 → +27");
});

test("each type counts its own parts, a type with none shows a percentage, and wrong picks are named", () => {
  const cases = [
    [{ type: "duel" }, 2 / 3, "2 of 3 parts"],
    [{ type: "flaw" }, 0.5, "1 of 2 parts"],
    [{ type: "write", key_points: Array(5).fill(0) }, 0.6, "3 of 5 key points"],
    [{ type: "sprint", checks: Array(4).fill(0) }, 0.75, "3 of 4 checks"],
    [{ type: "order", items: Array(4).fill(0) }, 0.75, "3 of 4 in the right place"],
    [{ type: "fill", slots: { x: "A", y: "B", z: "C" } }, 2 / 3, "2 of 3 slots right"],
    [{ type: "lightning", pairs: Array(4).fill(0) }, 0.75, "3 of 4 pairs"],
    [{ type: "multi", correct: [0, 1, 2] }, 2 / 3, "2 of 3 right picks, less wrong ones"],
    [{ type: "sticker", answers: { a: ["x"], b: ["y", "z"] } }, 2 / 3, "2 of 3 right stickers, less wrong ones"],
    [{ type: "recall" }, 0.5, "50%"],
    [{ type: "estimate" }, 0, "0%"],
  ];
  for (const [c, fraction, words] of cases) {
    const r = receipt(c, fraction, score(c, fraction), { isBoss: false, confidence: null, sureOffered: true });
    const pct = `${Math.round(fraction * 100)}%`;
    assert.ok(r.line.includes(` × ${words}`), `${c.type}: ${r.line}`);
    assert.equal(rows(r).Right, ["recall", "estimate"].includes(c.type) ? words : `${words} = ${pct}`, c.type);
  }
});
