// The sum behind a card's points, in words: one line, and the rows of a table that works it out. Plain text, so the
// tests can read it without a page.
import { BLOOM_POINTS, PASS_MARK } from "./engine.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const cap = (word) => `${word[0].toUpperCase()}${word.slice(1)}`;

// How many parts an answer has and what to call one. A type left out shows a percentage. A pick that is wrong takes
// one right pick off, so the picks are counted net of the wrong ones.
const PARTS = {
  duel: () => [3, "parts"],
  flaw: () => [2, "parts"],
  write: (c) => [c.key_points.length, "key points"],
  sprint: (c) => [c.checks.length, "checks"],
  order: (c) => [c.items.length, "in the right place"],
  fill: (c) => [Object.keys(c.slots).length, "slots right"],
  lightning: (c) => [c.pairs.length, "pairs"],
  multi: (c) => [c.correct.length, "right picks, less wrong ones"],
  sticker: (c) => [Object.values(c.answers).flat().length, "right stickers, less wrong ones"],
};

// What was right, short for the line and longer for the table: "2 of 3 parts" and "2 of 3 parts = 67%".
function shareWords(c, fraction, correct) {
  if (correct) return ["all right", "all of it"];
  if (!Object.hasOwn(PARTS, c.type)) return [pct(fraction), pct(fraction)];
  const [total, noun] = PARTS[c.type](c);
  const count = `${Math.round(fraction * total)} of ${total} ${noun}`;
  return [count, `${count} = ${pct(fraction)}`];
}

const label = (c, isBoss) => (isBoss ? "Boss" : Object.hasOwn(BLOOM_POINTS, c.bloom) ? cap(c.bloom) : "Base");

function sureRow({ sure }, { confidence, sureOffered }) {
  if (sure > 1) return `×${sure} (Sure, and all of it right)`;
  if (!sureOffered) return "not offered for this kind of question";
  return confidence === "sure" ? "×1 (Sure pays only when all of it is right)" : "not used";
}

function streakRow({ streak, second }, combo, streakLost) {
  if (streak > 1) return `×${streak} (${combo} right in a row)`;
  if (streakLost) return "×1 (the streak ended: only fully right answers count)";
  if (second < 1) return "×1 (a second chance keeps the streak where it was, and does not add to it)";
  return "×1 (3 right in a row gives ×2, 5 gives ×3)";
}

// The decimal to one place, or to two when one place would look like it rounds the wrong way (5.45 is +5, not 5.5).
function exactText(exact, points) {
  const one = +exact.toFixed(1);
  return `${Math.round(one) === points ? one : +exact.toFixed(2)}`;
}

// Each factor that changed the points joins the line.
function lineOf(name, parts, share, points) {
  const factors = [
    `${name} ${parts.base}`,
    share,
    parts.sure > 1 && `Sure ${parts.sure}`,
    parts.streak > 1 && `streak ${parts.streak}`,
    parts.second < 1 && `second chance ${parts.second}`,
  ];
  return `${factors.filter(Boolean).join(" × ")} = +${points}`;
}

// The table shows every row, and a second chance only when it is one.
function rowsOf(name, right, s, ctx) {
  const { parts } = s;
  return [
    ["Worth", `${name}: ${parts.base}`],
    ["Right", right],
    ["Sure bonus", sureRow(parts, ctx)],
    ["Streak", streakRow(parts, s.combo, ctx.streakLost)],
    parts.second < 1 && ["Second chance", `×${parts.second} (second chances pay half)`],
    ["Total", `${exactText(s.exact, s.points)} → +${s.points}`],
  ].filter(Boolean);
}

// ctx: whether it was a boss, how sure the player said they were (and whether Sure was offered), and the streak that
// just ended (0 if none).
export function receipt(c, fraction, s, ctx) {
  const name = label(c, ctx.isBoss);
  const [short, long] = shareWords(c, fraction, s.correct);
  const under = s.parts.share === 0 && fraction > 0; // some of it right, but short of the pass mark
  const mark = pct(PASS_MARK);
  return {
    line: lineOf(name, s.parts, under ? `${short}, under ${mark}` : short, s.points),
    rows: rowsOf(name, under ? `${long} (under the ${mark} needed to score)` : long, s, ctx),
  };
}
