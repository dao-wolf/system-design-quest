// Once an answer is in: score it with the engine, record it, count it towards the run, then show the feedback.
import { check, score } from "./engine.js";
import { app, prog } from "./state.js";
import { baseEvent, post, summarise } from "./store.js";
import { celebrate, renderStats } from "./stats.js";
import { feedback } from "./feedback.js";

// The answer can't change once it's in: everything but the feedback is switched off.
function lockAnswer({ card, feedbackSlot }) {
  card.querySelectorAll("button, input, textarea").forEach((el) => {
    if (!feedbackSlot.contains(el)) el.disabled = true;
  });
}

function answerEvent({ run, c, second, isBoss, state }, res, fraction, s) {
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
  // A written answer goes to the coach, when there is one.
  if (c.type === "write" && app.coach) Object.assign(ev, { coach: true, prompt: c.prompt });
  return ev;
}

// A first-try miss in the main run comes back for a second chance; a boss sets the run's boss result.
const comesBack = ({ run, second, isBoss }, s) => !s.correct && !second && !isBoss && run.phase === "main";
function tally(turn, fraction, s) {
  const { run, c, second, isBoss } = turn;
  run.answered++;
  run.points += s.points;
  if (s.correct) run.right++;
  run.bestCombo = Math.max(run.bestCombo, s.combo);
  run.results.push({ id: c.id, second, correct: s.correct, fraction, points: s.points, boss: isBoss });
  if (comesBack(turn, s)) run.misses.push(c);
  if (isBoss) run.bossResult = fraction;
}

// turn: the run, the challenge, whether it's a second chance or the boss, its state, its card and feedback slot.
// reveal: an optional callback that marks the right answer on the challenge itself.
export async function finishTurn(turn, res, reveal) {
  const { c, state } = turn;
  if (state.submitted) return;
  state.submitted = true;
  lockAnswer(turn);
  const { fraction } = check(c, res);
  const before = prog();
  const streak = app.combo;
  const s = score(c, fraction, {
    confidence: state.confidence,
    combo: app.combo,
    secondChance: turn.second,
    isBoss: turn.isBoss,
  });
  app.combo = s.combo;
  await post(answerEvent(turn, res, fraction, s));
  tally(turn, fraction, s);
  turn.comesBack = comesBack(turn, s);
  turn.streakLost = s.combo < streak && streak >= 2 ? Math.max(streak, turn.run.bestCombo) : 0;
  if (reveal) reveal(fraction);
  turn.feedbackSlot.replaceChildren(feedback(turn, res, fraction, s));
  celebrate(before, prog(), turn.isBoss && fraction >= 0.8);
  renderStats();
}
