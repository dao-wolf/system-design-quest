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
  recall: (c) => c.key_points && [c.key_points.length, "key points"],
  multi: (c) => [c.correct.length, "right picks, less wrong ones"],
  sticker: (c) => [Object.values(c.answers).flat().length, "right stickers, less wrong ones"],
};

// The parts of an answer, if its type has any (a recall has them only when it has key points).
const partsOf = (c) => (Object.hasOwn(PARTS, c.type) ? PARTS[c.type](c) : undefined);

// What was right, short for the line and longer for the table: "2 of 3 parts" and "2 of 3 parts = 67%".
function shareWords(c, fraction, correct) {
  if (correct) return ["all right", "all of it"];
  const parts = partsOf(c);
  if (!parts) return [pct(fraction), pct(fraction)];
  const [total, noun] = parts;
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
    !s.correct && ["If all right", `+${s.max} (what it pays when all of it is right)`],
  ].filter(Boolean);
}

// What it takes to score, in the answer's own parts ("2 of 3 parts"). A type with no parts has no pass mark to show.
function needed(c) {
  const parts = partsOf(c);
  return parts ? `${Math.ceil(PASS_MARK * parts[0])} of ${parts[0]} ${parts[1]}` : null;
}

// ctx: whether it was a boss, how sure the player said they were (and whether Sure was offered), and the streak that
// just ended (0 if none). The note is there when the answer fell short of the pass mark.
export function receipt(c, fraction, s, ctx) {
  const name = label(c, ctx.isBoss);
  const [short, long] = shareWords(c, fraction, s.correct);
  const need = s.correct ? null : needed(c);
  return {
    line: lineOf(name, s.parts, short, s.points),
    note: need && s.parts.share === 0 ? `Needed to score: ${need}` : null,
    rows: rowsOf(name, need ? `${long} (${pct(PASS_MARK)} needed to score)` : long, s, ctx),
  };
}

const CONFIDENCE_NAMES = [
  ["sure", "Sure"],
  ["fairly", "Fairly"],
  ["guess", "Guess"],
];

const SURE_SAMPLE = 3; // the yardstick for Sure only means something once there are a few of them

// "On first tries: Sure 3 of 4 right · Fairly 1 of 1 right. Aim for your Sure to be right at least 4 times in 5."
// Null when nothing was rated.
export function calibrationLine(cal) {
  const parts = CONFIDENCE_NAMES.filter(([k]) => cal[k]).map(
    ([k, name]) => `${name} ${cal[k].right} of ${cal[k].n} right`,
  );
  if (!parts.length) return null;
  const yardstick = cal.sure?.n >= SURE_SAMPLE ? " Aim for your Sure to be right at least 4 times in 5." : "";
  return `On first tries: ${parts.join(" · ")}.${yardstick}`;
}

// Which of a list the player ticked, and which are left to add, in the order the list gives them.
export function coverage(items, ticked) {
  const got = new Set(ticked);
  return { covered: items.filter((_, i) => got.has(i)), next: items.filter((_, i) => !got.has(i)) };
}
